# AI(ttention) secure production re-spin runbook

This is the authoritative setup, archive, migration, deployment, validation, and rollback procedure. Stop at every gate. A later gate never substitutes for a failed earlier gate.

## 1. Resulting security model

- Express is the only application-data API. Every `public` table has RLS enabled and no `anon` or `authenticated` table privileges; the server-only Supabase secret key is the data boundary.
- Teachers authenticate with Supabase email OTP on the server. The browser receives an AES-256-GCM encrypted `HttpOnly; SameSite=Strict; Secure` cookie containing the refreshable Supabase session and stores no Auth session in Web Storage.
- Students call Supabase Anonymous Sign-In in memory. The server verifies the Supabase user JWT, requires `is_anonymous=true`, and grants that user exact, expiring database memberships.
- Supabase Broadcast channels are private. A teacher may receive only its session's opaque teacher topic; a student may receive only the student-control topic and its one assigned group topic. Browsers have no Broadcast `INSERT` policy.
- Student events and audio uploads require both the anonymous bearer identity and its exact active database membership. A trigger prevents an identity accumulating active memberships in multiple groups in the same class.
- A generated code is a 60-minute pending reservation. If recording never starts it and its
  memberships are deleted; first start promotes it to a retained four-hour classroom. Ending a
  started class revokes every membership immediately and stops student events. A bounded 15-second
  final-audio path remains only for already-recorded chunks.
- The application holds no Supabase JWT signing key and mints no Supabase JWT. Supabase manages ES256 signing and exposes only public verification keys.

## 2. Before any production write

1. Use Node 24 LTS and PostgreSQL client 17 or newer.
2. Confirm `.env` is ignored by Git. Never paste a database password, secret API key, refresh token, or cookie secret into chat, source, a URL query, or a `VITE_*` variable.
3. In DigitalOcean, put the current app into maintenance or scale it to zero immediately before the archive. This prevents records created after the snapshot from being omitted during cutover.
4. In Supabase, click **Connect → Direct connection** and copy the Postgres URI. Direct connection is preferred for `pg_dump` and migrations. If this computer cannot reach IPv6, use **Session pooler**, port `5432`; do not use transaction mode/port `6543` for this workflow.
5. Put the URI in the untracked `.env` file as `SUPABASE_DB_URL=postgresql://...`. Replace the password placeholder and URL-encode password characters where required.

The scripts parse the URI into `PG*` environment variables. The password is not placed in the process argument list.

Run the non-connecting, non-secret preflight immediately after saving:

```sh
npm run db:preflight:archive
```

It rejects placeholders, a URL for a different Supabase project, transaction pooling on port 6543,
non-PostgreSQL URLs, missing credentials/database, non-5432 ports, and explicitly disabled TLS. It
prints no host, username, password, or full URL. Archive, migration, reset, and rollback scripts run
the same check automatically.

## 3. Archive gate

Run:

```sh
npm run db:archive:production
```

Record the printed `Batch`, archive directory, byte count, and SHA-256. The command must complete all of these operations:

1. Create `archives/<batch>/database.dump`, a full custom-format Postgres dump including Auth and non-public schemas.
2. Create a timestamped `aittention_archive_YYYYMMDD_HHMMSS` database schema containing every current `public` application table.
3. Record source/archive row counts in `private.aittention_archive_catalog`.
4. Enable RLS and remove `public`, `anon`, and `authenticated` access from every archived table.
5. Grant read access only to `service_role` and install the audited service-only `read_aittention_archive` RPC.
6. Execute the SQL row-count, RLS, grant, and RPC denial verifier before writing the manifest.

Verify the offline artifact again:

```sh
npm run db:archive:verify -- archives/<batch>
```

Copy the entire `archives/<batch>` directory to encrypted offline storage controlled by the school. The repository ignores `archives/`; it must never be committed or deployed.

Optional but strongly recommended: restore the dump into a separate disposable Postgres database—not production:

```sh
RESTORE_DATABASE_URL='postgresql://disposable-target' \
CONFIRM_RESTORE_BATCH='<batch>' \
npm run db:archive:restore -- archives/<batch>
```

The restore command is destructive to its target. Confirm the target is disposable before running it.

### Protected archive access

Application browsers cannot access archive schemas or execute the RPC. A controlled server-side Supabase client using `SUPABASE_SECRET_KEY` may call:

```js
await supabase.rpc('read_aittention_archive', {
  p_batch_id: '<batch>',
  p_table_name: 'transcripts',
  p_limit: 100,
  p_offset: 0
})
```

Every successful RPC call inserts an audit row in `private.aittention_archive_access_log`. Do not expose a generic archive route in the web app.

Do not continue unless the dump checksum, archive row counts, RLS/grant tests, authenticated/anon denial tests, and a secure offline copy all pass.

## 4. Non-destructive schema migration gate

Set the batch printed by the archive command and run:

```sh
ARCHIVE_BATCH='<batch>' npm run db:migrate:production
```

The orchestrator re-verifies the archive before applying, in order:

1. asynchronous activity tables;
2. four-hour classroom expiry fields and constraints;
3. native Supabase Realtime membership table, single-group trigger, and exact-topic RLS;
4. audited retention cleanup for expired memberships and old anonymous users;
5. exact teacher/admin/guest whitelist and global/teacher-owned prompt visibility;
6. asynchronous audio idempotency boundaries;
7. database-backed current-session and final-upload-grace state for multi-instance correctness;
8. audited deletion of abandoned pending sessions and their Realtime memberships;
9. one named daily Supabase Cron retention job with browser roles denied from the Cron schema;
10. service-only grants and RLS on all live `public` tables.

The SQL is idempotent. Inspect `realtime.messages` policies after migration:

```sql
select policyname, roles, cmd, qual
from pg_policies
where schemaname = 'realtime' and tablename = 'messages';
```

The AI(ttention) native-membership `SELECT` policy must be present. Remove an older broad policy only after confirming no other application relies on it; permissive policies combine with `OR` and can bypass the exact-topic policy.

## 5. Operational-data reset gate

The reset preserves `teacher_prompts`, `prompt_library`, `teacher_access`, and Supabase Auth users. It clears classroom, transcript, summary, mind-map, checklist, async-activity, transcription, and Realtime-membership operational records.

Only after reviewing the verified archive evidence, run:

```sh
ARCHIVE_BATCH='<batch>' \
CONFIRM_RESET='RESET_OPERATIONAL_DATA' \
npm run db:reset:production
```

The command refuses to run without the exact confirmation and a verified archive catalog.

## 6. Supabase dashboard configuration

### New API keys

1. Open **Settings → API Keys → Publishable and secret API keys**.
2. If necessary, choose **Create new API keys**.
3. Use the `sb_publishable_...` value in the browser/build configuration.
4. Create a separately named `sb_secret_...` key for the DigitalOcean backend.
5. Leave legacy `anon` and `service_role` keys active during validation. The runtime code has no fallback to them.

### Teacher OTP and anonymous students

1. In Auth URL configuration, set the Site URL to the production HTTPS origin and allow the production `/admin` redirect.
2. Keep email OTP enabled. Ensure the email template displays `{{ .Token }}` because the login screen expects the verification code, not a browser-stored magic-link session.
3. Enable **Allow anonymous sign-ins** for students.
4. Create a Cloudflare Turnstile widget restricted to `ai-ttention.rafflesian.org`. Add its public
   site key to DigitalOcean as build-time `VITE_TURNSTILE_SITE_KEY`, deploy, and confirm the student
   join screen completes the check. Do not put the Turnstile secret in DigitalOcean or any `VITE_*`
   variable.
5. In **Authentication → Bot and Abuse Protection**, select Turnstile, enter the private Turnstile
   secret directly into Supabase, and enable CAPTCHA. The client passes the single-use token to
   `signInAnonymously`; Supabase performs server-side validation.
6. Re-run `db:verify:student-boundary` with a test-token strategy or manually join from a clean
   browser. A raw scripted anonymous sign-in should now fail without CAPTCHA. Review anonymous-auth
   rate limits as a second layer. Anonymous users have the `authenticated` database role, so the
   exact RLS/grant posture remains mandatory.
7. Set a short access-token lifetime appropriate for Realtime policy-cache revocation (10–15 minutes is the operational target; never below Supabase's supported minimum).

### Private Realtime

1. Confirm the exact-topic RLS policy above.
2. In Realtime settings, disable **Allow public access** so channels are private-only.
3. Do not add a browser Broadcast `INSERT` policy. Server broadcasts use `channel.httpSend()` and the backend secret key.

### Supabase-managed ES256 migration

1. Deploy and validate the new publishable/secret API keys first. Confirm no component verifies tokens with `SUPABASE_JWT_SECRET`, `jsonwebtoken`, or a custom HS256 secret.
2. Open **Authentication → JWT Signing Keys** and choose **Migrate JWT secret**. Supabase imports the legacy secret into the signing-key system and creates a standby asymmetric key.
3. Confirm the standby key is P-256/ES256. Do not export, import, or store a private key for this application.
4. Choose **Rotate keys**. New access tokens are then ES256; still-valid old tokens remain accepted.
5. Before enabling CAPTCHA, validate a fresh anonymous token against the public P-256/ES256 JWKS
   without printing the token or synthetic user ID. The verifier deletes its synthetic user:

   ```sh
   npm run db:verify:es256
   ```

   Then validate teacher OTP, cookie refresh, and private Realtime. A fresh teacher access token
   must also report `alg: ES256` and a `kid` present in the same JWKS.
6. Wait at least the configured access-token lifetime plus 15 minutes.
7. In **Settings → API Keys**, confirm the legacy `anon` and `service_role` last-used indicators are quiet, then disable those legacy API keys. They can be re-enabled during rollback.
8. Only after the legacy API keys are disabled, revoke the previously used legacy JWT secret. Supabase documents this ordering as required.

## 7. DigitalOcean encrypted variables

The repository selects the supported Node 24 LTS line through `package.json` and `.nvmrc`.
DigitalOcean's Node buildpack reads the `engines.node` value; do not override it back to the EOL
Node 20 line.

Configure the variables with these DigitalOcean scopes. Public `VITE_*` values are deliberately
compiled into the browser bundle; every secret is runtime-only.

| Variable | Scope | Encrypted | Value class |
|---|---|---:|---|
| `NODE_ENV` | Build and Run Time | no | `production` |
| `VITE_SUPABASE_URL` | Build Time | no | public project HTTPS URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Build Time | no | `sb_publishable_...` browser key |
| `VITE_TURNSTILE_SITE_KEY` | Build Time | no | public Cloudflare Turnstile site key |
| `APP_PUBLIC_ORIGIN`, `APP_ORIGINS` | Run Time | no | exact production HTTPS origin |
| `SUPABASE_URL` | Run Time | no | public project HTTPS URL |
| `SUPABASE_PUBLISHABLE_KEY` | Run Time | no | same publishable key |
| `SUPABASE_SECRET_KEY` | Run Time | yes | `sb_secret_...` backend key |
| `AUTH_COOKIE_SECRET` | Run Time | yes | independent random 32+ character value |
| `SESSION_JOIN_SECRET` | Run Time | yes | different independent 32+ character value |
| `OPENAI_API_KEY`, `ELEVENLABS_KEY` | Run Time | yes | provider secrets |
| `AUTH_COOKIE_TTL_SECONDS` | Run Time | no | `2592000` |
| `CLASSROOM_SESSION_TTL_MINUTES` | Run Time | no | `240` |
| `PENDING_SESSION_TTL_MINUTES` | Run Time | no | `60` |
| `ALLOW_LEGACY_TEACHER_ALLOWLIST` | Run Time | no | `false` |

`SUPABASE_SECRET_KEY`, `AUTH_COOKIE_SECRET`, `SESSION_JOIN_SECRET`, provider keys, and the database URL must never be build-time/public variables. Do not deploy `SUPABASE_DB_URL`; it is needed only on the controlled migration computer. The browser requires only the project URL and publishable key so it can obtain anonymous identities and join authorized private Realtime topics; RLS remains the authorization boundary.

Before deployment, load the intended DigitalOcean environment in a protected local/CI context and
run:

```sh
npm run deploy:preflight
```

This rejects legacy anon/service-role/JWT-secret variables, any migration database URL, insecure or
non-exact origins, mismatched browser/server publishable settings, short/reused secrets, unsafe
session lifetimes, and server secrets accidentally prefixed with `VITE_`. It never prints values.

Generate each cookie/join secret independently on Windows Command Prompt:

```bat
powershell -NoProfile -Command "$b=New-Object byte[] 48;$r=[Security.Cryptography.RandomNumberGenerator]::Create();$r.GetBytes($b);[Convert]::ToBase64String($b)"
```

Run it twice and use different outputs.

## 8. Deployment and production validation

1. Commit and push the reviewed source to the intended GitHub branch.
2. Point DigitalOcean at that exact commit and deploy with the encrypted variables above.
3. Read `/version.json` and confirm its `commit` is the exact deployed GitHub commit. The same
   seven-character value is embedded in the page as `meta[name="app-version"]` and the hidden
   `#app-version` span. This marker is generated automatically during every build.
4. Confirm `/health` and production security headers.
5. Teacher OTP: request a code, verify it, close/reopen the browser, and confirm automatic restoration. Confirm no Supabase Auth token exists in Local Storage or Session Storage and the app cookie is HttpOnly/Secure/Strict.
6. Create a class. Confirm it shows a one-hour **Start by** time. Start recording and confirm the
   display changes to a four-hour expiry. End a separate unstarted reservation and confirm it is
   deleted rather than appearing in History.
7. Join with two clean student browser profiles. Confirm distinct anonymous Auth user IDs.
8. Attempt teacher-topic and cross-group subscriptions from a student; both must return channel authorization failure.
9. Record/upload from both groups and confirm each receives only its own transcript/summary/checklist updates.
10. Tamper with the group number on an upload/event request; it must return 403. Tamper with, expire, or forge join/user tokens; requests must fail without internal error details.
11. End the class. Both student UIs must stop, membership rows must be revoked, later events must fail, and only an already-recorded final chunk may use the 15-second grace path.
12. Test natural expiry with a short non-production TTL.
13. Confirm migration `20260727_retention_cron.sql` created exactly one active daily retention job:

```sql
select jobname, schedule, command, active
from cron.job
where jobname = 'aittention-daily-retention';
```

The expected schedule is `17 18 * * *` (02:17 Singapore time). Review
`private.aittention_retention_log` and the Supabase Cron run history after executions.

## 9. Local and CI verification commands

```sh
npm run test:local:core

SPEECH_AUDIO_PATH=/absolute/path/to/speech.webm \
SILENCE_AUDIO_PATH=/absolute/path/to/silence.wav \
npm run test:local:providers
```

The core gate includes unit/API/adversarial tests, a production build and smoke test, a 25-group
Summary/Checkbox composition test, browser cookie/security checks, and npm audit. The provider gate
must recognize real speech, treat silence as skipped, and generate a real OpenAI summary. Repeat the
audio provider gate with WebM, M4A/MP4, and Ogg fixtures when validating phone/browser compatibility.

After anonymous Auth is enabled, run the cleanup-safe Supabase boundary probe separately:

```sh
npm run db:verify:student-boundary
```

Also run Semgrep OWASP rules, Gitleaks over current source, Trivy high/critical vulnerability/secret scanning, and a localhost SonarQube analysis. Record the quality-gate status and separate bugs, vulnerabilities, and security hotspots from optional maintainability suggestions.

The Secure Auth Lab lessons and their applicability/exception evidence are inventoried in
`secure-auth-lab-control-mapping-2026-07-20.md`.

## 10. Rollback

### Application/config rollback

1. Roll DigitalOcean back to the last known-good commit.
2. Re-enable legacy API keys only if that old commit requires them.
3. If ES256 rotation exposed an incompatibility before revocation, Supabase allows the previously used key to be moved back to standby and rotated into use.

### Operational-data rollback

Restore rows from the protected in-project archive:

```sh
ARCHIVE_BATCH='<batch>' \
CONFIRM_ROLLBACK='RESTORE_OPERATIONAL_DATA' \
npm run db:rollback:production
```

This is archive-gated and restores parents before foreign-key children. It does not delete preserved prompts or teacher access.

For disaster recovery, restore `database.dump` only into a confirmed target with the exact `CONFIRM_RESTORE_BATCH` guard described in section 3.

## 11. Deactivation criteria and residual risks

Do not deactivate legacy keys or treat old live records as disposable until all of these are true:

- verified archive manifest, row counts, SHA-256, and restore listing;
- encrypted offline copy held outside the repository;
- anon/authenticated archive-denial and service-role access/audit tests pass;
- new-key deployment serves all production traffic and legacy last-used indicators are quiet;
- OTP cookie refresh, anonymous students, exact-topic Realtime, cross-group denial, transcript delivery, forced end, and expiry pass in production;
- rollback commands and responsible operator are recorded.

Residual risks:

- Public async share links can be forwarded; entropy, rate limits, caps, expiry, and close controls mitigate but do not eliminate this.
- Anonymous sign-in can grow `auth.users`; Turnstile, Supabase rate limits, monitoring, and scheduled cleanup provide layered controls. Do not enable Supabase CAPTCHA before the matching public site key is deployed.
- The backend secret key bypasses RLS. Server authorization and ownership tests are therefore critical, and the key must be independently rotatable.
- Audio signature checks are lightweight format validation, not malware scanning.
- Transcript retention, consent, subject-access, and deletion periods still require an explicit school policy.
- Horizontal replicas share session/release/grace state through Postgres, but the in-process abuse
  limiter is per replica. Use a shared rate-limit store before scaling beyond a small replica count.
- Historical Git commits contain the old public anon JWT. It is low-privilege/public by design, but it should be disabled after new-key validation so history no longer represents an active credential.

## Official references

- Supabase database connections: https://supabase.com/docs/guides/database/connecting-to-postgres
- Publishable/secret key migration: https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys
- JWT signing keys and ES256 rotation: https://supabase.com/docs/guides/auth/signing-keys
- Anonymous sign-ins: https://supabase.com/docs/guides/auth/auth-anonymous
- Realtime authorization: https://supabase.com/docs/guides/realtime/authorization
- Realtime Broadcast/`httpSend`: https://supabase.com/docs/guides/realtime/broadcast
