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

## 2. Configure Worker environment

For local development, copy `api/.dev.vars.example` to `api/.dev.vars` and fill in the required values.

For production, set secrets with Wrangler. Do not put secret values in `wrangler.jsonc` or Git:

```sh
cd api
npx wrangler secret put OPENROUTER_API_KEY
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
npx wrangler secret put AUTH_COOKIE_SECRET
npx wrangler secret put PAYOS_CLIENT_ID
npx wrangler secret put PAYOS_API_KEY
npx wrangler secret put PAYOS_CHECKSUM_KEY
```

Non-secret settings, including the AI model, pricing, CORS, OAuth redirect, and PayOS return URLs, are in `api/src/config/app.ts`. Change that file and redeploy the Worker.

## 3. Configure PayOS

1. Create PayOS credentials and place them in the environment above.
2. Register `https://<worker-host>/billing/payos/webhook` in the PayOS dashboard.
3. Set an explicit return/cancel URL in `api/src/config/app.ts` only when the automatic request-origin fallback is not appropriate.
4. Make a sandbox payment and confirm that the wallet ledger receives one `topup` entry only.

The Account page creates the checkout link and opens PayOS. PayOS owns the QR display on that checkout page.

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
