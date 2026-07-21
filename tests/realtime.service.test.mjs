import test from "node:test";
import assert from "node:assert/strict";

import { createDbOverrides } from "./api.integration.helpers.mjs";
import { applyBaseTestEnv, createAuthOverrides, jsonRequest, loadServer, stopServer } from "./_helpers.mjs";

test("realtime topic helpers and publisher build session and group broadcasts", async () => {
  applyBaseTestEnv(0);

  const realtime = await import(`../server/services/realtime.js?test=topic-${Date.now()}`);
  const published = [];
  realtime.__setRealtimeTestPublisher((message) => {
    published.push(message);
    return { success: true };
  });

  try {
    const sessionTopic = realtime.buildSessionRealtimeTopic(" room42 ");
    assert.match(sessionTopic, /^classroom:[A-Za-z0-9_-]{32}:teacher$/);
    assert.equal(sessionTopic.includes("ROOM42"), false);
    const capabilityRoot = sessionTopic.replace(/:teacher$/, "");
    assert.equal(realtime.buildGroupRealtimeTopic("room42", 3), `${capabilityRoot}:group:3`);

    await realtime.publishRealtimeEvent({
      sessionCode: "room42",
      groupNumber: 3,
      event: realtime.REALTIME_EVENTS.CHECKLIST_STATE,
      audience: "both",
      payload: { isReleased: true }
    });

    assert.deepEqual(
      published.map((message) => message.topic),
      [sessionTopic, `${capabilityRoot}:group:3`]
    );
    assert.equal(published[0].event, "checklist_state");
    assert.equal(published[0].payload.sessionCode, "ROOM42");
    assert.equal(published[0].payload.groupNumber, 3);
    assert.deepEqual(published[0].payload.payload, { isReleased: true });
  } finally {
    realtime.__setRealtimeTestPublisher(null);
  }
});

test("student join endpoint grants exact topics to a native Supabase identity", async () => {
  applyBaseTestEnv(11041);

  const dbModule = await import("../server/db/db.js");
  const authModule = await import("../server/middleware/auth.js");
  const realtime = await import("../server/services/realtime.js");
  const dbOverrides = createDbOverrides({
    sessions: [
      {
        _id: "session-1",
        code: "ROOM42",
        owner_id: "teacher-1",
        mode: "summary",
        active: false,
        interval_ms: 30000,
        created_at: Date.now()
      }
    ],
    groups: [],
    summaries: [],
    session_logs: []
  });
  const published = [];

  dbModule.__setDbTestOverrides(dbOverrides);
  authModule.__setAuthTestOverrides(createAuthOverrides());
  realtime.__setRealtimeTestPublisher((message) => {
    published.push(message);
    return { success: true };
  });

  const { http, startServer } = await loadServer(`student-realtime-join-${Date.now()}`);

  try {
    const address = await startServer({ exitOnFailure: false });
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const { response, body } = await jsonRequest(baseUrl, "/api/session/ROOM42/student-join", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer student-token" },
      body: JSON.stringify({ group: 2 })
    });

    assert.equal(response.status, 200);
    assert.equal(body.code, "ROOM42");
    assert.equal(body.group, 2);
    assert.match(body.realtime.studentTopic, /^classroom:[A-Za-z0-9_-]{32}:students$/);
    assert.equal(body.realtime.studentTopic.includes("ROOM42"), false);
    assert.equal(body.realtime.groupTopic, `${body.realtime.studentTopic.replace(/:students$/, "")}:group:2`);
    assert.equal(Object.hasOwn(body.realtime, "accessToken"), false);
    assert.equal(body.summaryState.isReleased, false);
    assert.deepEqual(dbOverrides.dump("groups").map((group) => group.number), [2]);
    assert.equal(published[0].event, "student_joined");
    assert.equal(published[0].payload.payload.group, 2);
  } finally {
    await stopServer(http);
    dbModule.__setDbTestOverrides(null);
    authModule.__setAuthTestOverrides(null);
    realtime.__setRealtimeTestPublisher(null);
  }
});

test("checkbox join state is rebuilt from Postgres instead of process memory", async () => {
  applyBaseTestEnv(11046);

  const dbModule = await import("../server/db/db.js");
  const authModule = await import("../server/middleware/auth.js");
  const realtime = await import("../server/services/realtime.js");
  const dbOverrides = createDbOverrides({
    sessions: [{
      _id: "checkbox-session-1",
      code: "CHECK1",
      owner_id: "teacher-1",
      mode: "checkbox",
      active: true,
      interval_ms: 30000,
      created_at: Date.now(),
      expires_at: Date.now() + 60_000
    }],
    groups: [],
    checkbox_sessions: [{
      session_id: "checkbox-session-1",
      scenario: "Evaluate the discussion",
      released_groups: { 2: true }
    }],
    checkbox_criteria: [{
      _id: "criterion-1",
      session_id: "checkbox-session-1",
      description: "Uses evidence",
      rubric: "Quotes the source",
      order_index: 0,
      created_at: Date.now()
    }],
    checkbox_progress: [{
      session_id: "checkbox-session-1",
      group_number: 2,
      progress: {
        "criterion-1": { status: "green", completed: true, quote: "Evidence quoted" }
      }
    }]
  });

  dbModule.__setDbTestOverrides(dbOverrides);
  authModule.__setAuthTestOverrides(createAuthOverrides());
  realtime.__setRealtimeTestPublisher(() => ({ success: true }));
  const { http, startServer } = await loadServer(`checkbox-realtime-join-${Date.now()}`);

  try {
    const address = await startServer({ exitOnFailure: false });
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const { response, body } = await jsonRequest(baseUrl, "/api/session/CHECK1/student-join", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer student-token" },
      body: JSON.stringify({ group: 2 })
    });

    assert.equal(response.status, 200);
    assert.equal(body.checklistState.isReleased, true);
    assert.equal(body.checklistState.scenario, "Evaluate the discussion");
    assert.equal(body.checklistState.criteria[0].status, "green");
    assert.equal(body.checklistState.criteria[0].quote, "Evidence quoted");
  } finally {
    await stopServer(http);
    dbModule.__setDbTestOverrides(null);
    authModule.__setAuthTestOverrides(null);
    realtime.__setRealtimeTestPublisher(null);
  }
});

test("expired unstarted classrooms are deleted before a fresh pending session is reserved", async () => {
  applyBaseTestEnv(11047);
  process.env.PENDING_SESSION_TTL_MINUTES = "5";

  const dbModule = await import("../server/db/db.js");
  const authModule = await import("../server/middleware/auth.js");
  const memberships = await import("../server/services/realtimeMemberships.js");
  const deletedMemberships = [];
  const dbOverrides = createDbOverrides({
    sessions: [{
      _id: "abandoned-session-1",
      code: "OLD123",
      owner_id: "teacher-1",
      mode: "summary",
      active: false,
      is_current: true,
      start_time: null,
      created_at: Date.now() - 10 * 60_000,
      expires_at: Date.now() - 1
    }]
  });

  dbModule.__setDbTestOverrides(dbOverrides);
  authModule.__setAuthTestOverrides(createAuthOverrides());
  memberships.__setRealtimeMembershipTestOverride({
    delete(code) { deletedMemberships.push(code); }
  });
  const { http, startServer } = await loadServer(`pending-session-${Date.now()}`);

  try {
    const address = await startServer({ exitOnFailure: false });
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const before = Date.now();
    const { response, body } = await jsonRequest(baseUrl, "/api/new-session?mode=summary", {
      method: "POST",
      headers: { Authorization: "Bearer teacher-token", "Content-Type": "application/json" }
    });

    assert.equal(response.status, 200);
    assert.equal(body.pending, true);
    assert.notEqual(body.code, "OLD123");
    assert.equal(deletedMemberships.includes("OLD123"), true);
    assert.equal(dbOverrides.dump("sessions").some((session) => session.code === "OLD123"), false);
    const pendingLifetime = new Date(body.expiresAt).getTime() - before;
    assert.equal(pendingLifetime >= 4.9 * 60_000 && pendingLifetime <= 5.1 * 60_000, true);

    const { response: stopResponse, body: stopBody } = await jsonRequest(baseUrl, `/api/session/${body.code}/stop`, {
      method: "POST",
      headers: { Authorization: "Bearer teacher-token", "Content-Type": "application/json" }
    });
    assert.equal(stopResponse.status, 200);
    assert.equal(stopBody.discarded, true);
    assert.equal(dbOverrides.dump("sessions").some((session) => session.code === body.code), false);
    assert.equal(deletedMemberships.includes(body.code), true);
  } finally {
    await stopServer(http);
    dbModule.__setDbTestOverrides(null);
    authModule.__setAuthTestOverrides(null);
    memberships.__setRealtimeMembershipTestOverride(null);
    delete process.env.PENDING_SESSION_TTL_MINUTES;
  }
});
