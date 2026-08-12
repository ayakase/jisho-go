# Jisho Go: Setup Manual Checklist

This file lists work that needs access to infrastructure or provider dashboards.

## 1. Apply D1 migrations

This project uses Drizzle ORM. `api/src/db/schema.ts` is the source of truth and
Drizzle generates SQL migration files in `api/migrations/`.

For a new D1 database, apply the single baseline migration:

```sh
yarn wrangler d1 migrations apply jisho-go --remote
```

Wrangler creates and maintains the `d1_migrations` table. For local development:

```sh
yarn wrangler d1 migrations apply jisho-go --local
```

After changing `api/src/db/schema.ts`, generate a new migration, review its SQL, then apply it:

```sh
cd api
yarn db:generate
yarn db:migrate:remote
```

After the database reset, sign in once through Google so the user row is created. Then grant the first owner role. Replace `OWNER_EMAIL` with that Google email:

```sh
yarn wrangler d1 execute jisho-go --remote --command="INSERT INTO user_roles (user_id, role_id) SELECT u.id, r.id FROM users u, roles r WHERE u.email = 'OWNER_EMAIL' AND r.code = 'owner';"
```

## 2. Configure Worker environment

For local development, copy `api/.dev.vars.example` to `api/.dev.vars` and fill in the required values.

For production, set secrets with Wrangler. Do not put secret values in `wrangler.jsonc` or Git:

```sh
cd api
yarn wrangler secret put OPENROUTER_API_KEY
yarn wrangler secret put GOOGLE_CLIENT_ID
yarn wrangler secret put GOOGLE_CLIENT_SECRET
yarn wrangler secret put AUTH_COOKIE_SECRET
yarn wrangler secret put SEPAY_WEBHOOK_API_KEY
```

The Admin console (`/admin`) can update non-secret AI billing and the base VietQR URL at runtime. Initial defaults remain in `api/src/config/app.ts`. CORS and OAuth settings intentionally remain source configuration because they are security-sensitive.

## 3. Configure SePay

1. Add the BIDV receiving account in SePay and create a webhook for the `Có tiền vào` event.
2. Set its URL to `https://<worker-host>/billing/sepay/webhook`.
3. Select API Key authentication in SePay and use the same value as `SEPAY_WEBHOOK_API_KEY`.
4. Create a wallet top-up from the website/extension. Transfer exactly the QR amount and leave the displayed `JISHO...` transfer content unchanged. The same user transfer content is reusable and does not create a pending order.
5. Confirm that the wallet ledger receives one `topup` entry only. SePay retries a webhook that does not receive a successful response.

The wallet exposes a reusable QR with a user-specific transfer content. The checkout endpoint only creates a variant with the selected amount prefilled; neither flow creates a pending order.

## 4. Deploy and verify

1. Deploy the Worker: `cd api && yarn deploy`.
2. Build/deploy the website with `PUBLIC_API_BASE_URL` pointing at the Worker.
3. In `api/src/config/app.ts`, set `auth.websiteOrigin` and `auth.extensionOrigin` when production CORS should be locked to those origins. Leaving both blank keeps the request-origin fallback.
4. Sign in, top up the wallet, then run an AI explanation from the extension.
5. Confirm that the Account page shows the top-up and the later AI charge.
6. Open `/admin` as the owner and verify the dashboard, logs, wallet adjustment, SePay transactions, and runtime config.

## Deferred work

- Production extension packaging/store submission.
- CI/CD deployment pipeline.
- Rewrite `website/README.md`, which is still the Astro starter README.
