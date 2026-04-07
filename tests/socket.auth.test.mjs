import test from "node:test";
import assert from "node:assert/strict";

import { applyBaseTestEnv, createAuthOverrides } from "./_helpers.mjs";

test("socket principal helpers enforce auth, ownership, and role separation", async () => {
  applyBaseTestEnv(10000);

  const { __setAuthTestOverrides } = await import("../server/middleware/auth.js");
  const {
    authenticateSocketPrincipal,
    ensureTeacherOwnsSessionPrincipal,
    requireTeacherPrincipal
  } = await import("../server/services/socket.js");

  __setAuthTestOverrides(createAuthOverrides());

  try {
    const teacherPrincipal = await authenticateSocketPrincipal({
      type: "teacher",
      accessToken: "teacher-token"
    });
    assert.equal(teacherPrincipal.kind, "teacher");
    assert.equal(teacherPrincipal.user.id, "teacher-1");

    const studentPrincipal = await authenticateSocketPrincipal({
      type: "student",
      joinToken: (await import("../server/services/joinTokens.js")).createJoinToken({
        sessionCode: "ROOM42",
        expiresInSeconds: 300
      })
    });
    assert.equal(studentPrincipal.kind, "student");
    assert.equal(studentPrincipal.sessionCode, "ROOM42");

    const anonymousStudent = await authenticateSocketPrincipal({});
    assert.equal(anonymousStudent.kind, "student");
    assert.equal(anonymousStudent.sessionCode, null);

    const ownSession = ensureTeacherOwnsSessionPrincipal(
      teacherPrincipal,
      "ROOM42",
      { ownerId: "teacher-1", active: true },
      null
    );
    assert.equal(ownSession.code, "ROOM42");

    assert.throws(
      () => ensureTeacherOwnsSessionPrincipal(
        teacherPrincipal,
        "ROOM42",
        { ownerId: "teacher-2", active: true },
        { owner_id: "teacher-2", code: "ROOM42" }
      ),
      /forbidden/i
    );

    assert.throws(
      () => requireTeacherPrincipal(studentPrincipal),
      /forbidden/i
    );
  } finally {
    __setAuthTestOverrides(null);
  }
});
