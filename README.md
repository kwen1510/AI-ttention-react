# AI(ttention)

Secure classroom recording, transcription, live summaries, rubric tracking, and asynchronous
discussion activities.

## Current architecture

- React/Vite single-page application served by Express.
- Supabase Postgres is the system of record.
- Supabase Auth provides teacher email OTP identities and anonymous student identities.
- Teacher sessions are stored in an encrypted, signed, `HttpOnly`, `Secure`, `SameSite=Strict`
  cookie. Supabase tokens are not stored in browser Web Storage.
- Supabase private Realtime Broadcast distributes session and group events. The application has no
  custom WebSocket server.
- Express is the only browser-facing application-data boundary. Browser roles have no direct
  access to application tables; RLS is enabled on every public table.
- ElevenLabs performs speech-to-text and OpenAI performs summary/rubric analysis.

## Active product modes

- **Summary:** timed group recordings, incremental transcripts, teacher summary release.
- **Checkbox:** transcript evidence evaluated against teacher-created rubric criteria.
- **Async:** high-entropy share links for recordings outside a live class.
- **Prompts:** global and teacher-owned reusable prompts.
- **History:** role-scoped session history and exports.

## Local setup

Use Node 24 as selected by `.nvmrc` and `package.json`.

```sh
npm install
npm run build
npm start
```

The untracked `.env` must follow `.env.example`. Never put the migration database URL or server
secrets in a `VITE_` variable. Validate a deployment environment without printing values:

```sh
npm run deploy:preflight
```

`SUPABASE_DB_URL` is only for controlled migration/archive commands and must not be deployed to
DigitalOcean.

## Verification

Run the complete local gate before pushing a production commit:

```sh
npm run test:local:core
```

Verify the configured providers using speech and silence fixtures without printing either key:

```sh
SPEECH_AUDIO_PATH=/absolute/path/to/speech.webm \
SILENCE_AUDIO_PATH=/absolute/path/to/silence.wav \
npm run test:local:providers
```

`test:local:core` includes 70 unit/API/adversarial tests, a 25-group Summary and Checkbox
simulation, isolated browser workflows, browser cookie/security coverage, dependency audit, and a
final production build/smoke test.
The provider gate requires both usable speech transcription with silence suppression and a real
OpenAI summary.

After anonymous Auth is enabled in the intended Supabase project, run the cleanup-safe production
boundary probe. It creates and deletes one synthetic anonymous user without printing its token or
identifier:

```sh
npm run db:verify:student-boundary
```

Every build exposes its exact Git revision at `/version.json`. The same short revision is present in
`meta[name="app-version"]` and the hidden `#app-version` span. Compare that value with the reviewed
GitHub commit before running production tests.

## Security invariants

- `SUPABASE_SECRET_KEY`, provider keys, cookie/join secrets, and database URLs are server-only.
- Teacher authorization is based on the database whitelist and session ownership, never a client
  claim.
- Student REST requests require a genuine anonymous Supabase user plus an exact, expiring database
  membership for the requested session/group.
- Realtime topics are private and authorized by membership RLS.
- Generated classrooms are 60-minute pending reservations and are deleted if recording never
  starts. First start promotes the record to a four-hour classroom; teacher end then preserves it,
  revokes memberships, and allows only the persisted 15-second final-audio grace window.
- Audio MIME type, file signature, size, session, group, idempotency key, and membership are checked
  before transcription.
- Unsafe requests require an exact HTTPS origin/host and are rate-limited with fixed public errors.
- Operational reset, migration, and rollback commands refuse to run without a verified archive.

## Operations

- Complete archive, migration, deployment, ES256 rotation, validation, retention, and rollback:
  [`docs/production-respin-runbook-2026-07-20.md`](docs/production-respin-runbook-2026-07-20.md)
- Requirement-by-requirement evidence and remaining gates:
  [`docs/completion-evidence-matrix-2026-07-20.md`](docs/completion-evidence-matrix-2026-07-20.md)
- Secure Auth Lab control mapping:
  [`docs/secure-auth-lab-control-mapping-2026-07-20.md`](docs/secure-auth-lab-control-mapping-2026-07-20.md)
- Async-mode threat model:
  [`docs/async-mode-security-plan.md`](docs/async-mode-security-plan.md)

Do not disable legacy Supabase keys or revoke the legacy JWT secret until the runbook's new-key,
anonymous student, private Realtime, audio, expiry, rollback, and ES256 wait-period gates all pass.
