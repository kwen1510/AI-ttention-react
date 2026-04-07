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
  } finally {
    __setAuthTestOverrides(null);
  }
});
