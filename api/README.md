```txt
yarn install
yarn dev
```

```txt
yarn deploy
```

## Billing (SePay)

The API uses Drizzle ORM with Cloudflare D1. `src/db/schema.ts` is the schema source
of truth; Drizzle Kit generates SQL in `migrations/`, which Wrangler applies and
records in D1's `d1_migrations` table.

```sh
# After changing src/db/schema.ts
yarn db:generate
yarn db:migrate:local
yarn db:migrate:remote
```

The initial migration creates the VND wallet ledger, top-up products, roles, runtime
config, and SePay transaction table. SePay `referenceCode` values prevent retried
webhooks from crediting a wallet twice.

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
yarn cf-typegen
```

Pass the `CloudflareBindings` as generics when instantiation `Hono`:

```ts
// src/index.ts
const app = new Hono<{ Bindings: CloudflareBindings }>()
```
