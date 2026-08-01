# Jisho Go: Setup Manual Checklist

This file lists work that needs access to infrastructure or provider dashboards.

## 1. Apply D1 migrations

From `api/`, first inspect the remote migration history:

```sh
npx wrangler d1 execute DB --remote --command="SELECT * FROM d1_migrations ORDER BY id;"
```

If earlier migrations are tracked there, apply all pending migrations, including wallet billing (`0007`) and removal of the obsolete request payload (`0008`):

```sh
npx wrangler d1 migrations apply DB --remote
```

For a local database, use `--local` instead of `--remote`.

If this database was originally updated with `d1 execute` and has no `d1_migrations` table, do not run `migrations apply` blindly: it will try old migrations again. Apply only the required SQL files manually after inspecting the current schema.

For the SePay reusable-QR flow, apply `0009` after `0007`:

```sh
npx wrangler d1 execute jisho-go --remote --file=./migrations/0009_sepay_transactions.sql
```

## 2. Configure Worker environment

For local development, copy `api/.dev.vars.example` to `api/.dev.vars` and fill in the required values.

For production, set secrets with Wrangler. Do not put secret values in `wrangler.jsonc` or Git:

```sh
cd api
npx wrangler secret put OPENROUTER_API_KEY
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
npx wrangler secret put AUTH_COOKIE_SECRET
npx wrangler secret put SEPAY_WEBHOOK_API_KEY
```

Non-secret settings, including the AI model, pricing, CORS, OAuth redirect, and SePay receiving account, are in `api/src/config/app.ts`. Change that file and redeploy the Worker.

## 3. Configure SePay

1. Add the BIDV receiving account in SePay and create a webhook for the `Có tiền vào` event.
2. Set its URL to `https://<worker-host>/billing/sepay/webhook`.
3. Select API Key authentication in SePay and use the same value as `SEPAY_WEBHOOK_API_KEY`.
4. Create a wallet top-up from the website/extension. Transfer exactly the QR amount and leave the displayed `JISHO...` transfer content unchanged. The same user transfer content is reusable and does not create a pending order.
5. Confirm that the wallet ledger receives one `topup` entry only. SePay retries a webhook that does not receive a successful response.

The wallet exposes a reusable QR with a user-specific transfer content. The checkout endpoint only creates a variant with the selected amount prefilled; neither flow creates a pending order.

## 4. Deploy and verify

1. Deploy the Worker: `cd api && npm run deploy`.
2. Build/deploy the website with `PUBLIC_API_BASE_URL` pointing at the Worker.
3. In `api/src/config/app.ts`, set `auth.websiteOrigin` and `auth.extensionOrigin` when production CORS should be locked to those origins. Leaving both blank keeps the request-origin fallback.
4. Sign in, top up the wallet, then run an AI explanation from the extension.
5. Confirm that the Account page shows the top-up and the later AI charge.

## Deferred work

- Production extension packaging/store submission.
- CI/CD deployment pipeline.
- Rewrite `website/README.md`, which is still the Astro starter README.
