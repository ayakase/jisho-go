import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { getCookie } from 'hono/cookie'
import { PayOSService } from '../services/payos.service'
import { WalletService } from '../services/wallet.service'
import { Bindings } from '../types'
import { getAuthenticatedUser } from '../utils/request-auth'

const billing = new Hono<{ Bindings: Bindings }>()

function isExtensionOrigin(origin: string | undefined): boolean {
  return !!origin && (origin.startsWith('chrome-extension://') || origin.startsWith('moz-extension://'))
}

billing.use(
  '*',
  cors({
    origin: (origin, c) => {
      const webOrigin = c.env.AUTH_WEB_ORIGIN?.trim()
      const extensionOrigin = c.env.AUTH_EXTENSION_ORIGIN?.trim()
      if (!webOrigin && !extensionOrigin) return origin || '*'
      if (isExtensionOrigin(origin)) return origin
      if (origin && (origin === webOrigin || origin === extensionOrigin)) return origin
      return webOrigin || extensionOrigin || origin || '*'
    },
    credentials: true,
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    allowHeaders: ['Authorization', 'Content-Type'],
  }),
)

function payosFromEnv(env: Bindings): PayOSService | null {
  if (!env.PAYOS_CLIENT_ID || !env.PAYOS_API_KEY || !env.PAYOS_CHECKSUM_KEY) return null
  return new PayOSService({ clientId: env.PAYOS_CLIENT_ID, apiKey: env.PAYOS_API_KEY, checksumKey: env.PAYOS_CHECKSUM_KEY })
}

function createOrderCode(): number {
  return Date.now() * 10 + Math.floor(Math.random() * 10)
}

billing.get('/wallet', async (c) => {
  const db = c.env.DB
  if (!db) return c.json({ error: 'D1 binding "DB" is not configured' }, 500)
  const user = await getAuthenticatedUser(db, { sessionToken: getCookie(c, 'kg_session'), authorizationHeader: c.req.header('Authorization') })
  if (!user) return c.json({ error: 'Unauthorized' }, 401)
  const wallet = new WalletService(db)
  const [balance, entries, products] = await Promise.all([
    wallet.getBalance(user.id),
    wallet.listEntries(user.id),
    db.prepare('SELECT code, amount_vnd FROM payment_products WHERE active = 1 ORDER BY amount_vnd ASC').all<{ code: string; amount_vnd: number }>(),
  ])
  return c.json({
    ...balance,
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
  const payos = payosFromEnv(c.env)
  if (!payos) return c.json({ error: 'Missing PayOS configuration' }, 500)
  const orderCode = createOrderCode()
  const amountVnd = Number(selected.amount_vnd)
  const returnUrl = c.env.PAYOS_RETURN_URL || c.env.AUTH_WEB_ORIGIN || 'http://localhost:4321/account'
  const cancelUrl = c.env.PAYOS_CANCEL_URL || returnUrl
  await db.prepare(`INSERT INTO payment_orders (user_id, product_code, order_code, amount_vnd, status) VALUES (?, ?, ?, ?, 'pending')`).bind(user.id, selected.code, orderCode, amountVnd).run()
  try {
    const payment = await payos.createPaymentLink({ orderCode, amount: amountVnd, description: `Jisho Go ${amountVnd} VND`, returnUrl, cancelUrl })
    await db.prepare("UPDATE payment_orders SET payment_link = ?, updated_at = CURRENT_TIMESTAMP WHERE order_code = ?").bind(payment.checkoutUrl, orderCode).run()
    return c.json({ orderCode, amountVnd, paymentLink: payment.checkoutUrl, qrCode: payment.qrCode }, 201)
  } catch (error) {
    await db.prepare("UPDATE payment_orders SET status = 'failed', updated_at = CURRENT_TIMESTAMP WHERE order_code = ?").bind(orderCode).run()
    return c.json({ error: error instanceof Error ? error.message : 'PayOS request failed' }, 502)
  }
})

billing.post('/payos/webhook', async (c) => {
  const db = c.env.DB
  const payos = payosFromEnv(c.env)
  if (!db || !payos) return c.json({ error: 'Billing is not configured' }, 500)
  const body = await c.req.json<{ code?: string; success?: boolean; data?: Record<string, unknown>; signature?: string }>()
  const data = body.data
  if (!data || !(await payos.verifyWebhookData(data, body.signature))) return c.json({ error: 'Invalid PayOS webhook signature' }, 400)
  const orderCode = Number(data.orderCode)
  const amount = Number(data.amount)
  if (!Number.isSafeInteger(orderCode) || !Number.isInteger(amount)) return c.json({ error: 'Invalid PayOS payment data' }, 400)
  const found = await db.prepare('SELECT id, user_id, amount_vnd, status FROM payment_orders WHERE order_code = ? LIMIT 1').bind(orderCode).all<{ id: number; user_id: number; amount_vnd: number; status: string }>()
  const order = found.results?.[0]
  if (!order) return c.json({ error: 'Payment order not found' }, 404)
  if (order.amount_vnd !== amount) return c.json({ error: 'Payment amount mismatch' }, 400)
  if (order.status === 'paid') return c.json({ ok: true, duplicate: true })
  if (body.success !== true || String(body.code).padStart(2, '0') !== '00') {
    await db.prepare("UPDATE payment_orders SET status = 'failed', webhook_payload_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(JSON.stringify(body), order.id).run()
    return c.json({ ok: true, paid: false })
  }
  const ledger = await new WalletService(db).createEntry({ userId: order.user_id, entryType: 'topup', amountVnd: order.amount_vnd, paymentOrderId: order.id, note: `PayOS order ${orderCode}` })
  await db.prepare("UPDATE payment_orders SET status = 'paid', paid_at = CURRENT_TIMESTAMP, webhook_payload_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(JSON.stringify(body), order.id).run()
  return c.json({ ok: true, paid: true, ledgerEntryId: ledger.id })
})

export default billing
