# AI-ttention release and cybersecurity report

**Report date:** 2026-07-22

**Deployed revision reviewed:** `06fa50bddd72c8373c6218b122afcb4ef0f4c854`

**Public application:** <https://ai-ttention.rafflesian.org>
**Scope:** Changes between the previously deployed revision `7ced64f` and revision `06fa50b`

## Executive assessment

Revision `06fa50b` is deployed and provides a substantially stronger security and reliability baseline for classroom recording, transcription, rolling summaries, authentication, authorization, and Realtime delivery.

The present posture is **appropriate for controlled classroom testing with active monitoring**. It is not a claim of formal penetration-test certification, guaranteed availability, or proven capacity for every phone/browser/network combination. Local automated gates, adversarial authorization tests, a synthetic concurrency test, the production database migration, and public deployment/header checks passed. The authenticated production end-to-end test is still pending because its temporary teacher OTP cookie was unavailable after deployment.

## What was changed

### Student audio capture and delivery

- Changed the browser recorder to create independent chunks approximately every 30 seconds using a supported compressed browser format.
- Added stable client chunk IDs so a retry represents the same recording rather than a new transcription request.
- Retained unacknowledged blobs for retry and bounded the pending chain to prevent unbounded browser memory growth.
- Staggered initial group upload timing to reduce synchronized upload spikes.
- Added quiet-chunk detection in the browser; the server also accepts provider-classified silence as a successful skipped chunk.
- Preserved independent per-group transcription. Audio from separate groups is never combined.

### Audio ingress and transcription

- Added a pre-body admission gate that authenticates the student, verifies exact session/group membership, checks session state, and reserves concurrency before Multer buffers the upload.
- Added a configurable 2 MiB default hard limit, one-file/field/part limits, supported MIME allowlisting, and format-signature checks.
- Added bounded transcription concurrency, provider timeouts, disconnect cancellation, and safe operational counters.
- Released the audio buffer after transcription and avoided writing live audio to disk, PostgreSQL, Supabase Storage, Realtime, logs, or Edge Functions.
- Added durable chunk claims and a uniqueness constraint on `(session_id, group_id, client_chunk_id)` to prevent duplicate provider calls and transcript rows.
- Persisted transcript text/metadata before broadcasting it. Summary generation no longer delays the upload acknowledgement.

### Rolling summaries

- Added a teacher-controlled summary interval persisted with the session.
- Set the default to exactly 30 seconds and server-enforced bounds to 15–300 seconds.
- Added a class-level micro-batch: available text deltas from all groups are sent in one ordinary model request while group IDs and results remain separated.
- Changed summary input from the entire growing transcript to previous structured state plus new segments after a durable cursor.
- Added durable jobs, stale-lease recovery, periodic reconciliation, final flushing, monotonic versions, idempotent commits, and stale-overwrite prevention.
- Configured GPT-5 nano through the Responses API with minimal reasoning, low verbosity, bounded output, `store: false`, structured output, and a stable prompt-cache key.
- Allowed valid group results to commit independently when another group result is missing or malformed.

### Authentication, authorization, sessions, and Realtime

- Kept teacher authentication in an HttpOnly server cookie instead of browser local storage.
- Added restoration of the teacher login from the cookie and preserved explicit logout.
- Kept anonymous Supabase identities for students, then bound each identity to the exact session and group authorized by the server-issued join flow.
- Made Realtime channels private and narrowly scoped: students receive their group/student topics; teachers receive authorized teacher topics.
- Treated Realtime as a delivery optimization. Reload recovery reads durable state from PostgreSQL.
- Added pending/ephemeral classroom sessions, durable activation only after meaningful start, explicit teacher stop, automatic expiry, student eviction, and abandoned-session cleanup.

### Database and operational design

- Added `live_audio_chunks`, `rolling_summary_jobs`, `rolling_summary_states`, and `rolling_summary_commits` plus the persisted session summary interval.
- Enabled RLS on all new operational tables, revoked browser grants, and limited privileged operations to the server service role.
- Pinned `search_path` to empty on new `SECURITY DEFINER` functions and restricted their execution to `service_role`.
- Preserved the archived legacy data behind service-role-only access and an audited archive function.
- Added an authenticated admin-only operational metrics endpoint containing counts, bytes, queue/capacity, latency, errors, and model usage—but no raw audio, transcript contents, prompts, tokens, signed URLs, credentials, or student identifiers.
- Added an embedded build manifest so the deployed Git revision can be verified at `/version.json`.

### Tests, tooling, and documentation

- Added hybrid architecture, upload validation, retry/idempotency, Realtime multi-group, browser security, provider, load, and production verification coverage.
- Added configuration validation and production migration coverage.
- Added the hybrid architecture/runbook and cost/capacity basis.

## Current cybersecurity posture

| Security area | Current control | Assessment |
|---|---|---|
| Teacher authentication | Supabase OTP, server-managed HttpOnly/Secure/SameSite cookie, explicit logout and TTL | Strong baseline |
| Student authentication | Supabase anonymous identity plus server-verified join token and database membership | Strong baseline; anonymous sign-in depends on correct RLS and server checks |
| Authorization/IDOR | Exact teacher/session/group checks; adversarial cross-group/cross-session tests; private channels | Strong baseline |
| Database exposure | RLS enabled, browser grants revoked on service-only tables, service key restricted to server | Strong baseline |
| SQL injection | Supabase SDK filters/RPC parameters; no request-built raw SQL found; identifiers quoted in administrative SQL | Low observed risk |
| Audio uploads | Authentication before buffering, capacity gate, hard byte/part limits, MIME and signature checks, timeout/cancellation | Strong baseline |
| Replay/duplicate work | Stable client UUIDs and database uniqueness/idempotency | Strong baseline |
| XSS | React escaping, sanitization boundaries, restrictive CSP, no inline script permission | Good baseline |
| CSRF/cross-origin requests | Same-origin credentials, exact HTTPS Origin/Host checks, unsafe-method guard | Good baseline |
| Path traversal/static exposure | Real-path containment and adversarial checks for encoded traversal, `.env`, `.git`, source, archives, and `node_modules` | Strong baseline |
| SSRF | Fixed HTTPS provider destinations rather than user-controlled provider URLs | Low observed risk |
| Secrets | Service/provider/cookie secrets remain server-only; no `VITE_` prefix; Gitleaks found no tracked leak | Strong baseline |
| Denial of service | Route rate limits, bounded body size, concurrency gate, queue/backpressure behavior, timeouts | Good initial baseline; production tuning still requires telemetry |
| Realtime confidentiality | Private topics, membership authorization, scoped student/teacher delivery | Strong baseline |
| Data minimization | No routine storage of live audio; text and metadata only; `store: false` for OpenAI summary responses | Strong baseline |
| Stale summary integrity | Durable cursors, idempotent commits, monotonic versions, stale-write rejection | Strong baseline |
| Supply chain | `npm audit --audit-level=moderate` reported zero vulnerabilities at verification time | Good snapshot; must be repeated over time |
| Logging/privacy | Metrics avoid audio, transcripts, credentials, prompts, tokens, and student identifiers | Strong baseline |

## Verification evidence

The following completed successfully before deployment:

- 81 Node unit, API, and adversarial tests.
- 25-group summary and checkbox Realtime integration coverage, including a single class micro-batch and independent group commits.
- Production Vite build, browser regression suite, and browser security suite.
- Authentication restoration/no-Web-Storage checks, forced session end, interval persistence, and traversal/static-file denial probes.
- Synthetic 60-recorder/120-chunk admission test: zero errors, maximum active transcription count 4, approximately 21–22 MiB RSS growth, and provider concurrency identified as the limiting factor.
- One live GPT-5 nano structured rolling-summary smoke request.
- `npm audit --audit-level=moderate`: zero known vulnerabilities at test time.
- Gitleaks scan over application source, tests, scripts, and documentation: no tracked secrets found.
- Manual SQL/security review of the changed database and request boundaries.
- Production migration applied and the four new tables verified with RLS enabled.
- Public revision manifest confirmed `06fa50b`; `/admin` returned HTTPS 200 with CSP, HSTS, no-sniff, frame restrictions, no-referrer, cross-origin isolation headers, and `Cache-Control: no-store`.
- Semgrep Community 1.170.0 ran 109 OWASP, JavaScript, Node.js, and secrets rules over 128 tracked files: zero findings and zero scan errors.
- SonarScanner for NPM 5.0.0 analyzed 150 files against a local loopback-only SonarQube Community 26.7 server. The initial scan found one bug and four vulnerability-rule findings in the production E2E harness. The shared temporary paths and cleanup throw were removed; the rescan closed all five findings and reported zero open bugs, zero open vulnerabilities, zero security hotspots, A ratings for reliability/security/maintainability, and a passing quality gate.
- Sonar reports 163 open code smells, 2.4% duplicated lines, and 0% imported coverage. The coverage figure means no LCOV report was supplied to Sonar; it does not mean the 81 automated tests did not run.

Semgrep and SonarScanner are installed locally, and repeatable `scan:semgrep` and `scan:sonar` package commands are available. A Sonar scan still requires a reachable SonarQube/SonarCloud service and token; the verification above used an ephemeral local Community server and did not upload source to a third party.

## Known limitations and residual risks

1. **Authenticated production E2E remains pending.** The automated production test requires a fresh teacher OTP cookie. The deployed public shell and headers were verified, but the post-deployment speech/silence, private Realtime, summary, stop, and cleanup flow has not yet completed as one automated authenticated run.
2. **Real workshop scale has not been proven.** The load test used a simulated provider. ElevenLabs latency and rate/concurrency limits are expected to be the first bottleneck. Keep initial concurrency at 4 and watch queue/latency/error metrics.
3. **Phone/browser variability remains.** Supported MediaRecorder formats, operating-system background suspension, microphone routing, low-power modes, and unstable networks can still affect individual devices. Retry/idempotency reduces data loss but cannot make a suspended browser record audio.
4. **No independent penetration test has occurred.** The posture is based on source review and automated adversarial tests, not a third-party assessment.
5. **Static analysis is not yet continuous.** Semgrep and Sonar now pass their security/reliability gates locally, but they are not yet enforced by GitHub CI and scan results can become stale. Sonar's 163 maintainability smells should be reduced incrementally when the affected code is changed, rather than through a risky bulk rewrite.
6. **Operational alerting is still human-driven.** Metrics exist, but provider-error, sustained-queue, and authentication anomaly alerts should be configured before relying on unattended operation.
7. **Service-role impact remains high by design.** The Node service needs privileged database access. A server compromise could bypass RLS, so secret rotation, least-privilege hosting access, timely patching, and log review remain essential.
8. **The report is time-bound.** It describes revision `06fa50b` and the configuration/tests observed on 2026-07-21/22. Later code, database, provider, or dashboard changes require reassessment.

## Recommended release decision

The application is ready for a **supervised pilot/test session**, including multiple student phones. Before calling it generally production-ready, complete the authenticated production E2E test, conduct at least one monitored rehearsal with the expected device mix, confirm provider latency/error rates, and configure basic alerts.

## Files changed in the deployed revision

The deployed revision changed 37 files: 1,567 insertions and 296 deletions.

```text
.env.example
client/src/components/ui/field.jsx
client/src/features/admin/components/SessionHeader.jsx
client/src/hooks/useAdminSocket.js
client/src/hooks/useAudioRecorder.js
client/src/hooks/useStudentSocket.js
client/src/lib/audioUpload.js
client/src/pages/AdminDashboard.jsx
client/src/pages/CheckboxDashboard.jsx
docs/hybrid-transcription-runbook-2026-07-21.md
package.json
scripts/apply-native-realtime-migration.mjs
scripts/browser-security-e2e.mjs
scripts/hybrid-load-test.mjs
scripts/live-production-e2e.mjs
scripts/migrate-production.mjs
scripts/realtime-multigroup-e2e.mjs
scripts/verify-openai-provider.mjs
server/config/env.js
server/db/cutover/reset_operational_data.sql
server/db/cutover/rollback_operational_data.sql
server/db/db.js
server/db/migrations/20260728_hybrid_live_audio_and_rolling_summaries.sql
server/middleware/upload.js
server/routes/api.js
server/routes/views.js
server/services/elevenlabs.js
server/services/liveAudioCapacity.js
server/services/liveAudioChunks.js
server/services/openai.js
server/services/rollingSummary.js
tests/api.integration.helpers.mjs
tests/audio-upload-retry.test.mjs
tests/hybrid-architecture.test.mjs
tests/native-audio-formdata.test.mjs
tests/security.adversarial.test.mjs
tests/upload.validation.test.mjs
```

For detailed operating values, architecture, cost assumptions, and verification commands, see [Hybrid transcription and rolling-summary architecture](./hybrid-transcription-runbook-2026-07-21.md).
