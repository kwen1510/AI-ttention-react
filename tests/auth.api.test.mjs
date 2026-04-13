import test from "node:test";
import assert from "node:assert/strict";

import { applyBaseTestEnv, createAuthOverrides } from "./_helpers.mjs";

function createMockResponse() {
  return {
    statusCode: 200,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(value) {
      this.payload = value;
      return this;
    }
  };
}

test("teacher auth middleware enforces 401, 403, and 200 states", async () => {
  applyBaseTestEnv(10000);
  const {
    __setAuthTestOverrides,
    authenticateTeacher,
    requireTeacher
  } = await import("../server/middleware/auth.js");

  __setAuthTestOverrides(createAuthOverrides());

  try {
    await assert.rejects(
      authenticateTeacher({
        headers: {
          authorization: "Bearer invalid-token"
        }
      }),
      /invalid token/i
    );

    const forbiddenReq = {
      headers: {
        authorization: "Bearer student-token"
      }
    };
    const forbiddenRes = createMockResponse();
    const forbiddenTeacher = await requireTeacher(forbiddenReq, forbiddenRes);
    assert.equal(forbiddenTeacher, null);
    assert.equal(forbiddenRes.statusCode, 403);
    assert.deepEqual(forbiddenRes.payload, { error: "Forbidden" });

    const allowedReq = {
      headers: {
        authorization: "Bearer teacher-token"
      }
    };
    const allowedRes = createMockResponse();
    const teacher = await requireTeacher(allowedReq, allowedRes);
    assert.equal(teacher.id, "teacher-1");
    assert.equal(teacher.email, "teacher@example.com");
    assert.equal(teacher.role, "teacher");

    const adminTeacher = await authenticateTeacher({
      headers: {
        authorization: "Bearer admin-token"
      }
    });
    assert.equal(adminTeacher.id, "admin-1");
    assert.equal(adminTeacher.role, "admin");
    assert.equal(adminTeacher.isAdmin, true);
    assert.equal(adminTeacher.teacherAccess?.user_id, "admin-1");
    assert.equal(adminTeacher.teacherAccess?.source, "table-email");
  } finally {
    __setAuthTestOverrides(null);
  }
});

test("teacher auth middleware blocks explicit inactive records even for allowed domains", async () => {
  applyBaseTestEnv(10000);

  const {
    __setAuthTestOverrides,
    authenticateTeacher
  } = await import(`../server/middleware/auth.js?test=inactive-access-${Date.now()}`);

  __setAuthTestOverrides({
    authenticateUserFromToken() {
      return { id: "teacher-9", email: "teacher-9@ri.edu.sg" };
    },
    lookupTeacherAccessRecordByUserId() {
      return null;
    },
    lookupTeacherAccessRecordByEmail() {
      return {
        user_id: null,
        email: "teacher-9@ri.edu.sg",
        role: "teacher",
        active: false
      };
    }
  });

  try {
    await assert.rejects(
      authenticateTeacher({
        headers: {
          authorization: "Bearer inactive-token"
        }
      }),
      /teacher access required/i
    );
  } finally {
    __setAuthTestOverrides(null);
  }
});

test("teacher auth middleware accepts staging bypass requests when enabled", async () => {
  applyBaseTestEnv(10000);
  process.env.STAGING_AUTH_BYPASS = "true";

  const { authenticateTeacher } = await import(`../server/middleware/auth.js?test=staging-auth-${Date.now()}`);

  try {
    const teacher = await authenticateTeacher({
      headers: {
        "x-staging-auth-bypass": "teacher"
      }
    });

    assert.equal(teacher.role, "teacher");
    assert.equal(teacher.teacherAccess?.source, "staging-bypass");
  } finally {
    delete process.env.STAGING_AUTH_BYPASS;
  }
});
