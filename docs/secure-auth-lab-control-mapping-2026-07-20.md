# Secure Auth Lab control mapping

Date: 2026-07-20

## Source reviewed

This mapping inventories the controls from the Codex task **Build secure local auth app** in
`/Users/etdadmin/Desktop/Project Summaries/secure-auth-lab`. The authoritative source artifacts
reviewed were:

- `docs/security/report.md`, including its source-lessons table, threat boundaries, adversarial
  results, remediations, provider simulations, and production gates.
- `docs/security/threat-model.md` and `docs/security/security-profile.yaml`.
- `tests/security/adversarial.test.js` and `tests/unit/security.test.js`.
- `src/security.js`, `src/server.js`, and
  `supabase/migrations/20260718000000_secure_auth_lab.sql`.

The lab is a local custom-auth prototype. AI(ttention) deliberately does not copy its password,
custom session, OTP storage, or custom PostgreSQL identity implementation. Supabase Auth remains
the identity provider here; the reusable lesson is the security invariant, not the lab's mechanism.

## Control mapping

| Secure Auth Lab invariant | AI(ttention) implementation/evidence | State |
|---|---|---|
| Trusted roles are server/database decisions, never browser claims | Teacher identity is resolved from Supabase Auth plus `teacher_access`; client-supplied owners/roles are ignored; student APIs require an Auth user with `is_anonymous=true` | Implemented and adversarially tested |
| Repeat ownership at every object query | Session creation writes the authenticated teacher ID; history, prompt, session-control, and export paths enforce teacher/admin ownership | Implemented and tested |
| Prevent cross-class/group IDOR | `private.aittention_realtime_memberships` binds exact Auth user, session, group, topics, and expiry; event/upload paths recheck the same membership | Implemented and tested across five groups |
| Separate presentation mode from authorization | Summary, checkbox, and async modes do not alter teacher/student identity or privileges | Implemented |
| Expire and revoke browser sessions | Teacher refresh session is AES-256-GCM encrypted in an HttpOnly/Secure/SameSite=Strict cookie; logout clears it; disabled `teacher_access` is rechecked | Implemented; cloud refresh still requires production validation |
| Expire and revoke classroom grants | Classroom rows have a default four-hour expiry; forced end revokes memberships and stops normal student events immediately; only a bounded final-upload grace remains | Implemented and tested |
| Purpose-separate secrets | Supabase secret, cookie encryption secret, classroom join secret, and provider keys are distinct; production rejects cookie/join-secret reuse | Implemented and tested |
| Exact Origin and exact Host on mutations | Production startup requires exact HTTPS origins; mutation guard rejects cross-site metadata, foreign Origin, and a forged Host | Implemented and tested |
| Malformed input must not reflect parser internals or attacker text | Global malformed-JSON handling returns the fixed `Malformed request body` response | Implemented and tested |
| Fixed static root; deny dotfiles/traversal/source reads | SPA fallback rejects dotfiles and traversal-shaped paths; plain and encoded `.env` probes return 404 | Implemented and tested in API and Chromium |
| Bound request bodies and validate media bytes | JSON/urlencoded bodies are capped; audio is memory-only, capped at 10 MiB, MIME allowlisted, and signature checked before transcription | Implemented and tested |
| Apply source and target abuse controls | Auth, general API, AI, student upload, async join, and async upload limits exist; Supabase CAPTCHA is a required dashboard gate for anonymous students | Implemented for a single app instance; shared durable limits remain a scale gate |
| Store no raw bearer/password/OTP in routine evidence | Student JWT stays in browser memory only; teacher tokens stay inside the encrypted cookie; scripts redact URLs and do not place the DB password in argv or manifests | Implemented and source/secret scanned |
| Keep privileged schemas out of browser APIs | Archive and membership objects are in `private`; browser roles have no archive grants; exact `realtime.messages` topic policy authorizes private Broadcast | Implemented locally; production denial proof pending migration |
| Use least privilege and deny browser table writes | New live tables revoke `anon`/`authenticated` table privileges except the exact Realtime authorization read path; normal writes go through the server | Implemented locally; server secret remains a privileged trust boundary |
| Audit privileged archive access and cleanup | Archive access function records caller/purpose; retention cleanup writes bounded audit rows; both are unavailable to browser roles | Implemented and locally database-tested |
| Preserve backup/restore evidence before destructive work | Archive runner creates a protected in-project schema, custom-format offline dump, row-count catalog, manifest, SHA-256 checksum, restore instructions, and denial verification; reset/rollback refuse an unverified batch | Implemented and rehearsed; production archive pending URL |
| Fail production configuration closed | Production requires HTTPS origin(s), encrypted-cookie secret, join secret, new Supabase keys, and private Realtime topic configuration | Implemented; dashboard/deployment validation pending |
| Use a supported production runtime | `package.json` and `.nvmrc` select Node 24 LTS; the unit/build/smoke/five-group suite passes in the DigitalOcean-supported Node 24.14.1 container | Implemented and tested |
| Scan dependencies, source, secrets, and runtime | npm audit, Semgrep OWASP/JavaScript/Node, Gitleaks source scans, and Trivy high/critical dependency/source scans are clean. SonarQube Community 26.7 indexed 130 files; after remediation it passed the quality gate with 0 bugs, 0 vulnerabilities, and 0 security hotspots | Implemented and evidenced; Sonar coverage remains uninstrumented |

## Applicability differences and residual gates

- The Secure Auth Lab used a dedicated direct-Postgres app role. AI(ttention) uses a server-only
  Supabase secret key because it needs Auth administration plus server-side persistence. Browser
  roles remain restricted by grants/RLS, but compromise of the Node server is still a privileged
  database boundary. Keep DigitalOcean secrets encrypted, never expose the secret key to Vite, and
  monitor/rotate it.
- The lab's password, one-time-link, OTP-at-rest, roster, and full-directory controls do not map
  directly: teacher OTP is Supabase-managed, students are anonymous Supabase identities, and this
  app has no student directory/roster feature.
- In-memory rate limiting is correct for the current single-instance deployment. Before horizontal
  scaling, replace it with a shared durable store and prove NAT/source plus target-specific limits.
- A local green suite cannot prove Supabase dashboard RLS, private Realtime, ES256 rotation,
  DigitalOcean proxy behavior, managed secret injection, production logging, or restore. Those are
  explicit cutover gates in `production-respin-runbook-2026-07-20.md`.
- Sonar reports 168 legacy maintainability code smells and 4.7% duplication across 18,242 lines;
  these are not security-gate failures, but remain refactoring debt. Coverage is reported as 0%
  because no JavaScript coverage report is imported, so the quality gate must not be interpreted as
  evidence of measured coverage.
- Production remains untouched until a verified archive exists. No reset, schema replacement,
  legacy-key deactivation, or JWT-secret revocation is authorized by local test success alone.
