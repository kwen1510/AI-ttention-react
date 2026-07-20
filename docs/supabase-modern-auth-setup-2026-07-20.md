# Modern Supabase Auth and Realtime setup

> Superseded by `production-respin-runbook-2026-07-20.md`.

The application now uses Supabase-issued user JWTs, database-backed private-channel membership, opaque publishable/secret API keys, and encrypted teacher cookies. It does not need `SUPABASE_JWT_SECRET` and cannot mint Supabase JWTs.

## Supabase dashboard

1. In **Settings → API Keys**, create a publishable key and a separately named backend secret key.
2. In **Authentication → Providers**, enable anonymous sign-ins for student Realtime identities.
3. In **Authentication → Bot and Abuse Protection**, configure Cloudflare Turnstile or hCaptcha before public use.
4. In **Authentication → JWT Signing Keys**, migrate and rotate to the recommended ES256 key. Do not export or import a signing private key for this app.
5. Set the access-token lifetime to 10–15 minutes for bounded Realtime policy-cache revocation; do not go below five minutes.
6. In Realtime settings, require private channels.

## Database migration

Obtain the Supabase direct Postgres connection string, then run:

```sh
export DATABASE_URL='postgresql://...'
npm run db:migrate:realtime
```

This installs the four-hour classroom lifecycle, the private membership table, a non-exposed authorization function, and the `realtime.messages` SELECT policy. Browsers receive no table privileges and no Broadcast INSERT policy.

## DigitalOcean encrypted environment variables

```text
NODE_ENV=production
APP_PUBLIC_ORIGIN=https://your-domain.example
APP_ORIGINS=https://your-domain.example
SUPABASE_URL=https://PROJECT.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
SUPABASE_SECRET_KEY=sb_secret_...
AUTH_COOKIE_SECRET=<independent random 48-byte base64 value>
SESSION_JOIN_SECRET=<different independent random 48-byte base64 value>
AUTH_COOKIE_TTL_SECONDS=2592000
CLASSROOM_SESSION_TTL_MINUTES=240
ALLOW_LEGACY_TEACHER_ALLOWLIST=false
```

Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` during the frontend build, or replace the placeholders in `client/public/supabase-config.js`. Never place the secret key in a `VITE_*` variable or public file.

Remove `SUPABASE_JWT_SECRET`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` after the new deployment is verified. Deactivate legacy API keys in Supabase only after logs show no remaining use.

## Verification

1. Teacher OTP login survives a browser restart without local storage.
2. A teacher can create a session and connect to its teacher-only private topic.
3. Two student browsers receive distinct anonymous Supabase user IDs.
4. Each student receives only the student topic and its selected group topic.
5. Cross-group and teacher-topic subscription attempts return a channel authorization error.
6. Ending or expiring a session stops uploads, broadcasts the terminal event, and revokes all membership rows.
7. After the next JWT refresh, a deliberately retained client can no longer rejoin the channel.

Anonymous Auth records require scheduled cleanup. Delete expired membership rows frequently and anonymous `auth.users` records according to the school's retention policy (for example after 30 days), after confirming no active membership references them.
