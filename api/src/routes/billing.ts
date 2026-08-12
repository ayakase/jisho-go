import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { getCookie } from 'hono/cookie'
import { resolveCorsOrigin } from '../config/app'
import { getRuntimeConfig, type SePayConfig } from '../services/runtime-config.service'
import { WalletService } from '../services/wallet.service'
import { and, eq } from 'drizzle-orm'
import { getDb } from '../db'
import { paymentProducts, sepayTransactions, users, walletLedgerEntries } from '../db/schema'
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

const TRANSFER_PREFIX = 'JISHO'

function createSePayQrUrl(config: SePayConfig, transferContent: string, amountVnd?: number): string {
  const url = new URL(config.qrCodeUrl)
  url.searchParams.set('addInfo', transferContent)
  if (amountVnd != null) url.searchParams.set('amount', String(amountVnd))
  else url.searchParams.delete('amount')
  return url.toString()
}

function hasValidSePayApiKey(authorization: string | undefined, apiKey: string | undefined): boolean {
  return !!apiKey && authorization === `Apikey ${apiKey}`
}

function transferContentForUser(userId: number): string {
  return `${TRANSFER_PREFIX}${userId}`
}

billing.get('/wallet', async (c) => {
  const db = c.env.DB
  if (!db) return c.json({ error: 'D1 binding "DB" is not configured' }, 500)
  const user = await getAuthenticatedUser(db, { sessionToken: getCookie(c, 'kg_session'), authorizationHeader: c.req.header('Authorization') })
  if (!user) return c.json({ error: 'Unauthorized' }, 401)
  const wallet = new WalletService(db)
  const runtimeConfig = await getRuntimeConfig(db)
  const transferContent = transferContentForUser(user.id)
  const orm = getDb(db)
  const [balance, entries, products] = await Promise.all([
    wallet.getBalance(user.id),
    wallet.listEntries(user.id),
    orm.select().from(paymentProducts).where(eq(paymentProducts.active, true)).orderBy(paymentProducts.amountVnd),
  ])
  return c.json({
    ...balance,
    transferContent,
    topupQrCode: createSePayQrUrl(runtimeConfig.sepay, transferContent),
    entries,
    products: products.map((product) => ({ code: product.code, amountVnd: product.amountVnd })),
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
  const selected = (await getDb(db).select().from(paymentProducts).where(and(eq(paymentProducts.code, productCode), eq(paymentProducts.active, true))).limit(1))[0]
  if (!selected) return c.json({ error: 'Unknown or inactive product' }, 404)
  const amountVnd = selected.amountVnd
  const runtimeConfig = await getRuntimeConfig(db)
  const transferContent = transferContentForUser(user.id)
  const qrCode = createSePayQrUrl(runtimeConfig.sepay, transferContent, amountVnd)
  return c.json({ amountVnd, transferContent, qrCode }, 201)
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
  const runtimeConfig = await getRuntimeConfig(db)
  const prefix = TRANSFER_PREFIX
  const userMatch = content.match(new RegExp(`\\b${prefix}(\\d+)\\b`))
  const userId = Number(userMatch?.[1])
  if (!referenceCode || !Number.isSafeInteger(userId) || !Number.isSafeInteger(amount) || amount <= 0) {
    return c.json({ ok: true, ignored: 'invalid_payment_details' })
  }
  const orm = getDb(db)
  const user = await orm.select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1)
  if (!user[0]) return c.json({ ok: true, ignored: 'user_not_found' })

  const payloadJson = JSON.stringify(body)
  await orm.insert(sepayTransactions).values({ referenceCode, userId, amountVnd: amount, transferContent: `${prefix}${userId}`, webhookPayloadJson: payloadJson }).onConflictDoNothing()
  const transaction = (await orm.select().from(sepayTransactions).where(eq(sepayTransactions.referenceCode, referenceCode)).limit(1))[0]
  if (!transaction) return c.json({ error: 'Unable to record SePay transaction' }, 500)
  if (transaction.userId !== userId || transaction.amountVnd !== amount) return c.json({ ok: true, ignored: 'reference_mismatch' })
  if (transaction.walletLedgerEntryId != null) return c.json({ ok: true, duplicate: true })

  try {
    const ledger = await new WalletService(db).createEntry({ userId, entryType: 'topup', amountVnd: amount, sepayTransactionId: transaction.id, note: `SePay ${referenceCode}` })
    await orm.update(sepayTransactions).set({ walletLedgerEntryId: ledger.id, webhookPayloadJson: payloadJson }).where(eq(sepayTransactions.id, transaction.id))
    return c.json({ ok: true, paid: true, ledgerEntryId: ledger.id })
  } catch (error) {
    const existingLedgerId = (await orm.select({ id: walletLedgerEntries.id }).from(walletLedgerEntries).where(eq(walletLedgerEntries.sepayTransactionId, transaction.id)).limit(1))[0]?.id
    if (existingLedgerId != null) {
      await orm.update(sepayTransactions).set({ walletLedgerEntryId: existingLedgerId, webhookPayloadJson: payloadJson }).where(eq(sepayTransactions.id, transaction.id))
      return c.json({ ok: true, duplicate: true })
    }
    throw error
  }
})

export default billing
