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
