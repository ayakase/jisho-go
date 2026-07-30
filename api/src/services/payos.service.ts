type PayOSConfig = {
  clientId: string
  apiKey: string
  checksumKey: string
}

type PayOSPaymentRequest = {
  orderCode: number
  amount: number
  description: string
  returnUrl: string
  cancelUrl: string
}

export type PayOSPaymentLink = {
  checkoutUrl: string
  qrCode: string | null
}

function stablePayload(data: Record<string, unknown>): string {
  return Object.keys(data)
    .filter((key) => data[key] !== undefined && data[key] !== null && key !== 'signature')
    .sort()
    .map((key) => `${key}=${String(data[key])}`)
    .join('&')
}

async function hmacSha256Hex(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const bytes = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value)))
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export class PayOSService {
  constructor(private config: PayOSConfig) {}

  async createPaymentLink(request: PayOSPaymentRequest): Promise<PayOSPaymentLink> {
    const payload: Record<string, unknown> = {
      ...request,
      signature: await hmacSha256Hex(this.config.checksumKey, stablePayload(request)),
    }
    const response = await fetch('https://api-merchant.payos.vn/v2/payment-requests', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-client-id': this.config.clientId,
        'x-api-key': this.config.apiKey,
      },
      body: JSON.stringify(payload),
    })
    const raw = await response.text()
    let body: any = null
    try { body = raw ? JSON.parse(raw) : null } catch { /* handled below */ }
    const checkoutUrl = body?.data?.checkoutUrl
    if (!response.ok || typeof checkoutUrl !== 'string') {
      throw new Error(`PayOS payment-link creation failed: ${body?.desc || raw || response.status}`)
    }
    return {
      checkoutUrl,
      qrCode: typeof body?.data?.qrCode === 'string' ? body.data.qrCode : null,
    }
  }

  async verifyWebhookData(data: Record<string, unknown>, signature: string | undefined): Promise<boolean> {
    if (!signature) return false
    const expected = await hmacSha256Hex(this.config.checksumKey, stablePayload(data))
    if (signature.length !== expected.length) return false
    let different = 0
    for (let index = 0; index < signature.length; index += 1) different |= signature.charCodeAt(index) ^ expected.charCodeAt(index)
    return different === 0
  }
}
