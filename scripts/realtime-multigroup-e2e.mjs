import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const USE_REAL_AI = process.env.REAL_AI_E2E === "true";

process.env.NODE_ENV = "test";
process.env.PORT = process.env.PORT || "0";
process.env.HOST = process.env.HOST || "127.0.0.1";
process.env.SKIP_SUPABASE_BOOTSTRAP = "true";
process.env.APP_ORIGINS = process.env.APP_ORIGINS || "http://127.0.0.1,http://localhost"; // NOSONAR -- loopback test only.
process.env.SUPABASE_URL = process.env.SUPABASE_URL || "https://example.supabase.co";
process.env.SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY || "sb_secret_test";
process.env.SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || "sb_publishable_test";
process.env.SESSION_JOIN_SECRET = process.env.SESSION_JOIN_SECRET || "multi-group-e2e-secret";
process.env.STAGING_AUTH_BYPASS = "true";
process.env.STAGING_BYPASS_TEACHER_ID = "00000000-0000-4000-8000-000000000001";
process.env.STAGING_BYPASS_TEACHER_EMAIL = "staging-teacher@example.com";
process.env.ALLOW_DEV_TEST = "true";
process.env.PENDING_SESSION_TTL_MINUTES = "60";
process.env.MOCK_AI_SERVICES = USE_REAL_AI ? "false" : "true";
if (!USE_REAL_AI) {
  process.env.OPENAI_API_KEY = "";
  process.env.OPENAI_KEY = "";
  process.env.ELEVENLABS_KEY = "";
}

const { createDbOverrides } = await import("../tests/api.integration.helpers.mjs");
const dbModule = await import("../server/db/db.js");
const realtimeModule = await import("../server/services/realtime.js");
const rollingSummaryModule = await import("../server/services/rollingSummary.js");
const authModule = await import("../server/middleware/auth.js");
const { createAuthOverrides } = await import("../tests/_helpers.mjs");
const { activeSessions } = await import("../server/services/state.js");
const { http, startServer } = await import("../index.js");

const groupCount = Math.max(1, Math.min(25, Number(process.env.E2E_GROUP_COUNT) || 5));
const GROUPS = Array.from({ length: groupCount }, (_, index) => index + 1);
const teacherHeaders = {
  "Content-Type": "application/json",
  "x-staging-auth-bypass": "teacher"
};

const dbOverrides = createDbOverrides({
  sessions: [],
  groups: [],
  transcripts: [],
  summaries: [],
  summary_snapshots: [],
  session_logs: [],
  session_prompts: [],
  checkbox_sessions: [],
  checkbox_criteria: [],
  checkbox_progress: [],
  teacher_prompts: []
});
const broadcasts = [];
authModule.__setAuthTestOverrides(createAuthOverrides());

function getBaseUrl() {
  const address = http.address();
  if (!address || typeof address === "string" || !address.port) {
    throw new Error("Multi-group e2e server did not expose a TCP port");
  }

  return `http://127.0.0.1:${address.port}`;
}

async function requestJson(pathname, options = {}) {
  const response = await fetch(`${getBaseUrl()}${pathname}`, options);
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(`${pathname} returned ${response.status}: ${text}`);
  }
  return body;
}

async function teacherJson(pathname, options = {}) {
  return requestJson(pathname, {
    ...options,
    headers: {
      ...teacherHeaders,
      ...(options.headers || {})
    }
  });
}

async function createSession(mode) {
  const session = await requestJson(`/api/new-session?mode=${mode}`, {
    method: "POST",
    headers: teacherHeaders
  });
  assert.match(session.code, /^[A-Z0-9]{6}$/);
  assert.equal(session.mode, mode);
  assert.equal(session.pending, true);
  const pendingLifetime = new Date(session.expiresAt).getTime() - Date.now();
  assert.equal(pendingLifetime > 55 * 60_000 && pendingLifetime <= 60 * 60_000, true);
  return session.code;
}

async function joinGroups(sessionCode) {
  const joins = [];
  for (const group of GROUPS) {
    const studentToken = `student-token-${group}`;
    const payload = await requestJson(`/api/session/${sessionCode}/student-join`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${studentToken}` },
      body: JSON.stringify({ group })
    });
    assert.equal(payload.code, sessionCode);
    assert.equal(payload.group, group);
    assert.match(payload.realtime.studentTopic, /^classroom:[A-Za-z0-9_-]{32}:students$/);
    assert.equal(payload.realtime.studentTopic.includes(sessionCode), false);
    assert.equal(
      payload.realtime.groupTopic,
      `${payload.realtime.studentTopic.replace(/:students$/, "")}:group:${group}`
    );
    assert.equal(Object.hasOwn(payload.realtime, "accessToken"), false);
    joins.push(payload);
  }
  return joins;
}

async function startSession(sessionCode, mode) {
  const result = await teacherJson(`/api/session/${sessionCode}/start`, {
    method: "POST",
    body: JSON.stringify({ interval: 15000, mode })
  });
  assert.equal(result.success, true);
  assert.equal(result.code, sessionCode);
  assert.equal(new Date(result.expiresAt).getTime() > Date.now() + 3.9 * 60 * 60_000, true);
}

async function stopSession(sessionCode) {
  const result = await teacherJson(`/api/session/${sessionCode}/stop`, {
    method: "POST"
  });
  assert.equal(result.success, true);
}

function audioMime(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".wav") return "audio/wav";
  if (extension === ".m4a" || extension === ".mp4") return "audio/mp4";
  if (extension === ".ogg") return "audio/ogg";
  if (extension === ".mp3") return "audio/mpeg";
  if (extension === ".aac") return "audio/aac";
  if (extension === ".flac") return "audio/flac";
  return "audio/webm";
}

async function uploadSpeech(sessionCode, group, speech, realAudioPath = null) {
  const formData = new FormData();
  const bytes = realAudioPath
    ? await readFile(realAudioPath)
    : Buffer.from(`MOCK_TRANSCRIPT: ${speech}`);
  const type = realAudioPath ? audioMime(realAudioPath) : "audio/webm";
  formData.append(
    "file",
    new Blob([bytes], { type }),
    realAudioPath ? path.basename(realAudioPath) : `group-${group}.webm`
  );
  formData.append("sessionCode", sessionCode);
  formData.append("groupNumber", String(group));
  formData.append("chunkId", `multigroup-${sessionCode}-${group}-${Date.now()}`);

  return requestJson("/api/transcribe-chunk", {
    method: "POST",
    headers: {
      "x-session-code": sessionCode,
      "x-group-number": String(group),
      Authorization: `Bearer student-token-${group}`
    },
    body: formData
  });
}

function eventCount(sessionCode, event, topicPattern = null) {
  return broadcasts.filter((broadcast) =>
    broadcast.event === event &&
    broadcast.payload?.sessionCode === sessionCode &&
    (!topicPattern || topicPattern.test(broadcast.topic))
  ).length;
}

function eventsFor(sessionCode, event) {
  return broadcasts.filter((broadcast) =>
    broadcast.event === event &&
    broadcast.payload?.sessionCode === sessionCode
  );
}

async function runSummaryMode() {
  const sessionCode = await createSession("summary");
  await joinGroups(sessionCode);
  assert.equal(eventCount(sessionCode, "student_joined"), GROUPS.length);

  await startSession(sessionCode, "summary");
  assert.equal(eventCount(sessionCode, "record_now"), 2);

  const uploadResults = [];
  for (const group of GROUPS) {
    const speech = [
      `Group ${group} says renewable energy can reduce emissions.`,
      `Student ${group} adds that solar panels and wind farms need planning.`,
      `The group asks for clearer examples before the teacher releases feedback.`
    ].join(" ");
    const result = await uploadSpeech(sessionCode, group, speech, process.env.SUMMARY_AUDIO_PATH);
    assert.equal(result.success, true);
    assert.equal(result.mode, "summary");
    if (USE_REAL_AI) {
      assert.equal(result.transcript.trim().length > 0, true);
    } else {
      assert.match(result.transcript, new RegExp(`Group ${group} says renewable energy`, "i"));
    }
    assert.equal(result.summaryQueued, true);
    uploadResults.push(result);

    if (USE_REAL_AI && group === GROUPS[0] && process.env.SILENCE_AUDIO_PATH) {
      const silence = await uploadSpeech(sessionCode, group, "", process.env.SILENCE_AUDIO_PATH);
      assert.equal(silence.success, true);
      assert.equal(silence.skipped, true);
      assert.equal(silence.reason, "No speech detected");
    }
  }

  const session = dbOverrides.dump("sessions").find((record) => record.code === sessionCode);
  const batch = await rollingSummaryModule.runRollingSummary({ sessionCode, sessionId: session._id });
  assert.equal(batch.committed, GROUPS.length);
  const summaryRows = dbOverrides.dump("summaries");
  for (const summary of summaryRows) assert.match(summary.text, /renewable energy/i);

  assert.equal(eventCount(sessionCode, "admin_update"), GROUPS.length);
  assert.equal(eventCount(sessionCode, "transcription_and_summary", /:group:/), GROUPS.length);

  for (const group of GROUPS) {
    const release = await teacherJson(`/api/session/${sessionCode}/release-summary`, {
      method: "POST",
      body: JSON.stringify({ groupNumber: group, isReleased: true })
    });
    assert.equal(release.success, true);
    assert.equal(release.summaryState.groupNumber, group);
    assert.equal(release.summaryState.isReleased, true);
  }

  assert.equal(eventCount(sessionCode, "summary_state"), GROUPS.length * 4);
  await stopSession(sessionCode);
  assert.equal(eventCount(sessionCode, "stop_recording"), 2);

  return {
    sessionCode,
    groups: GROUPS.length,
    transcripts: uploadResults.map((result) => result.transcript),
    summaries: summaryRows.map((result) => result.text)
  };
}

async function configureChecklist(sessionCode) {
  const result = await teacherJson("/api/checkbox/session", {
    method: "POST",
    body: JSON.stringify({
      sessionCode,
      interval: 15000,
      strictness: 2,
      scenario: "Students explain when back titration is useful.",
      criteria: [
        {
          id: 0,
          description: "Explains why back titration is used",
          rubric: "Mentions that calcium carbonate is not soluble or does not react directly enough.",
          status: "grey"
        },
        {
          id: 1,
          description: "Links the method to an experimental decision",
          rubric: "Gives a reason for choosing the method rather than only naming it.",
          status: "grey"
        }
      ]
    })
  });

  assert.equal(result.success, true);
  assert.equal(typeof result.sessionId, "string");
  assert.equal(result.criteriaIds.length, 2);
}

async function runChecklistMode() {
  const sessionCode = await createSession("checkbox");
  await configureChecklist(sessionCode);
  await joinGroups(sessionCode);
  assert.equal(eventCount(sessionCode, "student_joined"), GROUPS.length);

  await startSession(sessionCode, "checkbox");
  assert.equal(eventCount(sessionCode, "record_now"), 2);

  const uploadResults = [];
  for (const group of GROUPS) {
    const speech = [
      `Group ${group} says back titration is used because CaCO3 is not soluble.`,
      `They explain that the direct reaction is not reliable enough for the class investigation.`,
      `They ask the teacher to check whether their reason is specific enough.`
    ].join(" ");
    const result = await uploadSpeech(sessionCode, group, speech, process.env.CHECKBOX_AUDIO_PATH);
    assert.equal(result.success, true);
    assert.equal(result.mode, "checkbox");
    assert.equal(result.matches >= 1, true);
    uploadResults.push(result);
  }

  assert.equal(eventCount(sessionCode, "checkbox_update"), GROUPS.length);
  assert.equal(eventCount(sessionCode, "checklist_state"), GROUPS.length * 2);

  for (const group of GROUPS) {
    const release = await teacherJson(`/api/checkbox/${sessionCode}/release`, {
      method: "POST",
      body: JSON.stringify({ groupNumber: group, isReleased: true })
    });
    assert.equal(release.success, true);
    assert.equal(release.checklistState.groupNumber, group);
    assert.equal(release.checklistState.isReleased, true);
    assert.equal(release.checklistState.criteria[0].status, "green");
  }

  await stopSession(sessionCode);
  assert.equal(eventCount(sessionCode, "stop_recording"), 2);

  return {
    sessionCode,
    groups: GROUPS.length,
    matches: uploadResults.map((result) => result.matches)
  };
}

try {
  dbModule.__setDbTestOverrides(dbOverrides);
  realtimeModule.__setRealtimeTestPublisher((message) => {
    broadcasts.push(message);
    return { success: true };
  });

  await startServer({ exitOnFailure: false });

  const summary = await runSummaryMode();
  const checkbox = await runChecklistMode();

  const summaryDbRows = dbOverrides.dump("summaries");
  const transcriptRows = dbOverrides.dump("transcripts");
  const checklistProgressRows = dbOverrides.dump("checkbox_progress");

  assert.equal(summaryDbRows.length, GROUPS.length);
  assert.equal(transcriptRows.length, GROUPS.length * 2);
  assert.equal(checklistProgressRows.length, GROUPS.length);

  console.log(JSON.stringify({
    ok: true,
    teacher: "staging-teacher@example.com",
    groups: GROUPS.length,
    summary,
    checkbox,
    realtimeEvents: {
      summary: Object.fromEntries(
        ["student_joined", "record_now", "admin_update", "transcription_and_summary", "summary_state", "stop_recording"]
          .map((event) => [event, eventsFor(summary.sessionCode, event).length])
      ),
      checkbox: Object.fromEntries(
        ["student_joined", "record_now", "checkbox_update", "checklist_state", "stop_recording"]
          .map((event) => [event, eventsFor(checkbox.sessionCode, event).length])
      )
    },
    persistedRows: {
      summaries: summaryDbRows.length,
      transcripts: transcriptRows.length,
      checkboxProgress: checklistProgressRows.length
    }
  }, null, 2));
} finally {
  if (http.listening) {
    await new Promise((resolve, reject) => {
      http.close((error) => error ? reject(error) : resolve());
    });
  }
  activeSessions.clear();
  dbModule.__setDbTestOverrides(null);
  realtimeModule.__setRealtimeTestPublisher(null);
}
