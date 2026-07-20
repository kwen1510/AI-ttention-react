# Async Mode And Security Hardening Plan

## Async Mode Design

The asynchronous mode creates a teacher-owned activity with a high-entropy `share_id`.
Students open `/async/j/:shareId`; the link does not expose the live classroom session code.
Students choose a group number and record on their own device. Uploads are accepted only while
the activity is `open` and before its optional expiry. The server transcribes each audio segment,
stores timestamped segments, and regenerates a group report containing:

- Summary of the discussion.
- Teacher-facing feedback from the activity prompt.
- Process tracking: ideas formed, ideas rejected, decisions, open questions, and an evidence timeline.

The current implementation stores this in:

- `async_sessions`: teacher-owned activity, instructions, feedback prompt, `share_id`, status, expiry.
- `async_groups`: group identity inside an async activity.
- `async_segments`: timestamped transcript segments.
- `async_group_reports`: latest summary, feedback, and process JSON per group.

The migration enables RLS and restricts authenticated direct reads to the owning teacher. Public
student upload access is intentionally handled only through the Express API, not direct Supabase
browser writes.

## Priority Security Work

### P0 Before Production

1. Rotate and move secrets.
   Supabase documents that secret and service-role keys bypass RLS and must never be exposed in
   browser code, URLs, logs, or public repos. Move all elevated Supabase credentials to deployment
   secrets only, rotate anything that has been committed or shared, and prefer new `sb_secret_*`
   server keys where available.

2. Apply the async migration and verify RLS.
   Supabase RLS policies are the database backstop. Run the async migration, then verify anon users
   cannot select, insert, update, or delete any async tables through the Data API. Verify teachers can
   only see their own async rows.

3. Lock down public async upload endpoints.
   Add per-share and per-IP rate limits tighter than authenticated teacher limits. Add caps for:
   max uploads per group, max active groups, max total recording minutes, max segments per group,
   and max retained transcript characters.

4. Harden audio upload validation.
   OWASP's file upload guidance calls out allowlisted types, content-type distrust, generated
   filenames, size limits, storage outside the webroot, and malware/sandbox checks. Keep generated
   filenames, enforce the current size cap, validate actual file signatures when feasible, reject
   unknown MIME types, and never serve raw uploads back from the webroot.

5. Maintain the private Supabase Realtime boundary.
   Socket.IO has been removed. Keep teacher, student-control, and per-group topics separated; require
   server-signed topic-scoped JWTs and the `realtime.messages` SELECT policy for every browser.

6. Add object-level authorization tests for every teacher route.
   OWASP API Security Top 10 2023 lists broken object-level authorization as the top API risk. Add
   tests proving Teacher A cannot read, close, export, or alter Teacher B's async sessions, live
   sessions, prompts, history, checklist config, or reports.

### P1 Strongly Recommended

1. Share-link lifecycle controls.
   Add teacher actions to regenerate a share link, close the link, set expiry, and revoke uploads for
   a specific group. Store only a hash of future share tokens if you want token disclosure in DB logs
   to be non-usable.

2. Abuse monitoring.
   Log public async join/upload attempts with share id, group number, IP hash, user agent hash,
   upload size, duration, and rejection reason. Alert on high rejection rates, many groups from one
   IP, and repeated closed-link uploads.

3. Content safety and privacy.
   Audio and transcripts can contain student personal data. Define retention windows, delete/export
   flows, and teacher-visible consent language. Avoid storing raw audio unless explicitly needed.
   If raw audio is later stored in Supabase Storage, use private buckets and RLS policies.

4. Prompt-injection isolation.
   Treat student transcripts as untrusted input. Keep system/developer prompts separate from
   transcript text, require structured JSON for process analysis, validate JSON shape server-side,
   and never let model output control URLs, SQL, file paths, or authorization decisions.

5. CSRF and browser posture.
   Teacher APIs use a SameSite HttpOnly cookie. Keep the unsafe-method origin/fetch-metadata guard,
   exact production origins, and CSP; never make state-changing routes GET requests.

6. Dependency and supply-chain controls.
   Run `npm audit` in CI, pin major versions, enable Dependabot or equivalent, and fail CI on
   critical vulnerabilities in request parsing, file upload, auth, or markdown rendering packages.

### P2 Operational Maturity

1. Security test suite.
   Add automated tests for RLS policy expectations, public share-link enumeration resistance, expired
   links, closed sessions, upload size/type rejection, authorization boundary checks, and exported
   data scoping.

2. Incident response.
   Keep a credential inventory, rotation checklist, audit log access, and a tested procedure for
   disabling all public async uploads quickly.

3. Data minimization.
   Summaries and process reports are usually enough for teacher review. Prefer not storing raw audio.
   Add scheduled cleanup for async segments/reports after the school-defined retention period.

4. Admin visibility.
   The product requirement says admin UI is not needed. Keep that stance unless there is a clear
   operational need. If an admin UI is added later, require a separate admin role, explicit audit
   logs, and least-privilege read-only defaults.

## Verification Checklist

- Public async link response does not include internal session id, teacher id, or classroom code.
- Public upload fails when the async activity is closed or expired.
- Teacher detail routes require auth and owner match.
- RLS is enabled on all async tables in Supabase.
- Anon Supabase clients cannot directly read async rows.
- Upload limits and MIME checks reject invalid files before transcription.
- Process analysis stores timestamps and evidence for ideas formed, rejected, decisions, and open questions.

## References

- [OWASP API Security Top 10 2023](https://owasp.org/API-Security/editions/2023/en/0x00-header/)
- [OWASP File Upload Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html)
- [OWASP Input Validation Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html)
- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys)
- [Supabase Storage access control](https://supabase.com/docs/guides/storage/security/access-control)
