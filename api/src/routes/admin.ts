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
import { and, asc, count, desc, eq, inArray, like, or, sql } from 'drizzle-orm'
import { getDb } from '../db'
import { adminAuditLogs, appConfig, openrouterRequests, paymentProducts, roles as rolesTable, sepayTransactions, userRoles, users, walletLedgerEntries } from '../db/schema'

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
  const db = getDb(c.env.DB!)
  const [userTotals, wallet, requests, payments] = await Promise.all([
    db.select({ total: count() }).from(users),
    db.select({
      total: sql<number>`COALESCE(SUM(${walletLedgerEntries.amountVnd}), 0)`,
      topup: sql<number>`COALESCE(SUM(CASE WHEN ${walletLedgerEntries.amountVnd} > 0 THEN ${walletLedgerEntries.amountVnd} ELSE 0 END), 0)`,
      aiSpent: sql<number>`COALESCE(SUM(CASE WHEN ${walletLedgerEntries.amountVnd} < 0 THEN -${walletLedgerEntries.amountVnd} ELSE 0 END), 0)`,
      entries: count(),
    }).from(walletLedgerEntries),
    db.select({ total: count(), successful: sql<number>`COALESCE(SUM(CASE WHEN ${openrouterRequests.success} THEN 1 ELSE 0 END), 0)` }).from(openrouterRequests),
    db.select({ total: count(), amount: sql<number>`COALESCE(SUM(${sepayTransactions.amountVnd}), 0)` }).from(sepayTransactions),
  ])
  return c.json({
    users: userTotals[0]?.total ?? 0, walletBalanceVnd: Number(wallet[0]?.total ?? 0), walletTopupVnd: Number(wallet[0]?.topup ?? 0), walletAiSpentVnd: Number(wallet[0]?.aiSpent ?? 0), walletEntries: wallet[0]?.entries ?? 0,
    requests: requests[0]?.total ?? 0, successfulRequests: Number(requests[0]?.successful ?? 0), sepayTransactions: payments[0]?.total ?? 0, sepayTopupVnd: Number(payments[0]?.amount ?? 0),
  })
})

admin.get('/users', async (c) => {
  const db = getDb(c.env.DB!)
  const limit = parseLimit(c.req.query('limit'))
  const offset = parseOffset(c.req.query('offset'))
  const search = c.req.query('search')?.trim() ?? ''
  const condition = search ? or(like(users.email, `%${search}%`), like(users.displayName, `%${search}%`)) : undefined
  const rows = await db.select({
    id: users.id,
    email: users.email,
    displayName: users.displayName,
    createdAt: users.createdAt,
    balanceVnd: sql<number>`COALESCE((SELECT SUM(amount_vnd) FROM wallet_ledger_entries WHERE user_id = ${users.id}), 0)`,
    topupVnd: sql<number>`COALESCE((SELECT SUM(amount_vnd) FROM wallet_ledger_entries WHERE user_id = ${users.id} AND amount_vnd > 0), 0)`,
    aiSpentVnd: sql<number>`COALESCE((SELECT SUM(-amount_vnd) FROM wallet_ledger_entries WHERE user_id = ${users.id} AND amount_vnd < 0), 0)`,
    roles: sql<string | null>`GROUP_CONCAT(DISTINCT ${rolesTable.code})`,
  }).from(users).leftJoin(userRoles, eq(userRoles.userId, users.id)).leftJoin(rolesTable, eq(rolesTable.id, userRoles.roleId)).where(condition).groupBy(users.id).orderBy(desc(users.id)).limit(limit).offset(offset)
  return c.json({ items: rows.map((row) => ({ ...row, balanceVnd: Number(row.balanceVnd), topupVnd: Number(row.topupVnd), aiSpentVnd: Number(row.aiSpentVnd), roles: row.roles ? row.roles.split(',') : [] })), limit, offset })
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
  const binding = c.env.DB!
  const db = getDb(binding)
  const user = await db.select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1)
  if (!user[0]) return c.json({ error: 'User not found' }, 404)
  if (!roles.includes('owner')) {
    const [owners, ownerCount] = await Promise.all([
      db.select({ total: count() }).from(userRoles).innerJoin(rolesTable, eq(rolesTable.id, userRoles.roleId)).where(and(eq(rolesTable.code, 'owner'), eq(userRoles.userId, userId))),
      db.select({ total: count() }).from(userRoles).innerJoin(rolesTable, eq(rolesTable.id, userRoles.roleId)).where(eq(rolesTable.code, 'owner')),
    ])
    if ((owners[0]?.total ?? 0) > 0 && (ownerCount[0]?.total ?? 0) <= 1) {
      return c.json({ error: 'At least one owner role must remain' }, 400)
    }
  }
  await db.delete(userRoles).where(eq(userRoles.userId, userId))
  for (const role of roles) {
    const roleRow = (await db.select({ id: rolesTable.id }).from(rolesTable).where(eq(rolesTable.code, role as 'owner' | 'admin' | 'support' | 'viewer')).limit(1))[0]
    if (roleRow) await db.insert(userRoles).values({ userId, roleId: roleRow.id, grantedByUserId: c.get('adminUser').id })
  }
  await writeAdminAuditLog(binding, c.get('adminUser').id, 'user.roles.update', 'user', String(userId), { roles })
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
  const db = getDb(c.env.DB!)
  const limit = parseLimit(c.req.query('limit'))
  const rows = await db.select({ id: openrouterRequests.id, created_at: openrouterRequests.createdAt, user_id: openrouterRequests.userId, query: openrouterRequests.query, model: openrouterRequests.model, success: openrouterRequests.success, status_code: openrouterRequests.statusCode, duration_ms: openrouterRequests.durationMs, error_message: openrouterRequests.errorMessage, usage_total_tokens: openrouterRequests.usageTotalTokens, provider_cost_usd: openrouterRequests.providerCostUsd }).from(openrouterRequests).orderBy(desc(openrouterRequests.id)).limit(limit)
  return c.json({ items: rows })
})

admin.get('/sepay-transactions', async (c) => {
  const db = getDb(c.env.DB!)
  const limit = parseLimit(c.req.query('limit'))
  const rows = await db.select({ id: sepayTransactions.id, created_at: sepayTransactions.createdAt, reference_code: sepayTransactions.referenceCode, user_id: sepayTransactions.userId, amount_vnd: sepayTransactions.amountVnd, transfer_content: sepayTransactions.transferContent, wallet_ledger_entry_id: sepayTransactions.walletLedgerEntryId }).from(sepayTransactions).orderBy(desc(sepayTransactions.id)).limit(limit)
  return c.json({ items: rows })
})

admin.get('/config', async (c) => {
  const binding = c.env.DB!
  const db = getDb(binding)
  const [runtime, stored] = await Promise.all([
    getRuntimeConfig(binding),
    db.select().from(appConfig).where(inArray(appConfig.key, ['ai_billing', 'sepay'])).orderBy(asc(appConfig.key)),
  ])
  return c.json({ runtime, stored })
})

admin.get('/payment-products', async (c) => {
  const rows = await getDb(c.env.DB!).select().from(paymentProducts).orderBy(asc(paymentProducts.amountVnd))
  return c.json({ items: rows })
})

admin.put('/payment-products/:code', async (c) => {
  if (!canManageConfig(c.get('adminRoles'))) return c.json({ error: 'Owner role required' }, 403)
  const code = c.req.param('code').trim()
  if (!/^[a-z0-9][a-z0-9_-]{1,39}$/.test(code)) return c.json({ error: 'Invalid product code' }, 400)
  let body: { amountVnd?: unknown; active?: unknown }
  try { body = await c.req.json() } catch { return c.json({ error: 'Invalid JSON body' }, 400) }
  const amountVnd = Number(body.amountVnd)
  if (!Number.isSafeInteger(amountVnd) || amountVnd < 1_000 || amountVnd > 10_000_000) return c.json({ error: 'Invalid amount' }, 400)
  const active = body.active !== false
  const db = getDb(c.env.DB!)
  await db.insert(paymentProducts).values({ code, amountVnd, active }).onConflictDoUpdate({ target: paymentProducts.code, set: { amountVnd, active } })
  await writeAdminAuditLog(c.env.DB!, c.get('adminUser').id, 'payment_product.update', 'payment_product', code, { amountVnd, active })
  return c.json({ code, amountVnd, active })
})

admin.put('/config/:key', async (c) => {
  if (!canManageConfig(c.get('adminRoles'))) return c.json({ error: 'Owner role required' }, 403)
  const key = c.req.param('key')
  let body: { value?: unknown }
  try { body = await c.req.json() } catch { return c.json({ error: 'Invalid JSON body' }, 400) }
  const value = validateConfigValue(key, body.value)
  if (!value) return c.json({ error: 'Configuration does not match the allowed schema' }, 400)
  const binding = c.env.DB!
  const db = getDb(binding)
  const serialized = JSON.stringify(value)
  await db.insert(appConfig).values({ key, valueJson: serialized, updatedByUserId: c.get('adminUser').id }).onConflictDoUpdate({ target: appConfig.key, set: { valueJson: serialized, version: sql`${appConfig.version} + 1`, updatedAt: new Date().toISOString(), updatedByUserId: c.get('adminUser').id } })
  invalidateRuntimeConfigCache()
  await writeAdminAuditLog(binding, c.get('adminUser').id, 'config.update', 'app_config', key, { value })
  return c.json({ key, value })
})

admin.get('/audit-logs', async (c) => {
  const db = getDb(c.env.DB!)
  const limit = parseLimit(c.req.query('limit'))
  const rows = await db.select({ id: adminAuditLogs.id, created_at: adminAuditLogs.createdAt, actor_user_id: adminAuditLogs.actorUserId, actor_email: users.email, action: adminAuditLogs.action, target_type: adminAuditLogs.targetType, target_id: adminAuditLogs.targetId, detail_json: adminAuditLogs.detailJson }).from(adminAuditLogs).innerJoin(users, eq(users.id, adminAuditLogs.actorUserId)).orderBy(desc(adminAuditLogs.id)).limit(limit)
  return c.json({ items: rows })
})

export default admin
