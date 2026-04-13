import test from "node:test";
import assert from "node:assert/strict";

import { createDbOverrides } from "./api.integration.helpers.mjs";
import { applyBaseTestEnv, createAuthOverrides } from "./_helpers.mjs";

test("history services scope sessions by role and expose owner metadata", async () => {
  applyBaseTestEnv(0);

  const authModule = await import("../server/middleware/auth.js");
  const dbModule = await import("../server/db/db.js");
  const historyModule = await import(`../server/services/history.js?test=history-service-${Date.now()}`);

  authModule.__setAuthTestOverrides(createAuthOverrides());
  dbModule.__setDbTestOverrides(createDbOverrides({
    sessions: [
      {
        _id: "session-1",
        code: "ROOM1",
        owner_id: "teacher-1",
        mode: "summary",
        active: false,
        created_at: 1000,
        updated_at: 2000
      },
      {
        _id: "session-2",
        code: "ROOM2",
        owner_id: "teacher-2",
        mode: "summary",
        active: false,
        created_at: 3000,
        updated_at: 4000
      }
    ],
    groups: [],
    summaries: [],
    transcripts: [],
    summary_snapshots: []
  }));

  try {
    const teacher = await authModule.authenticateTeacherFromToken("teacher-token");
    const admin = await authModule.authenticateTeacherFromToken("admin-token");

    const teacherList = await historyModule.listHistorySessions({ teacher });
    assert.equal(teacherList.sessions.length, 1);
    assert.equal(teacherList.sessions[0].code, "ROOM1");

    const adminList = await historyModule.listHistorySessions({ teacher: admin });
    assert.equal(adminList.sessions.length, 2);
    assert.deepEqual(
      adminList.sessions.map((session) => session.owner?.email).sort(),
      ["teacher-b@example.com", "teacher@example.com"]
    );

    const filteredAdminList = await historyModule.listHistorySessions({
      teacher: admin,
      owner: "teacher-b@example.com"
    });
    assert.equal(filteredAdminList.sessions.length, 1);
    assert.equal(filteredAdminList.sessions[0].code, "ROOM2");

    await assert.rejects(
      () => historyModule.listHistorySessions({
        teacher,
        owner: "teacher-b@example.com"
      }),
      /forbidden/i
    );

    await assert.rejects(
      () => historyModule.getHistorySessionOrThrow(teacher, "ROOM2"),
      /forbidden/i
    );

    const adminSession = await historyModule.getHistorySessionOrThrow(admin, "ROOM2");
    const exportPayload = await historyModule.buildCombinedHistoryExport(adminSession);
    assert.equal(exportPayload.session.code, "ROOM2");
    assert.equal(exportPayload.session.owner.email, "teacher-b@example.com");
  } finally {
    authModule.__setAuthTestOverrides(null);
    dbModule.__setDbTestOverrides(null);
  }
});
