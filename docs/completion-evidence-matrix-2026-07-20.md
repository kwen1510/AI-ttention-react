# AI(ttention) secure re-spin completion evidence matrix

Updated: 2026-07-21

Status terms:

- **Proven**: direct current-state evidence covers the requirement.
- **Locally proven / cloud pending**: implementation and synthetic database/browser evidence exist,
  but the production Supabase or DigitalOcean state has not been changed or inspected afterward.
- **Pending**: required production evidence does not yet exist.

| Requirement | Authoritative evidence | Status |
|---|---|---|
| Inventory current application and production schema/data | `production-inventory-2026-07-20.md`; read-only production counts captured before design work | Proven at inventory time; must be recounted by archive transaction |
| Inventory referenced Secure Auth Lab controls | `secure-auth-lab-control-mapping-2026-07-20.md`, mapped from the referenced task/report, threat model, migration, server, and adversarial suite | Proven |
| Complete point-in-time offline production export | `archives/aittention-20260720T133440Z/database.dump` and manifest | Proven: 884,710-byte custom dump, SHA-256 `c00286b6c5757e0f03eba96e2a593d6b9113650b151fbed6fe3264983f1fd091` |
| Protected in-project archive preserving every current record | Production archive schema `aittention_archive_20260720_133440`; manifest contains 22 source/archive table pairs and 2,070 matching rows | Proven in production: RLS enabled, browser grants absent, archive RPC service-only |
| Row counts, manifest, checksum, restore instructions, denial tests before destructive work | Final manifest, checksum, restore command, archive verifier, protected-access SQL audit, and encrypted offline copy | Proven before reset/migration |
| Preserve only reusable questions/prompts in the new live dataset | Production reset retained the reusable prompt library; post-reset audit found exactly 10 prompts | Proven in production; later synthetic validation sessions are not legacy data |
| Least-privilege live schema with ownership and expiry | Production audit found zero public tables without RLS, zero browser public-table grants, service-only retention/archive RPCs, exact whitelist, ownership, and four-hour lifecycle | Production database boundary proven; live cross-group flow still pending |
| Anonymous Supabase student identities and exact private Realtime access | Client/server implementation, membership RLS, 25-group isolated local simulation, and `db:verify:student-boundary` production probe | Production probe fails with `anonymous_provider_disabled`; dashboard action required |
| Teacher OTP with refreshable encrypted HttpOnly cookie and no Web Storage | Production OTP login plus a newly opened browser tab restored the teacher session; browser security E2E covers cookie flags and Web Storage absence | Proven locally and in production |
| Forced end, final-upload grace, and natural expiry | Stop revokes membership and blocks normal events immediately; final audio has 15-second grace; session TTL defaults to four hours | Proven locally; natural cloud expiry pending |
| Phone/browser audio compatibility and silence suppression | Current live ElevenLabs Scribe v2 gate recognized the same 13-word fixture in WebM, M4A/MP4, and Ogg and skipped the silence fixture in every run; upload retry IDs remain stable | Proven against the configured transcription provider; production multi-phone workshop validation pending |
| New publishable/secret keys only | Production bundle contains no server secret markers; browser key is publishable; server-only database access succeeded; deployment preflight rejects legacy names | Proven for current production deployment; legacy keys remain enabled only for safe cutover |
| Supabase-managed ES256 with no application JWT signing key | No Supabase JWT mint/verify secret path; runbook contains standby/rotate/wait/disable/revoke order; production JWKS currently returns zero asymmetric keys | Application side proven; dashboard migration/rotation pending |
| Remove custom WebSocket/Socket.IO infrastructure | Dependencies, server service, client socket wrapper, and E2E path removed; live fan-out uses Supabase Broadcast | Proven in source/local simulation |
| RLS, grants, ownership, isolation, bounded uploads, expiry, CSRF/origin/Host, limits, fixed errors, secret separation, retention, archive audit | SQL plus production database audit; 67 unit/API/adversarial tests; hostile-origin 403; unauthenticated 401; isolated Chromium workflow and security tests; one active browser-denied daily Cron cleanup | Most boundaries proven in production; real anonymous cross-group/audio flow pending |
| Idempotent archive, restore, migration, verification, reset, rollback scripts | Scripts and SQL; repeated disposable Postgres archive→migrate→reset→rollback rehearsal | Proven locally |
| Reject unsafe operator environment without revealing it | `db:preflight:archive` and `deploy:preflight`; transaction pooler/wrong project/placeholder/legacy key/migration URL/VITE secret tests | Proven |
| Supported production runtime | Node 24 selected in `package.json`/`.nvmrc`; DigitalOcean build used Node 24.15.0; build, smoke, 67 tests, and 25-group simulation pass | Proven locally and in deployment build |
| Security scans and actionable remediation | Release source npm audit 0; Semgrep OWASP/JavaScript/Node/secrets 0; Gitleaks 0; Trivy high/critical 0; localhost SonarQube quality gate passed with 0 bugs, 0 vulnerabilities, and 0 security hotspots after remediation | Proven for release commit `367a51a` |
| One exact setup/deployment/rollback runbook | `production-respin-runbook-2026-07-20.md` | Proven as documentation |
| Production archive and restore proof | Final batch, counts, checksum, protected denial proof, restore command, and encrypted offline copy | Proven; disposable restore tooling was rehearsed separately |
| Production schema migration/reset | Archive gate passed, operational reset was explicitly confirmed, exact whitelist and 10 retained prompts verified afterward | Proven |
| Supabase dashboard Auth/anonymous/CAPTCHA/private Realtime/new keys/ES256 configuration | New keys, OTP, and private Realtime configuration exist; anonymous Auth is disabled according to the live Auth API; production JWKS has zero keys | Partially complete; enable anonymous Auth, then migrate/rotate ES256 |
| DigitalOcean encrypted variables and deployment of reviewed commit | `/version.json`, HTML marker, headers, health, cookie behavior, and secret-free bundle | Proven: production reports exact commit `367a51afaa97a3d6d3fb6d46454ac7662580f683` with no-store caching |
| Production cross-role/group/expiry/end/restore validation | Must execute the runbook with synthetic users after deployment and before real classroom use | Pending |
| Disable legacy keys or revoke old JWT secret | Explicitly forbidden until new deployment is validated, old-key last-used indicators are quiet, token lifetime plus 15 minutes has elapsed, and rollback readiness is confirmed | Pending by design |

## Current gate

The archive, protected production migration/reset, whitelist, new-key deployment, teacher cookie,
and local security suites are complete. The immediate production gate is enabling **Authentication
→ Sign In / Providers → Anonymous Sign-Ins → Allow anonymous sign-ins**. After
`db:verify:student-boundary` passes, run the two-group audio/end-session flow. Only then migrate and
rotate to ES256, wait the token lifetime plus 15 minutes, verify legacy-key last-use is quiet, and
disable/revoke the legacy material in the documented order.
