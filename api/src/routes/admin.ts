import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { getCookie } from 'hono/cookie'
import { resolveCorsOrigin } from '../config/app'
import { type SessionUser } from '../services/auth.service'
import { canManageConfig, canManageWallet, getUserRoles, hasAnyAdminRole, type AdminRole, writeAdminAuditLog } from '../services/admin.service'
import { getRuntimeConfig, invalidateRuntimeConfigCache, validateConfigValue } from '../services/runtime-config.service'
import { WalletService } from '../services/wallet.service'
import { Bindings } from '../types'
import { getAuthenticatedUser } from '../utils/request-auth'

type AdminEnv = {
  Bindings: Bindings
  Variables: { adminUser: SessionUser; adminRoles: AdminRole[] }
}

const admin = new Hono<AdminEnv>()

admin.use('*', cors({
  origin: (origin) => resolveCorsOrigin(origin),
  credentials: true,
  allowMethods: ['GET', 'POST', 'PUT', 'OPTIONS'],
  allowHeaders: ['Authorization', 'Content-Type'],
}))

admin.use('*', async (c, next) => {
  const db = c.env.DB
  if (!db) return c.json({ error: 'D1 binding "DB" is not configured' }, 500)
  const user = await getAuthenticatedUser(db, {
    sessionToken: getCookie(c, 'kg_session'),
    authorizationHeader: c.req.header('Authorization'),
  })
  if (!user) return c.json({ error: 'Unauthorized' }, 401)

  const roles = await getUserRoles(db, user.id)
  if (!hasAnyAdminRole(roles)) return c.json({ error: 'Forbidden' }, 403)
  c.set('adminUser', user)
  c.set('adminRoles', roles)
  await next()
})

function parseLimit(value: string | undefined, fallback = 50, max = 100): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.min(Math.max(Math.floor(parsed), 1), max) : fallback
}

function parseOffset(value: string | undefined): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.max(Math.floor(parsed), 0) : 0
}

admin.get('/me', (c) => c.json({ user: c.get('adminUser'), roles: c.get('adminRoles') }))

admin.get('/overview', async (c) => {
  const db = c.env.DB!
  const [users, wallet, requests, payments] = await Promise.all([
    db.prepare('SELECT COUNT(*) AS total FROM users').all<{ total: number }>(),
    db.prepare('SELECT COALESCE(SUM(amount_vnd), 0) AS total, COUNT(*) AS entries FROM wallet_ledger_entries').all<{ total: number; entries: number }>(),
    db.prepare('SELECT COUNT(*) AS total, COALESCE(SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END), 0) AS successful FROM openrouter_requests').all<{ total: number; successful: number }>(),
    db.prepare('SELECT COUNT(*) AS total, COALESCE(SUM(amount_vnd), 0) AS amount FROM sepay_transactions').all<{ total: number; amount: number }>(),
  ])
  return c.json({
    users: Number(users.results?.[0]?.total ?? 0),
    walletBalanceVnd: Number(wallet.results?.[0]?.total ?? 0),
    walletEntries: Number(wallet.results?.[0]?.entries ?? 0),
    requests: Number(requests.results?.[0]?.total ?? 0),
    successfulRequests: Number(requests.results?.[0]?.successful ?? 0),
    sepayTransactions: Number(payments.results?.[0]?.total ?? 0),
    sepayTopupVnd: Number(payments.results?.[0]?.amount ?? 0),
  })
})

admin.get('/users', async (c) => {
  const db = c.env.DB!
  const limit = parseLimit(c.req.query('limit'))
  const offset = parseOffset(c.req.query('offset'))
  const search = c.req.query('search')?.trim() ?? ''
  const like = `%${search}%`
  const rows = await db.prepare(`
    SELECT u.id, u.email, u.display_name, u.created_at, COALESCE(SUM(w.amount_vnd), 0) AS balance_vnd,
      GROUP_CONCAT(DISTINCT r.code) AS roles
    FROM users u
    LEFT JOIN wallet_ledger_entries w ON w.user_id = u.id
    LEFT JOIN user_roles ur ON ur.user_id = u.id
    LEFT JOIN roles r ON r.id = ur.role_id
    WHERE (? = '' OR u.email LIKE ? OR u.display_name LIKE ?)
    GROUP BY u.id
    ORDER BY u.id DESC
    LIMIT ? OFFSET ?
  `).bind(search, like, like, limit, offset).all<{ id: number; email: string; display_name: string | null; created_at: string; balance_vnd: number; roles: string | null }>()
  return c.json({ items: (rows.results ?? []).map((row) => ({ ...row, balanceVnd: Number(row.balance_vnd), roles: row.roles ? row.roles.split(',') : [] })), limit, offset })
})

admin.get('/users/:id/wallet', async (c) => {
  const db = c.env.DB!
  const userId = Number(c.req.param('id'))
  if (!Number.isSafeInteger(userId) || userId <= 0) return c.json({ error: 'Invalid user id' }, 400)
  const [balance, entries] = await Promise.all([new WalletService(db).getBalance(userId), new WalletService(db).listEntries(userId)])
  return c.json({ ...balance, entries })
})

admin.put('/users/:id/roles', async (c) => {
  if (!canManageConfig(c.get('adminRoles'))) return c.json({ error: 'Owner role required' }, 403)
  const userId = Number(c.req.param('id'))
  if (!Number.isSafeInteger(userId) || userId <= 0) return c.json({ error: 'Invalid user id' }, 400)
  let body: { roles?: unknown }
  try { body = await c.req.json() } catch { return c.json({ error: 'Invalid JSON body' }, 400) }
  if (!Array.isArray(body.roles) || body.roles.some((role) => !['owner', 'admin', 'support', 'viewer'].includes(String(role)))) {
    return c.json({ error: 'Roles are invalid' }, 400)
  }
  const roles = [...new Set(body.roles.map(String))]
  const db = c.env.DB!
  const user = await db.prepare('SELECT id FROM users WHERE id = ? LIMIT 1').bind(userId).all<{ id: number }>()
  if (!user.results?.[0]) return c.json({ error: 'User not found' }, 404)
  if (!roles.includes('owner')) {
    const owners = await db.prepare(`SELECT COUNT(*) AS total FROM user_roles ur INNER JOIN roles r ON r.id = ur.role_id WHERE r.code = 'owner' AND ur.user_id = ?`).bind(userId).all<{ total: number }>()
    const ownerCount = await db.prepare(`SELECT COUNT(*) AS total FROM user_roles ur INNER JOIN roles r ON r.id = ur.role_id WHERE r.code = 'owner'`).all<{ total: number }>()
    if (Number(owners.results?.[0]?.total ?? 0) > 0 && Number(ownerCount.results?.[0]?.total ?? 0) <= 1) {
      return c.json({ error: 'At least one owner role must remain' }, 400)
    }
  }
  await db.prepare('DELETE FROM user_roles WHERE user_id = ?').bind(userId).run()
  for (const role of roles) {
    await db.prepare('INSERT INTO user_roles (user_id, role_id, granted_by_user_id) SELECT ?, id, ? FROM roles WHERE code = ?').bind(userId, c.get('adminUser').id, role).run()
  }
  await writeAdminAuditLog(db, c.get('adminUser').id, 'user.roles.update', 'user', String(userId), { roles })
  return c.json({ userId, roles })
})

admin.post('/users/:id/wallet-adjustments', async (c) => {
  const roles = c.get('adminRoles')
  if (!canManageWallet(roles)) return c.json({ error: 'Owner or admin role required' }, 403)
  const userId = Number(c.req.param('id'))
  if (!Number.isSafeInteger(userId) || userId <= 0) return c.json({ error: 'Invalid user id' }, 400)
  let body: { amountVnd?: unknown; reason?: unknown }
  try { body = await c.req.json() } catch { return c.json({ error: 'Invalid JSON body' }, 400) }
  const amountVnd = Number(body.amountVnd)
  const reason = typeof body.reason === 'string' ? body.reason.trim() : ''
  if (!Number.isSafeInteger(amountVnd) || amountVnd === 0 || Math.abs(amountVnd) > 10_000_000 || reason.length < 3 || reason.length > 300) {
    return c.json({ error: 'Amount or reason is invalid' }, 400)
  }
  const db = c.env.DB!
  try {
    const entry = await new WalletService(db).createEntry({ userId, entryType: 'adjustment', amountVnd, note: `Admin adjustment: ${reason}` })
    await writeAdminAuditLog(db, c.get('adminUser').id, 'wallet.adjust', 'user', String(userId), { amountVnd, reason, ledgerEntryId: entry.id })
    return c.json({ entry }, 201)
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Unable to adjust wallet' }, 400)
  }
})

admin.get('/logs', async (c) => {
  const db = c.env.DB!
  const limit = parseLimit(c.req.query('limit'))
  const rows = await db.prepare(`SELECT id, created_at, user_id, query, model, success, status_code, duration_ms, error_message, usage_total_tokens, provider_cost_usd FROM openrouter_requests ORDER BY id DESC LIMIT ?`).bind(limit).all()
  return c.json({ items: rows.results ?? [] })
})

admin.get('/sepay-transactions', async (c) => {
  const db = c.env.DB!
  const limit = parseLimit(c.req.query('limit'))
  const rows = await db.prepare(`SELECT id, created_at, reference_code, user_id, amount_vnd, transfer_content, wallet_ledger_entry_id FROM sepay_transactions ORDER BY id DESC LIMIT ?`).bind(limit).all()
  return c.json({ items: rows.results ?? [] })
})

admin.get('/config', async (c) => {
  const db = c.env.DB!
  const [runtime, stored] = await Promise.all([
    getRuntimeConfig(db),
    db.prepare("SELECT key, value_json, version, updated_at, updated_by_user_id FROM app_config WHERE key IN ('ai_billing', 'sepay') ORDER BY key").all(),
  ])
  return c.json({ runtime, stored: stored.results ?? [] })
})

admin.put('/config/:key', async (c) => {
  if (!canManageConfig(c.get('adminRoles'))) return c.json({ error: 'Owner role required' }, 403)
  const key = c.req.param('key')
  let body: { value?: unknown }
  try { body = await c.req.json() } catch { return c.json({ error: 'Invalid JSON body' }, 400) }
  const value = validateConfigValue(key, body.value)
  if (!value) return c.json({ error: 'Configuration does not match the allowed schema' }, 400)
  const db = c.env.DB!
  const serialized = JSON.stringify(value)
  await db.prepare(`INSERT INTO app_config (key, value_json, version, updated_by_user_id) VALUES (?, ?, 1, ?) ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, version = app_config.version + 1, updated_at = CURRENT_TIMESTAMP, updated_by_user_id = excluded.updated_by_user_id`).bind(key, serialized, c.get('adminUser').id).run()
  invalidateRuntimeConfigCache()
  await writeAdminAuditLog(db, c.get('adminUser').id, 'config.update', 'app_config', key, { value })
  return c.json({ key, value })
})

admin.get('/audit-logs', async (c) => {
  const db = c.env.DB!
  const limit = parseLimit(c.req.query('limit'))
  const rows = await db.prepare(`SELECT a.id, a.created_at, a.actor_user_id, u.email AS actor_email, a.action, a.target_type, a.target_id, a.detail_json FROM admin_audit_logs a INNER JOIN users u ON u.id = a.actor_user_id ORDER BY a.id DESC LIMIT ?`).bind(limit).all()
  return c.json({ items: rows.results ?? [] })
})

export default admin
