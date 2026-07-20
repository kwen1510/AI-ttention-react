# Security Audit - 2026-06-01

## 2026-07-20 Security Addendum

- Teacher OTP verification now terminates on the server and creates an AES-256-GCM encrypted
  `HttpOnly`, `Secure`, `SameSite=Strict` cookie. Supabase teacher tokens are not persisted in
  browser storage.
- Socket.IO and its server/client dependencies have been removed.
- Supabase Broadcast channels are private. Supabase Auth identities receive expiring database
  memberships for exact opaque topics; the application mints no Supabase JWT.
- `realtime.messages` RLS checks `auth.uid()` and the exact requested topic against active database
  membership. Browsers receive no Realtime INSERT policy.
- Live sessions persist a four-hour expiry, stop automatically, allow 15 seconds for a final audio
  upload, and then remove student subscriptions.
- Transcription provider failures return errors instead of silent HTTP-200 skips.
- The 2026-07-20 verification result is 47 unit/security tests passing, production build/smoke and
  focused browser-security checks passing, five-group summary/checkbox Realtime simulation passing,
  and zero high/critical Trivy or npm audit findings.

## Scope

This audit covers the current local application code for teacher authentication, public student
recording links, asynchronous uploads, Supabase storage, realtime delivery, and browser-facing
security headers. It does not include a penetration test of the deployed DigitalOcean host,
Supabase account settings, DNS, or school network controls.

## Stability Summary

The asynchronous mode is stable enough for controlled production testing after the current
verification suite. The app now has:

- Teacher-owned asynchronous sessions with obfuscated share links.
- Public student join/upload flow that does not expose the classroom session code.
- Timestamped transcript segments and process reports for ideas formed, rejected ideas, decisions,
  open questions, and evidence.
- Supabase tables verified through the configured project.
- RLS enabled for teacher-owned direct reads.
- Public upload validation, rate limiting, closed/expired activity checks, and per-group caps.
- Cross-site unsafe API requests are rejected by origin/fetch-metadata checks.
- State-changing session creation uses `POST`; the old `GET /api/new-session` path now returns 405.
- Staging auth bypass is disabled whenever `NODE_ENV=production`, even if the bypass flag is set.
- Production join-token signing requires `SESSION_JOIN_SECRET` and no longer falls back to the
  Supabase service-role key.

## Implemented Controls

- The new Supabase secret key remains server-side only.
- The browser uses only the new publishable key.
- Teacher API routes require authenticated teacher access and owner checks.
- Async share IDs are high entropy and validated before database lookup.
- Async student responses omit internal session IDs, teacher IDs, and classroom codes.
- Audio uploads are memory-limited, MIME allowlisted, and signature-checked outside mock mode.
- Public async join/upload endpoints have async-specific rate limits.
- Async uploads are rejected when the activity is closed, expired, over segment cap, or over
  transcript cap.
- Production CSP is enabled with same-origin scripts and explicit Supabase/font allowances.
- Markdown output is sanitized before and after task-list decoration, and raw `script`/`style`
  tags are explicitly forbidden.
- An unused third-party D3 CDN script was removed from the page shell.
- Render deployment files were removed because this project is no longer using Render.
- All API routes that accept audio through multer now call the shared audio payload signature
  validator before passing data to transcription services.
- Teacher-only diagnostic AI endpoints no longer return backend exception details in production.

## Scan Results

- `npm audit --omit=dev`: 0 vulnerabilities.
- `npm audit`: 0 vulnerabilities.
- `npm audit signatures`: 458 packages with verified registry signatures and 47 verified
  attestations.
- `uvx semgrep scan --config p/owasp-top-ten --config p/javascript --config p/nodejs
  --no-git-ignore client server scripts tests`: 0 findings across 118 files.
- `uvx semgrep scan --config p/secrets`: 0 findings.
- Gitleaks over current application source: 0 findings. Git history contains two occurrences of the
  old public anon JWT; deactivate that legacy key after the new-key cutover.
- Trivy high/critical scan initially found Multer 1.x denial-of-service advisories. Multer was
  upgraded to 2.2.0 and the final source/dependency scan (excluding the intentionally secret local
  `.env`) reports 0 vulnerabilities and 0 source secrets.
- SonarQube Community 26.7 indexed 130 files. Its first completed scan exposed two bugs and three
  vulnerability-rule findings. The sort and React hook-name defects were fixed; the fixed 10 MiB
  single-file upload cap and two loopback-only HTTP test origins were reviewed and narrowly
  documented. The final rescan passed with 0 bugs, 0 vulnerabilities, and 0 security hotspots.
  Sonar still reports 168 legacy code smells, 4.7% duplication, and uninstrumented 0% coverage;
  these figures are recorded rather than hidden by the passing new-code quality gate.
- `npx retire --path client --outputformat json`: no vulnerable browser libraries.
- Custom route inventory: teacher routes call `requireTeacher`; public student routes require a
  join token or async share ID; no GET handler showed obvious mutation patterns.
- Custom XSS sink scan: the only `dangerouslySetInnerHTML` use is the DOMPurify-backed markdown
  renderer.
- Custom CSRF scan: teacher authentication uses a SameSite cookie, while unsafe API methods are
  protected by the origin/fetch-metadata guard.
- Production header check: CSP, `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`,
  `X-Frame-Options`, and same-origin resource policy are present.

## Verification Results

- `npm run test:unit`: 47 passing tests.
- `npm run build`: production client build passes.
- `npm run test:smoke`: passes.
- `npm run test:realtime:multi`: passes for summary and checkbox realtime flows.
- `npm run test:browser:security`: passes HttpOnly restoration, no Web Storage auth, forced end,
  and traversal denial.
- `npm run db:verify:async`: confirms `async_sessions`, `async_groups`, `async_segments`, and
  `async_group_reports` are applied.
- `git diff --check`: passes.

## Remaining Required Work Before Broad Production Use

1. Rotate exposed credentials if any service-role key was ever pasted into chat, committed, emailed,
   or used on a shared machine.
2. Configure DigitalOcean secrets directly in the platform, not in tracked files.
3. Configure a high-entropy production `SESSION_JOIN_SECRET`; do not reuse the Supabase service-role
   key for token signing.
4. Confirm production `APP_ORIGINS` and `APP_PUBLIC_ORIGIN` are exact HTTPS origins.
5. Enable Supabase Auth controls appropriate for the school, including MFA for teacher/admin users
   if feasible.
6. Add a data-retention policy for async transcripts and reports, then implement scheduled cleanup.
7. Add operational logging/alerting for repeated invalid share IDs, upload rejections, rate limits,
   and unusually high public upload volume.
8. Apply `20260720_native_realtime_memberships.sql`, verify no older broad
   `realtime.messages` SELECT policy remains, and enable private-only channels in Realtime Settings.
9. Run a real production smoke test on the deployed URL after deployment, including microphone
   permission and upload from a phone.
10. Monitor private-channel authorization failures and JWT expiry errors after deployment.

## Residual Risks

- Public async links are intentionally unauthenticated. Entropy, rate limits, expiry, and close
  controls reduce risk, but shared links can still be forwarded.
- Transcripts may contain student personal data. Retention, consent, export, and deletion processes
  need school policy decisions.
- Server-side Supabase service-role access bypasses RLS by design. API owner checks are therefore
  security-critical and must remain covered by tests.
- CSP is production-only to avoid disrupting local development. Production should run with
  `NODE_ENV=production`.
- File signature checks are lightweight. They reduce accidental/obvious non-audio uploads but are
  not malware scanning.
- Cookie-authenticated unsafe requests rely on `SameSite=Strict` plus strict origin/fetch-metadata
  checks. Those checks must remain ahead of API route handlers.
- Realtime now uses Supabase-issued identities and database membership; the application holds no JWT
  signing secret and is compatible with Supabase ES256 signing-key rotation.

## Recommended Follow-Up Controls

- Store only hashes of future async share tokens if database-log token disclosure becomes a concern.
- Add teacher controls to regenerate a share link and revoke a specific group.
- Add Supabase/database-level retention jobs for old async segments and reports.
- Add CI checks for `npm audit --omit=dev` or equivalent production dependency scanning.
- Add centralized request logging with IP/user-agent hashing rather than raw personal data.
