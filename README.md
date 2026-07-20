# AI(ttention) – Architecture, Auth, and Realtime Flow

This document summarizes the authentication model, Supabase Realtime flow, and the main features/logic across the server and React UIs.

## Contents
- Auth Logic (client + server)
- Supabase Realtime Flow
- Features and Per‑File Walkthrough
- Key REST APIs and Flows
- Frontend Build & Dev Scripts

---

## Frontend Build & Dev Scripts

- `npm run client:dev` – starts the Vite dev server (React SPA) for the dashboards while the Express API runs separately.
- `npm run client:build` – builds the React client into `/dist`; the Express server serves this bundle in production.
- `npm run client:preview` – preview the built client locally via Vite.

The legacy HTML/JS controllers now live under `client/src/templates` (markup snapshots) and `client/src/scripts/*_inline_original.js` (imperative controllers). React mounts these assets per route and supplies shared auth context/state.

---

## Auth Logic

- Client-side (Supabase, OTP)
  - `client/src/pages/LoginPage.jsx` renders the OTP flow and reuses the legacy logic via `client/src/scripts/initAdminAuth.js`. Sign-in is restricted by configured domains (`window.ADMIN_ALLOWED_DOMAINS` / `window.ADMIN_DOMAIN`, e.g. `ri.edu.sg`, `schools.gov.sg`).
  - Admin dashboards (rendered through the React routes `/admin`, `/checkbox`, `/mindmap`, `/prompts`, `/data`) dynamically mount the legacy controllers from `client/src/scripts/*_inline_original.js`. Each page still relies on the same Supabase guard behaviour exposed by `AuthProvider` which wraps `window.fetch` with the bearer token injection described below.
    - Ensures a Supabase session exists and the email domain is allowed.
    - Wraps `window.fetch` to automatically attach `Authorization: Bearer <supabase_jwt>` to any "/api/..." requests.

  The React `AuthProvider` in `client/src/components/AuthContext.jsx` now provides the fetch wrapper:
  ```js
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    if (needsAuth(input)) {
      const currentSession = session ?? (await supabase.auth.getSession()).data.session;
      if (currentSession?.access_token) {
        const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined) || {});
        headers.set('Authorization', `Bearer ${currentSession.access_token}`);
        init = { ...init, headers };
      }
    }
    return originalFetch(input, init);
  };
  ```

- Server‑side (token verification)
  - `index.js` uses a Supabase service client to validate the incoming Bearer token and attach a teacher identity to requests.

  Example (server auth):
  ```js
  // index.js
  async function authenticateTeacher(req) {
    const authHeader = req.headers.authorization || '';
    if (!authHeader.startsWith('Bearer ')) throw new Error('Missing bearer token');
    const token = authHeader.replace('Bearer', '').trim();
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) throw new Error(error?.message || 'Invalid token');
    return data.user; // { id, email, ... }
  }
  ```
  - Protected endpoints call `requireTeacher(req, res)` and compare `session.owner_id` to `teacher.id` for authorization.

Notes
- Server uses a new `sb_secret_...` key; browsers use only `sb_publishable_...` and Supabase-issued user JWTs.
- Auth is enforced on REST APIs; socket events are unprotected by JWT but scoped to session codes/rooms.

---

## Supabase Realtime Flow

Supabase Realtime Broadcast now powers live classroom fan-out. The Node server remains responsible for REST APIs, audio ingestion, STT, AI processing, and persistence, but teacher/student UIs subscribe to Supabase Realtime topics rather than opening app-owned Socket.IO rooms.

- Topics:
  - Session-wide: `classroom:<SESSION_CODE>`
  - Group-specific: `classroom:<SESSION_CODE>:group:<GROUP_NUMBER>`
- Key events:
  - Session topic: `record_now`, `stop_recording`, `admin_update`, `student_joined`, `student_left`, `upload_status`, `upload_error`
  - Group topic: `transcription_and_summary`, `summary_state`, `checklist_state`
- Students do not log in. They join by session code or signed join URL, then receive the Realtime topic names from `POST /api/session/:code/student-join`.
- The legacy Socket.IO/WebSocket server and client paths have been removed; all live classroom fan-out uses private Supabase Broadcast.

Student join and heartbeat now use REST:
```js
await fetch(`/api/session/${code}/student-join`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ group })
});
```

Server fan-out uses `publishRealtimeEvent`:
```js
await publishRealtimeEvent({
  sessionCode,
  groupNumber,
  event: REALTIME_EVENTS.TRANSCRIPTION_AND_SUMMARY,
  audience: 'group',
  payload
});
```

Start flow:
- When a teacher starts a session (`POST /api/session/:code/start`), the server marks memory state active and broadcasts `record_now` on the session Realtime topic.

---

## Features and Per‑File Walkthrough

- Server: `index.js`
  - Session lifecycle (in‑memory + persisted):
    - `GET /api/new-session` creates an in‑memory session (code, interval, owner).
    - `POST /api/session/:code/start` persists if first start, marks active, begins auto-summary timers (for summary mode), and publishes `record_now`.
    - `POST /api/session/:code/stop` marks inactive, updates duration, and publishes `stop_recording`.
    - `GET /api/session/:code/status` returns memory/DB state for the owner.
  - Audio ingestion and processing:
    - Summary mode: `POST /api/transcribe-chunk`
      - Validates chunk, forwards to ElevenLabs STT.
      - Appends a transcript segment (per group) and trims history.
      - Generates a cumulative summary via OpenAI and upserts to `summaries`.
      - Emits to students (`transcription_and_summary`) and to admin (`admin_update`).
    - Mindmap mode: `POST /api/transcribe-mindmap-chunk`
      - Forwards to STT, then uses Groq to generate/expand a structured mindmap.
      - Persists mindmap JSON and chat history; returns JSON to the UI.
  - Mindmap admin APIs:
    - `POST /api/mindmap/start`, `/api/mindmap/generate`, `/api/mindmap/expand`, `/api/mindmap/process` for creating, seeding, and evolving mindmaps.
  - Checkbox mode:
    - `POST /api/checkbox/start` stores scenario/criteria; session stays inactive until /start.
    - `POST /api/checkbox/process` analyzes live transcript chunks against rubric criteria and applies locking rules:
      - GREEN is locked; GREY can upgrade to RED/GREEN; RED can only upgrade to GREEN.
      - Emits `admin_update` and a full `checklist_state` to both admin and students (controls visibility via `released_groups`).

    Example (locking core):
    ```js
    // index.js
    if (existingProgress?.status === 'green') {
      // locked – skip
    } else if (existingProgress?.status === 'grey' && (newStatus==='red'||newStatus==='green')) {
      shouldUpdate = true;
    } else if (existingProgress?.status === 'red' && newStatus==='green') {
      shouldUpdate = true;
    }
    ```
  - History/data export:
    - `GET /api/history`, `GET /api/history/session/:code`, `GET /api/data/...` aggregate transcripts, summaries, mindmap/checkbox state for dashboards.
  - Prompt management:
    - Per‑session prompt: `POST/GET /api/session/:code/prompt` (owner‑only).
    - Library: `GET/POST/PUT/DELETE /api/prompt-library`, plus advanced endpoints for teacher prompt collections.

- Admin dashboard: `client/src/pages/AdminDashboard.jsx`
  - Protected by `guard-admin.js`.
  - Creates/starts/stops sessions, shows group tiles with live transcript/summary, and includes heartbeat UI.
  - Emits `admin_join` and consumes `admin_update`, `transcription_and_summary`.

- Student UI: `client/src/pages/StudentView.jsx`
  - Join via session code + group.
  - Records microphone in timed chunks; uploads to `/api/transcribe-chunk`.
  - Heartbeats every 10s; shows connection and recording status.
  - Renders `transcription_and_summary` and (in checkbox mode) `checklist_state` once teacher releases.

- Mindmap (teacher): `client/src/pages/MindmapPage.jsx`
  - Protected by `guard-admin.js`.
  - Starts a mindmap session and auto‑records; uploads to `/api/transcribe-mindmap-chunk`.
  - Visualizes the evolving mindmap (D3), maintains an AI chat log for transparency.

- Checkbox (teacher): `client/src/pages/CheckboxDashboard.jsx`
  - Protected by `guard-admin.js`.
  - Defines scenario + rubric criteria, controls start/stop, and releases the checklist to students.

- Async discussion (teacher): `client/src/pages/AsyncDashboard.jsx`
  - Protected teacher workspace for creating an asynchronous discussion activity.
  - Generates an obfuscated `/async/j/:shareId` student link instead of exposing a classroom code.
  - Shows group reports with summaries, feedback, timestamped ideas formed/rejected, decisions, and open questions.

- Async discussion (student): `client/src/pages/AsyncStudentView.jsx`
  - Public share-link page for group phone recording outside class.
  - Students join by group number, record with the microphone, and upload to `/api/async/join/:shareId/upload`.
  - Shows the latest transcript plus summary/process feedback after analysis.

- Prompt Library (teacher): `client/src/pages/PromptsPage.jsx`
  - View/search/create/edit/delete prompts across modes; leverages the REST prompt endpoints.

- Data dashboard (teacher): `client/src/pages/DataExplorer.jsx`
  - Paginates and filters sessions, shows per‑mode summaries; can drill down into detailed group transcripts and summaries.

- Login: `client/src/pages/LoginPage.jsx`
  - OTP email flow via Supabase; wraps `fetch` to include the Bearer token for `/api/*` calls on that page too.

- Legacy/utility: `MONGO_ARCHIVE/public_export/export.html`
  - Small helper for exporting a legacy MongoDB to JSON by POSTing to `/export` (not used in the current Supabase path).

---

## Key End‑to‑End Flows

- Summary Mode (teacher + students)
  1) Teacher creates session (`/api/new-session`), shares code.
  2) Students join through `POST /api/session/:code/student-join`; when teacher starts (`/start`), server broadcasts `record_now` through Supabase Realtime.
  3) Students upload periodic chunks (`/api/transcribe-chunk`). Server STT → append → summarise → publish `transcription_and_summary` to the group topic + `admin_update` to the session topic.

- Mindmap Mode
  1) Teacher creates mindmap session and sets topic.
  2) As audio chunks arrive (`/api/transcribe-mindmap-chunk`), server STT → Groq mindmap generation/expansion → persist → return JSON to UI to render/update.

- Checkbox Mode
  1) Teacher seeds scenario/criteria and starts the session.
  2) Live chunks analyzed against rubric; progress respects locking rules; teacher can release checklists to students → server publishes `checklist_state` for the group.

- Async Mode
  1) Teacher creates an async activity through `POST /api/async/sessions`, with instructions and a feedback/process prompt.
  2) Server stores a teacher-owned `async_sessions` row and returns a high-entropy share URL at `/async/j/:shareId`.
  3) Students open the link, join a group via `POST /api/async/join/:shareId/groups`, and upload recordings through `POST /api/async/join/:shareId/upload`.
  4) Server STT → transcript segment persistence → summary/process analysis → `async_group_reports` update.

Security planning for async mode is tracked in [`docs/async-mode-security-plan.md`](docs/async-mode-security-plan.md).

Apply the async Supabase tables before using this mode against a real project:
```bash
DATABASE_URL="postgresql://..." npm run db:migrate:async
```
Or paste `server/db/migrations/20260601_async_mode.sql` into the Supabase SQL editor.
After applying it, verify the REST schema cache can see the tables:
```bash
set -a && source .env && set +a
npm run db:verify:async
```

---

## Representative Snippets

Publish results to clients after transcription (summary mode):
```js
await publishRealtimeEvent({
  sessionCode,
  groupNumber,
  event: REALTIME_EVENTS.TRANSCRIPTION_AND_SUMMARY,
  audience: 'group',
  payload: {
    transcription: { text, words, duration, wordCount },
    summary,
    isLatestSegment: true
  }
});
await publishRealtimeEvent({
  sessionCode,
  groupNumber,
  event: REALTIME_EVENTS.ADMIN_UPDATE,
  audience: 'session',
  payload: { group: groupNumber, latestTranscript: text, summary, stats }
});
```

Checklist release to students (teacher → server → everyone in session):
```js
const checklistData = { groupNumber, criteria: /* from DB + cache */, isReleased: true, sessionCode };
await publishRealtimeEvent({
  sessionCode,
  groupNumber,
  event: REALTIME_EVENTS.CHECKLIST_STATE,
  audience: 'both',
  payload: checklistData
});
```

---

## Environment

- Supabase: `SUPABASE_URL`, server-only `SUPABASE_SECRET_KEY`, and browser `SUPABASE_PUBLISHABLE_KEY`. No JWT signing secret is used by the app.
- Authentication/session security: server-only `AUTH_COOKIE_SECRET` and `SESSION_JOIN_SECRET` (independent random values, at least 32 characters), `AUTH_COOKIE_TTL_SECONDS` (default 30 days), and `CLASSROOM_SESSION_TTL_MINUTES` (default 240 minutes).
- Secure archive, migration, deployment, ES256 rotation, validation, and rollback: see `docs/production-respin-runbook-2026-07-20.md`.
- Secure Auth Lab invariant mapping and residual gates: see `docs/secure-auth-lab-control-mapping-2026-07-20.md`.
- Requirement-by-requirement proof and remaining production gates: see `docs/completion-evidence-matrix-2026-07-20.md`.
- STT: `ELEVENLABS_KEY` for ElevenLabs Speech‑to‑Text.
- LLM: `OPENAI_API_KEY` (or `OPENAI_KEY`) for summaries and mindmap generation/expansion.

---

## Notes and Considerations
- Student access remains form-free but uses a short-lived anonymous Supabase Auth identity plus session code or signed join link.
- Supabase Realtime topics are private and authorized by database membership keyed to `auth.uid()`.
- Audio ingestion validates headers (esp. WebM) and sizes; errors are surfaced to admin and students with retry/backoff.
- Transcript storage is incremental per group with trimming to bound history size.
- Mindmap API is disabled if `OPENAI_API_KEY` (or `OPENAI_KEY`) is unset; UI reflects that via error messaging.
