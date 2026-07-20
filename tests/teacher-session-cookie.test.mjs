import test from "node:test";
import assert from "node:assert/strict";

import { applyBaseTestEnv } from "./_helpers.mjs";

test("teacher session cookies are signed, expire, and reject tampering", async () => {
  applyBaseTestEnv(10000);
  process.env.AUTH_COOKIE_SECRET = "test-auth-cookie-secret-at-least-thirty-two-characters";
  const {
    createTeacherSessionToken,
    verifyTeacherSessionToken
  } = await import(`../server/services/teacherSessionCookie.js?test=${Date.now()}`);

  const now = Date.now();
  const token = createTeacherSessionToken(
    { id: "teacher-1", email: "Teacher@Example.com" },
    { now, ttlSeconds: 3600 }
  );
  const claims = verifyTeacherSessionToken(token, { now: now + 1000 });
  assert.equal(claims.sub, "teacher-1");
  assert.equal(claims.email, "teacher@example.com");
  assert.equal(verifyTeacherSessionToken(`${token}tampered`, { now }), null);
  const [version, iv, ciphertext, tag] = token.split(".");
  assert.equal(verifyTeacherSessionToken(`${version}.${iv}.${ciphertext}.${tag.slice(0, -2)}`, { now }), null);
  assert.equal(verifyTeacherSessionToken(token, { now: now + 3_601_000 }), null);
});

test("teacher cookie encrypts the Supabase refresh session rather than exposing it", async () => {
  applyBaseTestEnv(10000);
  process.env.AUTH_COOKIE_SECRET = "test-auth-cookie-secret-at-least-thirty-two-characters";
  const { createTeacherSessionToken, verifyTeacherSessionToken } = await import(`../server/services/teacherSessionCookie.js?encrypted=${Date.now()}`);
  const refreshToken = "super-sensitive-refresh-token";
  const token = createTeacherSessionToken(
    { id: "teacher-1", email: "teacher@example.com" },
    { session: { access_token: "header.payload.signature", refresh_token: refreshToken } }
  );
  assert.equal(token.includes(refreshToken), false);
  assert.equal(verifyTeacherSessionToken(token).refresh_token, refreshToken);
});

test("teacher session cookie is HttpOnly, SameSite, and Secure in production", async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  process.env.AUTH_COOKIE_SECRET = "test-auth-cookie-secret-at-least-thirty-two-characters";
  const { setTeacherSessionCookie } = await import(`../server/services/teacherSessionCookie.js?secure=${Date.now()}`);
  const headers = new Map();
  const res = { setHeader(name, value) { headers.set(name, value); } };
  setTeacherSessionCookie(res, { id: "teacher-1", email: "teacher@example.com" });
  const cookie = headers.get("Set-Cookie");
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
  assert.match(cookie, /Secure/);

  if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = previousNodeEnv;
});

test("production rejects reuse of the classroom join secret for cookie encryption", async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousCookieSecret = process.env.AUTH_COOKIE_SECRET;
  const previousJoinSecret = process.env.SESSION_JOIN_SECRET;
  const reused = "one-secret-must-not-protect-two-security-boundaries";
  process.env.NODE_ENV = "production";
  process.env.AUTH_COOKIE_SECRET = reused;
  process.env.SESSION_JOIN_SECRET = reused;
  try {
    const module = await import(`../server/services/teacherSessionCookie.js?separation=${Date.now()}`);
    assert.throws(() => module.assertTeacherSessionCookieConfigured(), /independent values/i);
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    if (previousCookieSecret === undefined) delete process.env.AUTH_COOKIE_SECRET;
    else process.env.AUTH_COOKIE_SECRET = previousCookieSecret;
    if (previousJoinSecret === undefined) delete process.env.SESSION_JOIN_SECRET;
    else process.env.SESSION_JOIN_SECRET = previousJoinSecret;
  }
});
