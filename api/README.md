```txt
npm install
npm run dev
```

```txt
npm run deploy
```

## Billing (PayOS)

Apply D1 migrations before deploying the billing code. Migration `0007_wallet_billing.sql`
creates the VND wallet ledger, payment orders, and the three top-up products:
`topup_20k`, `topup_50k`, and `topup_100k`.

Configure these Worker secrets (never commit their values):

```txt
PAYOS_CLIENT_ID
PAYOS_API_KEY
PAYOS_CHECKSUM_KEY
```

Set PayOS's webhook URL to `https://<worker-host>/billing/payos/webhook`.
The authenticated checkout endpoint is `POST /billing/checkout`. Its JSON body is
`{ "productCode": "topup_20k" }`; the API derives the user ID from the signed-in session.

`GET /billing/wallet` returns the current authenticated user's VND balance, available
products, and ledger entries. A successful AI response is charged
`ceil(usage.cost × usdToVnd × markupMultiplier)`, subject to the minimum charge.
Model, pricing, CORS, OAuth redirect and payment URLs are in `src/config/app.ts`.

[For generating/synchronizing types based on your Worker configuration run](https://developers.cloudflare.com/workers/wrangler/commands/#types):

```txt
npm run cf-typegen
```

Pass the `CloudflareBindings` as generics when instantiation `Hono`:

```ts
// src/index.ts
const app = new Hono<{ Bindings: CloudflareBindings }>()
```
