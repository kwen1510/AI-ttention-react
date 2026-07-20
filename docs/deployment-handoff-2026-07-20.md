# Secure login, classroom expiry, and private Realtime handoff

> Superseded by `production-respin-runbook-2026-07-20.md`.

## Supabase SQL

Run these files in the Supabase SQL editor in this order:

1. `server/db/migrations/20260720_classroom_session_lifecycle.sql`
2. `server/db/migrations/20260720_native_realtime_memberships.sql`

Before enabling private-only channels, inspect every Realtime read policy:

```sql
select policyname, roles, cmd, qual
from pg_policies
where schemaname = 'realtime'
  and tablename = 'messages';
```

The AI-ttention policy should be the only permissive `SELECT` policy used by this
project. PostgreSQL combines permissive policies with `OR`; an older policy that
allows every authenticated user would bypass topic scoping. Do not delete a
policy used by another application without reviewing that application first.

After the policy is applied and the new app version is deployed, open Supabase
Realtime Settings and enable private-only channels. This disconnects existing
clients once; reconnecting clients will use the new private authorization flow.

## DigitalOcean secrets

Add these encrypted environment variables:

- `AUTH_COOKIE_SECRET`: independent random value, at least 32 characters.
- `SESSION_JOIN_SECRET`: independent random value, at least 32 characters.
- `SUPABASE_SECRET_KEY`: a new `sb_secret_...` backend key; server-only.
- `SUPABASE_PUBLISHABLE_KEY`: a new `sb_publishable_...` key.
- `CLASSROOM_SESSION_TTL_MINUTES=240`: four-hour classroom lifetime.
- `AUTH_COOKIE_TTL_SECONDS=2592000`: 30-day teacher login.
- `APP_PUBLIC_ORIGIN=https://ai-ttention-4lawq.ondigitalocean.app`
- `ALLOW_LEGACY_TEACHER_ALLOWLIST=false`: require active `teacher_access` rows.

Never place the three secrets in `client/public/supabase-config.js` or any
`VITE_*` variable. The anon/publishable key remains safe to expose in the client.

## Security model

- Teacher OTP verification happens on the server. The browser receives a signed,
  encrypted `HttpOnly`, `Secure`, `SameSite=Strict` app cookie and stores no Supabase session in
  local storage.
- Private Realtime uses Supabase-issued user JWTs and database memberships.
- A teacher JWT can read only `...:teacher` for the session it created.
- A student JWT can read only `...:students` and its own `...:group:N` channel.
- Browsers have no Realtime `INSERT` policy; all broadcasts originate from the
  server's service-role client.
- Ending or expiring a class broadcasts stop, allows 15 seconds for the final
  audio chunk, then sends a terminal event and removes student subscriptions.

## Deployment order

1. Apply the SQL migrations.
2. Add the DigitalOcean secrets.
3. Deploy the new GitHub revision.
4. Verify teacher OTP login and cookie restoration after a browser restart.
5. Test two student groups and confirm each group sees only its own transcript.
6. End the session and confirm both student views return to the join screen.
7. Enable private-only Realtime channels after the private flow is confirmed.
