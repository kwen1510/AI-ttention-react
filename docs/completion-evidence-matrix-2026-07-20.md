# AI(ttention) secure re-spin completion evidence matrix

Updated: 2026-07-21

Status terms:

- **Proven**: direct current-state evidence covers the requirement.
- **Locally proven / cloud pending**: implementation and synthetic database/browser evidence exist,
  but the production Supabase or DigitalOcean state has not been changed or inspected afterward.
- **Pending**: required production evidence does not yet exist.

| Requirement | Authoritative evidence | Status |
|---|---|---|
| Inventory current application and production schema/data | `production-inventory-2026-07-20.md`; read-only production counts plus the final archive manifest's 22 source/archive pairs and 2,070 matching rows | Proven before destructive work and recounted by the archive transaction |
| Inventory referenced Secure Auth Lab controls | `secure-auth-lab-control-mapping-2026-07-20.md`, mapped from the referenced task/report, threat model, migration, server, and adversarial suite | Proven |
| Complete point-in-time offline production export | `archives/aittention-20260720T133440Z/database.dump` and manifest | Proven: 884,710-byte custom dump, SHA-256 `c00286b6c5757e0f03eba96e2a593d6b9113650b151fbed6fe3264983f1fd091` |
| Protected in-project archive preserving every current record | Production archive schema `aittention_archive_20260720_133440`; manifest contains 22 source/archive table pairs and 2,070 matching rows | Proven in production: RLS enabled, browser grants absent, archive RPC service-only |
| Row counts, manifest, checksum, restore instructions, denial tests before destructive work | Final manifest, checksum, restore command, archive verifier, protected-access SQL audit, and encrypted offline copy | Proven before reset/migration |
| Preserve only reusable questions/prompts in the new live dataset | Production reset retained the reusable prompt library; post-reset audit found exactly 10 prompts | Proven in production; later synthetic validation sessions are not legacy data |
| Least-privilege live schema with ownership and expiry | Production audit found zero public tables without RLS, zero browser public-table grants, service-only retention/archive RPCs, exact whitelist, ownership, and four-hour lifecycle; live two-group isolation and post-stop denial passed | Proven in production; natural four-hour wall-clock expiry is represented by lifecycle tests and the live expiry value rather than a four-hour wait |
| Anonymous Supabase student identities and exact private Realtime access | `db:verify:student-boundary` passed anonymous sign-in, protected-table denial, unauthorized private-topic denial, and synthetic-user deletion; live two-group Summary flow proved allowed topics and cross-group/teacher-topic denial | Proven in production |
| Teacher OTP with refreshable encrypted HttpOnly cookie and no Web Storage | Production OTP login plus a newly opened browser tab restored the teacher session; browser security E2E covers cookie flags and Web Storage absence | Proven locally and in production |
| Forced end, final-upload grace, and natural expiry | Stop revokes membership and blocks later uploads/rejoins; final audio has a persisted 15-second grace; pending sessions are discarded when stopped; first start returns an approximately four-hour expiry | Forced-end and abandoned-session behavior proven in production; natural four-hour wall-clock expiry remains covered locally |
| Phone/browser audio compatibility and silence suppression | Live provider gate recognized the same fixture in WebM, M4A/MP4, and Ogg and skipped silence; production accepted real audio and skipped silence; RFC UUID fallback fixes browsers without `crypto.randomUUID`, and production deliberately accepted a legacy non-UUID retry ID without losing the transcript | Proven in provider and production automation; continue a real-device workshop smoke test before each major event |
| New publishable/secret keys only | Production bundle contains no server secret markers; browser key is publishable; server-only database access succeeded; deployment preflight rejects legacy names; post-disable production checks passed | Proven for current production deployment; legacy `anon` and `service_role` API keys are disabled |
| Supabase-managed ES256 with no application JWT signing key | Production current key is managed ECC P-256; fresh anonymous tokens reported `alg: ES256`, matched the public JWKS `kid`, exposed no private key material, and their synthetic users were deleted; a fresh teacher OTP cookie and the complete live production flow passed after rotation | Proven in source and production; the previous HS256 signing key is revoked and no previously used trusted key remains |
| Remove custom WebSocket/Socket.IO infrastructure | Dependencies, server service, client socket wrapper, and E2E path removed; live fan-out uses Supabase Broadcast | Proven in source/local simulation |
| RLS, grants, ownership, isolation, bounded uploads, expiry, CSRF/origin/Host, limits, fixed errors, secret separation, retention, archive audit | SQL plus production database audit; 75 unit/API/adversarial tests; hostile-origin 403; unauthenticated 401; isolated Chromium workflows; live anonymous cross-group/topic denial; one active browser-denied daily Cron cleanup | Proven locally and across the exercised production boundaries |
| Idempotent archive, restore, migration, verification, reset, rollback scripts | Scripts and SQL; repeated disposable Postgres archive→migrate→reset→rollback rehearsal | Proven locally |
| Reject unsafe operator environment without revealing it | `db:preflight:archive` and `deploy:preflight`; transaction pooler/wrong project/placeholder/legacy key/migration URL/VITE secret tests | Proven |
| Supported production runtime | Node 24 selected in `package.json`/`.nvmrc`; DigitalOcean build used Node 24.15.0; build, smoke, 75 tests, and 25-group simulation pass | Proven locally and in deployment build |
| Security scans and actionable remediation | npm audit 0; final tracked-source Semgrep rerun covered 145 files with 113 OWASP/JavaScript/Node/secrets rules and 0 findings; tracked-HEAD Gitleaks 0; earlier Trivy high/critical 0 and SonarQube 0 bugs/vulnerabilities/hotspots | Current npm/Semgrep/Gitleaks proven through `6c015c8`; Trivy executable and Sonar service/scanner unavailable for the final rerun, with the earlier green reports retained |
| One exact setup/deployment/rollback runbook | `production-respin-runbook-2026-07-20.md` | Proven as documentation |
| Production archive and restore proof | Final batch, counts, checksum, protected denial proof, restore command, and encrypted offline copy | Proven; disposable restore tooling was rehearsed separately |
| Production schema migration/reset | Archive gate passed, operational reset was explicitly confirmed, exact whitelist and 10 retained prompts verified afterward | Proven |
| Supabase dashboard Auth/anonymous/private Realtime/new keys/ES256 configuration | New keys, OTP, anonymous Auth, private Realtime, and ES256 work in production; the client has a dormant conditional Turnstile path but no site key or CAPTCHA enforcement is configured | Proven for the selected production scope; CAPTCHA is explicitly deferred and no security claim depends on it |
| DigitalOcean encrypted variables and deployment of reviewed commit | `/version.json`, HTML marker, headers, health, cookie behavior, secret-free bundle, and live E2E | Proven: production reports healthy `6c015c8b8ca22836f25cd978c435d9f6fbde7e92`; a post-rotation live E2E passed Summary, Checkbox, asynchronous, speech, silence, Realtime, close, and discard behavior on that exact version |
| Production cross-role/group/expiry/end/restore validation | Live cleanup-safe E2E covered Summary, Checkbox, asynchronous mode, two anonymous groups, private-topic denial, real speech, silence, OpenAI summary, persisted state/history, forced stop/close, post-close denial, and abandoned pending-session deletion | Proven for group/session boundaries; cross-teacher ownership is adversarially proven locally because no second teacher OTP was used; natural expiry was not held open for four hours |
| Disable legacy keys and revoke old JWT secret | The new-key deployment and complete live flow were validated, the access-token lifetime plus 15 minutes elapsed, legacy API keys were disabled, new-key-only health/ES256/RLS/Realtime checks passed, and only then the previous HS256 key was revoked | Proven in production |

## Current gate

The archive, protected production migration/reset, whitelist, new-key deployment, teacher cookie,
anonymous boundary, ES256 rotation, and post-rotation production audio/session suites are complete.
The archive, protected reset, whitelist, new-key deployment, ES256 migration, legacy-key retirement,
teacher cookie, anonymous boundary, and production audio/session suites are complete. CAPTCHA is
deliberately not enabled; the dormant conditional Turnstile path has no production site key and does
not change anonymous sign-in behavior. Remaining items are operational policy and future scaling work,
not release blockers for the validated application scope.
