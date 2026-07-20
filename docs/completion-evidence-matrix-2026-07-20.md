# AI(ttention) secure re-spin completion evidence matrix

Date: 2026-07-20

Status terms:

- **Proven**: direct current-state evidence covers the requirement.
- **Locally proven / cloud pending**: implementation and synthetic database/browser evidence exist,
  but the production Supabase or DigitalOcean state has not been changed or inspected afterward.
- **Pending**: required production evidence does not yet exist.

| Requirement | Authoritative evidence | Status |
|---|---|---|
| Inventory current application and production schema/data | `production-inventory-2026-07-20.md`; read-only production counts captured before design work | Proven at inventory time; must be recounted by archive transaction |
| Inventory referenced Secure Auth Lab controls | `secure-auth-lab-control-mapping-2026-07-20.md`, mapped from the referenced task/report, threat model, migration, server, and adversarial suite | Proven |
| Complete point-in-time offline production export | `archive-production.mjs` plus custom-format dump rehearsal and verifier | Pending production URL and maintenance window |
| Protected in-project archive preserving every current record | Archive SQL copies all current public tables, catalogs counts, enables RLS, revokes browser roles, grants service role, and installs audited access RPC | Locally proven / cloud pending |
| Row counts, manifest, checksum, restore instructions, denial tests before destructive work | Archive verifier, manifest/checksum writer, restore runner, archive safety tests; reset/migrate/rollback require a verified batch | Locally proven / cloud pending |
| Preserve only reusable questions/prompts in the new live dataset | Reset SQL preserves `teacher_prompts` and teacher access while clearing operational rows; synthetic reset/rollback rehearsal succeeded | Locally proven / cloud pending |
| Least-privilege live schema with ownership and expiry | Lifecycle, native Realtime membership, service-only hardening, and retention migrations; local Postgres RLS/grant/trigger tests | Locally proven / cloud pending |
| Anonymous Supabase student identities and exact private Realtime access | Client anonymous sign-in, server JWT verification, DB membership grant/check/revoke, exact topic RLS; five-identity/five-group simulation | Locally proven / cloud pending |
| Teacher OTP with refreshable encrypted HttpOnly cookie and no Web Storage | Server OTP verify/refresh, AES-256-GCM cookie, logout, browser close/reopen Chromium test, storage inspection | Locally proven / cloud pending |
| Forced end, final-upload grace, and natural expiry | Stop revokes membership and blocks normal events immediately; final audio has 15-second grace; session TTL defaults to four hours | Proven locally; natural cloud expiry pending |
| New publishable/secret keys only | Runtime code/config contains only new key names; deployment preflight rejects legacy names | Implementation proven; dashboard keys and production use pending |
| Supabase-managed ES256 with no application JWT signing key | No Supabase JWT mint/verify secret path; runbook contains standby/rotate/wait/disable/revoke order | Application side proven; dashboard rotation pending |
| Remove custom WebSocket/Socket.IO infrastructure | Dependencies, server service, client socket wrapper, and E2E path removed; live fan-out uses Supabase Broadcast | Proven in source/local simulation |
| RLS, grants, ownership, isolation, bounded uploads, expiry, CSRF/origin/Host, limits, fixed errors, secret separation, retention, archive audit | SQL, middleware/services, 47 unit/API/adversarial tests, Chromium security test, database rehearsal | Locally proven / cloud pending |
| Idempotent archive, restore, migration, verification, reset, rollback scripts | Scripts and SQL; repeated disposable Postgres archive→migrate→reset→rollback rehearsal | Proven locally |
| Reject unsafe operator environment without revealing it | `db:preflight:archive` and `deploy:preflight`; transaction pooler/wrong project/placeholder/legacy key/migration URL/VITE secret tests | Proven |
| Supported production runtime | Node 24 selected in `package.json`/`.nvmrc`; 48 tests, build, smoke, and five-group simulation pass in Node 24.14.1 container | Proven locally |
| Security scans and actionable remediation | npm audit 0; Semgrep 0; source Gitleaks 0; Trivy high/critical 0; Sonar quality gate passed after fixes with 0 bugs, vulnerabilities, or hotspots | Proven for recorded local source; rerun exact deployed commit |
| One exact setup/deployment/rollback runbook | `production-respin-runbook-2026-07-20.md` | Proven as documentation |
| Production archive and restore proof | Requires saved `SUPABASE_DB_URL`, app maintenance, generated batch/counts/hash, protected denial proof, and preferably disposable restore | Pending |
| Production schema migration/reset | Requires verified archive and separate destructive confirmation | Pending |
| Supabase dashboard Auth/anonymous/CAPTCHA/private Realtime/new keys/ES256 configuration | Must be performed and then inspected/tested against the production project | Pending |
| DigitalOcean encrypted variables and deployment of reviewed commit | Must run deployment preflight, deploy, inspect headers/logs/cookies, and verify exact commit | Pending |
| Production cross-role/group/expiry/end/restore validation | Must execute the runbook with synthetic users after deployment and before real classroom use | Pending |
| Disable legacy keys or revoke old JWT secret | Explicitly forbidden until new deployment is validated, old-key last-used indicators are quiet, token lifetime plus 15 minutes has elapsed, and rollback readiness is confirmed | Pending by design |

## Current gate

`SUPABASE_DB_URL` is not present in the untracked `.env`. No production archive, migration, reset,
key deactivation, ES256 rotation, or deployment has been attempted. The next authorized operation is
read/archival only: validate the saved URL without printing it, place the app in a maintenance
window, create the production archive, and present its evidence before requesting separate reset
approval.
