import test from "node:test";
import assert from "node:assert/strict";

import { applyBaseTestEnv } from "./_helpers.mjs";
import {
  assertJoinableSessionState,
  buildJoinUrl,
  createJoinToken,
  verifyJoinToken
} from "../server/services/joinTokens.js";

test("join tokens are created and verified for the intended session", () => {
  applyBaseTestEnv(11002);

  const token = createJoinToken({
    sessionCode: "ABCD23",
    expiresInSeconds: 60,
    now: 1_000
  });

  const payload = verifyJoinToken(token, { now: 30_000 });
  assert.equal(payload.sessionCode, "ABCD23");
  assert.equal(payload.type, "student");
  assert.match(buildJoinUrl("https://app.example", token), /\/student\?token=/);
});

test("join tokens reject expired and tampered payloads", () => {
  applyBaseTestEnv(11002);

  const token = createJoinToken({
    sessionCode: "ZXCV98",
    expiresInSeconds: 1,
    now: 0
  });

  assert.throws(() => verifyJoinToken(token, { now: 5_000 }), /expired/i);
  assert.throws(() => verifyJoinToken(`${token}tampered`, { now: 500 }), /invalid join token/i);
});

test("joinable session assertions reject inactive sessions", () => {
  assert.throws(
    () => assertJoinableSessionState("ZXCV98", { active: false }, null),
    /session not active/i
  );

  const active = assertJoinableSessionState("ZXCV98", { active: true }, null);
  assert.equal(active.sessionCode, "ZXCV98");
});

test("join tokens never reuse the Supabase server credential", async () => {
  applyBaseTestEnv(11003);
  process.env.NODE_ENV = "test";
  delete process.env.SESSION_JOIN_SECRET;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-secret";

  const joinTokens = await import(`../server/services/joinTokens.js?test=secret-fallback-${Date.now()}`);
  assert.notEqual(joinTokens.getJoinTokenSecret(), "service-role-secret");
});

test("join tokens require a dedicated secret in production", async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousJoinSecret = process.env.SESSION_JOIN_SECRET;
  const previousServiceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.NODE_ENV = "production";
  delete process.env.SESSION_JOIN_SECRET;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-secret";

  try {
    const joinTokens = await import(`../server/services/joinTokens.js?test=prod-secret-${Date.now()}`);
    assert.throws(() => joinTokens.getJoinTokenSecret(), /SESSION_JOIN_SECRET is not configured/);
  } finally {
    if (previousNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = previousNodeEnv;
    }
    if (previousJoinSecret === undefined) {
      delete process.env.SESSION_JOIN_SECRET;
    } else {
      process.env.SESSION_JOIN_SECRET = previousJoinSecret;
    }
    if (previousServiceRole === undefined) {
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    } else {
      process.env.SUPABASE_SERVICE_ROLE_KEY = previousServiceRole;
    }
  }
});

test("joinable session assertions allow a short post-stop upload grace window", () => {
  const now = Date.now();

  const joinable = assertJoinableSessionState(
    "ZXCV98",
    {
      active: false,
      acceptUploadsUntil: now + 5_000
    },
    {
      active: false
    },
    {
      allowUploadGrace: true,
      now
    }
  );

  assert.equal(joinable.sessionCode, "ZXCV98");

  const databaseBackedGrace = assertJoinableSessionState(
    "ZXCV98",
    null,
    {
      active: false,
      accept_uploads_until: now + 5_000
    },
    {
      allowUploadGrace: true,
      now
    }
  );

  assert.equal(databaseBackedGrace.sessionCode, "ZXCV98");

  assert.throws(
    () => assertJoinableSessionState(
      "ZXCV98",
      {
        active: false,
        acceptUploadsUntil: now - 1
      },
      {
        active: false
      },
      {
        allowUploadGrace: true,
        now
      }
    ),
    /session not active/i
  );
});

test("joinable session assertions reject expired active sessions", () => {
  assert.throws(
    () => assertJoinableSessionState(
      "ROOM42",
      { active: true },
      { active: true, expires_at: Date.now() - 1000 }
    ),
    /session expired/i
  );
});
