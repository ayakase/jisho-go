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

Set non-secret billing settings in the Worker environment:

```txt
OPENROUTER_USD_TO_VND=26000
OPENROUTER_MARKUP_MULTIPLIER=3
AI_MINIMUM_BALANCE_VND=100
```

Their purpose and defaults are documented in `api/src/config/billing.ts`.

## 3. Configure PayOS

1. Create PayOS credentials and place them in the environment above.
2. Set `PAYOS_WEBHOOK_URL` to `https://<worker-host>/billing/payos/webhook`.
3. Set `PAYOS_RETURN_URL` and `PAYOS_CANCEL_URL` to `https://<website-host>/account`.
4. Register the same webhook URL in the PayOS dashboard.
5. Make a sandbox payment and confirm that the wallet ledger receives one `topup` entry only.

The Account page creates the checkout link and opens PayOS. PayOS owns the QR display on that checkout page.

## 4. Deploy and verify

1. Deploy the Worker: `cd api && npm run deploy`.
2. Build/deploy the website with `PUBLIC_API_BASE_URL` pointing at the Worker.
3. Configure `AUTH_WEB_ORIGIN` to the website origin and `AUTH_EXTENSION_ORIGIN` to the installed extension's origin when applicable.
4. Sign in, top up the wallet, then run an AI explanation from the extension.
5. Confirm that the Account page shows the top-up and the later AI charge.

## Deferred work

- Automated test suite for billing, OAuth and extension flows.
- Production extension packaging/store submission.
- CI/CD deployment pipeline.
- Rewrite `website/README.md`, which is still the Astro starter README.
