import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { getCookie } from 'hono/cookie'
import { APP_CONFIG, resolveCorsOrigin } from '../config/app'
import { WalletService } from '../services/wallet.service'
import { Bindings } from '../types'
import { getAuthenticatedUser } from '../utils/request-auth'

const billing = new Hono<{ Bindings: Bindings }>()

billing.use(
  '*',
  cors({
    origin: (origin) => resolveCorsOrigin(origin),
    credentials: true,
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    allowHeaders: ['Authorization', 'Content-Type'],
  }),
)

function createSePayQrUrl(transferContent: string, amountVnd?: number): string {
  const { bank, accountNumber, accountHolder } = APP_CONFIG.sepay
  const params = new URLSearchParams({
    bank,
    acc: accountNumber,
    template: 'compact',
    addInfo: transferContent,
    holder: accountHolder,
  })
  if (amountVnd != null) params.set('amount', String(amountVnd))
  return `https://vietqr.app/img?${params.toString()}`
}

function hasValidSePayApiKey(authorization: string | undefined, apiKey: string | undefined): boolean {
  return !!apiKey && authorization === `Apikey ${apiKey}`
}

function transferContentForUser(userId: number): string {
  return `${APP_CONFIG.sepay.transferPrefix}${userId}`
}

billing.get('/wallet', async (c) => {
  const db = c.env.DB
  if (!db) return c.json({ error: 'D1 binding "DB" is not configured' }, 500)
  const user = await getAuthenticatedUser(db, { sessionToken: getCookie(c, 'kg_session'), authorizationHeader: c.req.header('Authorization') })
  if (!user) return c.json({ error: 'Unauthorized' }, 401)
  const wallet = new WalletService(db)
  const transferContent = transferContentForUser(user.id)
  const [balance, entries, products] = await Promise.all([
    wallet.getBalance(user.id),
    wallet.listEntries(user.id),
    db.prepare('SELECT code, amount_vnd FROM payment_products WHERE active = 1 ORDER BY amount_vnd ASC').all<{ code: string; amount_vnd: number }>(),
  ])
  return c.json({
    ...balance,
    transferContent,
    topupQrCode: createSePayQrUrl(transferContent),
    entries,
    products: (products.results ?? []).map((product) => ({ code: String(product.code), amountVnd: Number(product.amount_vnd) })),
  })
})

billing.post('/checkout', async (c) => {
  const db = c.env.DB
  if (!db) return c.json({ error: 'D1 binding "DB" is not configured' }, 500)
  const user = await getAuthenticatedUser(db, { sessionToken: getCookie(c, 'kg_session'), authorizationHeader: c.req.header('Authorization') })
  if (!user) return c.json({ error: 'Unauthorized' }, 401)

  let body: { productCode?: string }
  try {
    body = await c.req.json<{ productCode?: string }>()
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }
  const productCode = body.productCode?.trim()
  if (!productCode) return c.json({ error: 'productCode is required' }, 400)
  const product = await db.prepare('SELECT code, amount_vnd FROM payment_products WHERE code = ? AND active = 1 LIMIT 1').bind(productCode).all<{ code: string; amount_vnd: number }>()
  const selected = product.results?.[0]
  if (!selected) return c.json({ error: 'Unknown or inactive product' }, 404)
  const amountVnd = Number(selected.amount_vnd)
  const transferContent = transferContentForUser(user.id)
  const qrCode = createSePayQrUrl(transferContent, amountVnd)
  return c.json({ amountVnd, transferContent, paymentLink: qrCode, qrCode }, 201)
})

billing.post('/sepay/webhook', async (c) => {
  const db = c.env.DB
  if (!db) return c.json({ error: 'D1 binding "DB" is not configured' }, 500)
  if (!hasValidSePayApiKey(c.req.header('Authorization'), c.env.SEPAY_WEBHOOK_API_KEY)) {
    return c.json({ error: 'Unauthorized webhook' }, 401)
  }

  let body: { transferType?: unknown; transferAmount?: unknown; content?: unknown; referenceCode?: unknown }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }
  if (body.transferType !== 'in') return c.json({ ok: true, ignored: 'not_incoming' })
  const amount = Number(body.transferAmount)
  const content = typeof body.content === 'string' ? body.content.toUpperCase() : ''
  const referenceCode = typeof body.referenceCode === 'string' ? body.referenceCode.trim() : ''
  const prefix = APP_CONFIG.sepay.transferPrefix.toUpperCase()
  const userMatch = content.match(new RegExp(`\\b${prefix}(\\d+)\\b`))
  const userId = Number(userMatch?.[1])
  if (!referenceCode || !Number.isSafeInteger(userId) || !Number.isSafeInteger(amount) || amount <= 0) {
    return c.json({ ok: true, ignored: 'invalid_payment_details' })
  }
  const user = await db.prepare('SELECT id FROM users WHERE id = ? LIMIT 1').bind(userId).all<{ id: number }>()
  if (!user.results?.[0]) return c.json({ ok: true, ignored: 'user_not_found' })

  const payloadJson = JSON.stringify(body)
  await db.prepare(`INSERT OR IGNORE INTO sepay_transactions (reference_code, user_id, amount_vnd, transfer_content, webhook_payload_json) VALUES (?, ?, ?, ?, ?)`).bind(referenceCode, userId, amount, `${prefix}${userId}`, payloadJson).run()
  const transactionResult = await db.prepare('SELECT id, user_id, amount_vnd, wallet_ledger_entry_id FROM sepay_transactions WHERE reference_code = ? LIMIT 1').bind(referenceCode).all<{ id: number; user_id: number; amount_vnd: number; wallet_ledger_entry_id: number | null }>()
  const transaction = transactionResult.results?.[0]
  if (!transaction) return c.json({ error: 'Unable to record SePay transaction' }, 500)
  if (transaction.user_id !== userId || transaction.amount_vnd !== amount) return c.json({ ok: true, ignored: 'reference_mismatch' })
  if (transaction.wallet_ledger_entry_id != null) return c.json({ ok: true, duplicate: true })

  try {
    const ledger = await new WalletService(db).createEntry({ userId, entryType: 'topup', amountVnd: amount, sepayTransactionId: transaction.id, note: `SePay ${referenceCode}` })
    await db.prepare('UPDATE sepay_transactions SET wallet_ledger_entry_id = ?, webhook_payload_json = ? WHERE id = ?').bind(ledger.id, payloadJson, transaction.id).run()
    return c.json({ ok: true, paid: true, ledgerEntryId: ledger.id })
  } catch (error) {
    const existingLedger = await db.prepare('SELECT id FROM wallet_ledger_entries WHERE sepay_transaction_id = ? LIMIT 1').bind(transaction.id).all<{ id: number }>()
    const existingLedgerId = existingLedger.results?.[0]?.id
    if (existingLedgerId != null) {
      await db.prepare('UPDATE sepay_transactions SET wallet_ledger_entry_id = ?, webhook_payload_json = ? WHERE id = ?').bind(existingLedgerId, payloadJson, transaction.id).run()
      return c.json({ ok: true, duplicate: true })
    }
    throw error
  }
})

export default billing
