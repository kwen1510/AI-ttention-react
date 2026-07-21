import test from "node:test";
import assert from "node:assert/strict";

import { createDbOverrides } from "./api.integration.helpers.mjs";
import { applyBaseTestEnv, createAuthOverrides, jsonRequest, loadServer, stopServer } from "./_helpers.mjs";

test("student APIs reject forged roles, missing identity, and cross-group claims", async () => {
  applyBaseTestEnv(11043);
  process.env.ALLOW_DEV_TEST = "true";
  process.env.MOCK_AI_SERVICES = "true";

  const dbModule = await import("../server/db/db.js");
  const authModule = await import("../server/middleware/auth.js");
  const membershipModule = await import("../server/services/realtimeMemberships.js");
  const realtimeModule = await import("../server/services/realtime.js");
  const stateModule = await import("../server/services/state.js");
  const dbOverrides = createDbOverrides({
    sessions: [{
      _id: "session-security",
      code: "SECURE",
      owner_id: "teacher-1",
      mode: "summary",
      active: true,
      interval_ms: 30000,
      created_at: Date.now(),
      start_time: Date.now(),
      expires_at: Date.now() + 60_000,
      ended_reason: null
    }],
    groups: [],
    transcripts: [],
    summaries: [],
    session_logs: []
  });
  let revokedSession = null;

  dbModule.__setDbTestOverrides(dbOverrides);
  authModule.__setAuthTestOverrides(createAuthOverrides());
  realtimeModule.__setRealtimeTestPublisher(() => ({ success: true }));
  membershipModule.__setRealtimeMembershipTestOverride({
    assertGrant({ groupNumber }) {
      if (groupNumber !== 2) {
        const error = new Error("Student group access denied");
        error.status = 403;
        throw error;
      }
      return true;
    },
    assertMembership({ userId, sessionCode, groupNumber }) {
      if (userId !== "student-1" || sessionCode !== "SECURE" || groupNumber !== 2) {
        const error = new Error("Student group access denied");
        error.status = 403;
        throw error;
      }
      return true;
    },
    revoke(code) {
      revokedSession = code;
    }
  });

  const { http, startServer } = await loadServer(`security-adversarial-${Date.now()}`);

  try {
    const address = await startServer({ exitOnFailure: false });
    const baseUrl = `http://127.0.0.1:${address.port}`;

    const forgedTeacherJoin = await jsonRequest(baseUrl, "/api/session/SECURE/student-join", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer teacher-token" },
      body: JSON.stringify({ group: 2 })
    });
    assert.equal(forgedTeacherJoin.response.status, 403);

    const forgedTokenJoin = await jsonRequest(baseUrl, "/api/session/SECURE/student-join", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer forged-token" },
      body: JSON.stringify({ group: 2 })
    });
    assert.equal(forgedTokenJoin.response.status, 401);

    const missingIdentityEvent = await jsonRequest(baseUrl, "/api/session/SECURE/student-event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event: "heartbeat", group: 2 })
    });
    assert.equal(missingIdentityEvent.response.status, 401);

    const crossGroupEvent = await jsonRequest(baseUrl, "/api/session/SECURE/student-event", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer student-token" },
      body: JSON.stringify({ event: "heartbeat", group: 3 })
    });
    assert.equal(crossGroupEvent.response.status, 403);

    const ownGroupEvent = await jsonRequest(baseUrl, "/api/session/SECURE/student-event", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer student-token" },
      body: JSON.stringify({ event: "heartbeat", group: 2 })
    });
    assert.equal(ownGroupEvent.response.status, 200);

    const crossGroupUpload = new FormData();
    crossGroupUpload.append("file", new Blob(["synthetic-audio"], { type: "audio/webm" }), "chunk.webm");
    crossGroupUpload.append("sessionCode", "SECURE");
    crossGroupUpload.append("groupNumber", "3");
    crossGroupUpload.append("chunkId", "security-cross-group-0001");
    const uploadResponse = await fetch(`${baseUrl}/api/transcribe-chunk`, {
      method: "POST",
      headers: {
        Authorization: "Bearer student-token",
        "x-session-code": "SECURE",
        "x-group-number": "3"
      },
      body: crossGroupUpload
    });
    assert.equal(uploadResponse.status, 403);

    const stop = await jsonRequest(baseUrl, "/api/session/SECURE/stop", {
      method: "POST",
      headers: { Authorization: "Bearer teacher-token" }
    });
    assert.equal(stop.response.status, 200);
    assert.equal(revokedSession, null, "membership stays upload-valid only during the final 15-second grace");
    const stoppedSession = dbOverrides.dump("sessions")[0];
    assert.equal(stoppedSession.is_current, false);
    assert.ok(stoppedSession.accept_uploads_until > Date.now());

    const afterForcedEnd = await jsonRequest(baseUrl, "/api/session/SECURE/student-event", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer student-token" },
      body: JSON.stringify({ event: "heartbeat", group: 2 })
    });
    assert.equal(afterForcedEnd.response.status, 404);

    const restartEndedSession = await jsonRequest(baseUrl, "/api/session/SECURE/start", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer teacher-token" },
      body: JSON.stringify({ mode: "summary", interval: 15000 })
    });
    assert.equal(restartEndedSession.response.status, 409);
  } finally {
    await stopServer(http);
    dbModule.__setDbTestOverrides(null);
    authModule.__setAuthTestOverrides(null);
    membershipModule.__setRealtimeMembershipTestOverride(null);
    realtimeModule.__setRealtimeTestPublisher(null);
    stateModule.activeSessions.clear();
    for (const timer of stateModule.sessionTimers.values()) clearTimeout(timer);
    stateModule.sessionTimers.clear();
    delete process.env.ALLOW_DEV_TEST;
    delete process.env.MOCK_AI_SERVICES;
  }
});

test("teacher identity owns created sessions and traversal paths cannot expose files", async () => {
  applyBaseTestEnv(11044);

  const dbModule = await import("../server/db/db.js");
  const authModule = await import("../server/middleware/auth.js");
  const membershipModule = await import("../server/services/realtimeMemberships.js");
  const stateModule = await import("../server/services/state.js");
  const dbOverrides = createDbOverrides({ sessions: [] });

  dbModule.__setDbTestOverrides(dbOverrides);
  authModule.__setAuthTestOverrides(createAuthOverrides());
  membershipModule.__setRealtimeMembershipTestOverride({ grant: (rows) => rows });

  const { http, startServer } = await loadServer(`security-ownership-${Date.now()}`);
  try {
    const address = await startServer({ exitOnFailure: false });
    const baseUrl = `http://127.0.0.1:${address.port}`;

    const malformedMarker = "DO_NOT_REFLECT_THIS_MARKER";
    const malformed = await fetch(`${baseUrl}/api/auth/otp/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: `{"email":"${malformedMarker}"`
    });
    const malformedBody = await malformed.json();
    assert.equal(malformed.status, 400);
    assert.equal(malformedBody.error, "Malformed request body");
    assert.equal(JSON.stringify(malformedBody).includes(malformedMarker), false);

    const createSummary = () => jsonRequest(baseUrl, "/api/new-session?mode=summary", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer teacher-token" },
      body: JSON.stringify({ owner_id: "teacher-2", active: true, ended_reason: null })
    });
    const [created, concurrent] = await Promise.all([createSummary(), createSummary()]);
    assert.equal(created.response.status, 200);
    assert.equal(concurrent.response.status, 200);
    assert.equal(concurrent.body.code, created.body.code);
    const stored = dbOverrides.dump("sessions")[0];
    assert.equal(stored.owner_id, "teacher-1");
    assert.equal(stored.active, false);
    assert.equal(created.body.interval, 30000);

    const savedInterval = await jsonRequest(baseUrl, `/api/session/${created.body.code}/summary-interval`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: "Bearer teacher-token" },
      body: JSON.stringify({ interval: 15000 })
    });
    assert.equal(savedInterval.response.status, 200);
    assert.equal(savedInterval.body.interval, 15000);

    const tamperedInterval = await jsonRequest(baseUrl, `/api/session/${created.body.code}/summary-interval`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: "Bearer teacher-token" },
      body: JSON.stringify({ interval: 14999 })
    });
    assert.equal(tamperedInterval.response.status, 400);

    const repeated = await jsonRequest(baseUrl, "/api/new-session?mode=summary", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer teacher-token" }
    });
    assert.equal(repeated.response.status, 200);
    assert.equal(repeated.body.code, created.body.code);
    assert.equal(repeated.body.reused, true);
    assert.equal(repeated.body.interval, 15000);
    assert.equal(dbOverrides.dump("sessions").length, 1);

    const checkbox = await jsonRequest(baseUrl, "/api/new-session?mode=checkbox", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer teacher-token" }
    });
    assert.equal(checkbox.response.status, 200);
    assert.notEqual(checkbox.body.code, created.body.code);
    assert.equal(dbOverrides.dump("sessions").length, 2);

    const configureCheckbox = await jsonRequest(baseUrl, "/api/checkbox/session", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer teacher-token" },
      body: JSON.stringify({
        sessionCode: checkbox.body.code,
        criteria: [{ description: "Explain the chosen evidence", rubric: "Names evidence and explains it" }],
        scenario: "Compare the evidence",
        interval: 15000,
        strictness: 2
      })
    });
    assert.equal(configureCheckbox.response.status, 200);

    const crossTeacherConfigure = await jsonRequest(baseUrl, "/api/checkbox/session", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer teacher-b-token" },
      body: JSON.stringify({
        sessionCode: checkbox.body.code,
        criteria: [{ description: "Replace another teacher's rubric" }]
      })
    });
    assert.equal(crossTeacherConfigure.response.status, 403);
    assert.equal(
      dbOverrides.dump("sessions").find((session) => session.code === checkbox.body.code).owner_id,
      "teacher-1"
    );

    const oversizedCriteria = await jsonRequest(baseUrl, "/api/checkbox/session", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer teacher-token" },
      body: JSON.stringify({
        sessionCode: checkbox.body.code,
        criteria: [{ description: "x".repeat(501) }]
      })
    });
    assert.equal(oversizedCriteria.response.status, 400);

    const traversal = await fetch(`${baseUrl}/assets/%2e%2e/%2e%2e/.env`);
    const traversalBody = await traversal.text();
    assert.equal(traversal.status, 404);
    assert.equal(traversalBody.includes("SUPABASE_SECRET_KEY"), false);
  } finally {
    await stopServer(http);
    dbModule.__setDbTestOverrides(null);
    authModule.__setAuthTestOverrides(null);
    membershipModule.__setRealtimeMembershipTestOverride(null);
    stateModule.activeSessions.clear();
    for (const timer of stateModule.sessionTimers.values()) clearTimeout(timer);
    stateModule.sessionTimers.clear();
  }
});
