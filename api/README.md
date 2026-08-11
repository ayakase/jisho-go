```txt
npm install
npm run dev
```

```txt
npm run deploy
```

## Billing (SePay)

Apply D1 migrations before deploying the billing code. Migration `0007_wallet_billing.sql`
creates the VND wallet ledger and the three top-up products:
`topup_20k`, `topup_50k`, and `topup_100k`.
Migration `0009_sepay_transactions.sql` records SePay `referenceCode` values so a
retried webhook cannot credit the wallet twice.

Configure these Worker secrets (never commit their values):

```txt
SEPAY_WEBHOOK_API_KEY
```

Create a SePay webhook for incoming money with API Key authentication. Set its URL to
`https://<worker-host>/billing/sepay/webhook`; SePay must send
`Authorization: Apikey <SEPAY_WEBHOOK_API_KEY>`.
The authenticated checkout endpoint is `POST /billing/checkout`. Its JSON body is
`{ "productCode": "topup_20k" }`; it creates a VietQR image with the exact amount and
the user's reusable transfer content. The API derives the user ID from the signed-in session.

`GET /billing/wallet` returns the current authenticated user's VND balance, available
products, and ledger entries. A successful AI response is charged
`ceil(usage.cost × usdToVnd × markupMultiplier)`, subject to the minimum charge.
Model, pricing, CORS, OAuth redirect and the default VietQR URL are in `src/config/app.ts`.

[For generating/synchronizing types based on your Worker configuration run](https://developers.cloudflare.com/workers/wrangler/commands/#types):

```txt
npm run cf-typegen
```

Pass the `CloudflareBindings` as generics when instantiation `Hono`:

```ts
// src/index.ts
const app = new Hono<{ Bindings: CloudflareBindings }>()
```
