import assert from "node:assert/strict";
import fs from "node:fs";
import { chromium } from "playwright-core";

process.env.NODE_ENV = "test";
process.env.HOST = "127.0.0.1";
process.env.PORT = "11045";
process.env.SKIP_SUPABASE_BOOTSTRAP = "true";
process.env.SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_SECRET_KEY = "sb_secret_test";
process.env.SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test";
process.env.SESSION_JOIN_SECRET = "browser-security-join-secret-at-least-32-characters";
process.env.AUTH_COOKIE_SECRET = "browser-security-cookie-secret-at-least-32-characters";
process.env.ALLOW_LEGACY_TEACHER_ALLOWLIST = "false";

const { createDbOverrides } = await import("../tests/api.integration.helpers.mjs");
const { createAuthOverrides } = await import("../tests/_helpers.mjs");
const dbModule = await import("../server/db/db.js");
const authModule = await import("../server/middleware/auth.js");
const realtimeModule = await import("../server/services/realtime.js");
const membershipModule = await import("../server/services/realtimeMemberships.js");
const stateModule = await import("../server/services/state.js");
const { createTeacherSessionToken, TEACHER_SESSION_COOKIE_NAME } = await import("../server/services/teacherSessionCookie.js");

const dbOverrides = createDbOverrides({
  sessions: [], groups: [], transcripts: [], summaries: [], summary_snapshots: [],
  session_logs: [], session_prompts: [], teacher_prompts: [], checkbox_sessions: [],
  checkbox_criteria: [], checkbox_progress: []
});
dbModule.__setDbTestOverrides(dbOverrides);
authModule.__setAuthTestOverrides(createAuthOverrides());
realtimeModule.__setRealtimeTestPublisher(() => ({ success: true }));
membershipModule.__setRealtimeMembershipTestOverride({ grant: (rows) => rows, revoke: () => true });

const { http, startServer } = await import("../index.js");

function chromePath() {
  const candidates = [
    process.env.CHROME_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/opt/homebrew/bin/chromium"
  ].filter(Boolean);
  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (!found) throw new Error("Chrome or Chromium is required for browser security verification");
  return found;
}
let browser;
let context;
try {
  await startServer({ exitOnFailure: false });
  const baseUrl = "http://127.0.0.1:11045";
  browser = await chromium.launch({ executablePath: chromePath(), headless: true });
  context = await browser.newContext({ viewport: { width: 1280, height: 900 } });

  const cookieToken = createTeacherSessionToken({ id: "teacher-1", email: "teacher@example.com" });
  await context.addCookies([{
    name: TEACHER_SESSION_COOKIE_NAME,
    value: cookieToken,
    url: baseUrl,
    httpOnly: true,
    sameSite: "Strict",
    expires: Math.floor(Date.now() / 1000) + 3600
  }]);

  const page = await context.newPage();
  await page.goto(`${baseUrl}/admin`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: /Live summary session/i }).waitFor({ timeout: 20_000 });
  await page.waitForFunction(() => /^[A-Z0-9]{6}$/.test(document.querySelector(".session-code-text")?.textContent?.trim() || ""));

  const browserState = await page.evaluate((cookieName) => ({
    cookieVisible: document.cookie.includes(cookieName),
    localKeys: Object.keys(localStorage),
    sessionKeys: Object.keys(sessionStorage)
  }), TEACHER_SESSION_COOKIE_NAME);
  assert.equal(browserState.cookieVisible, false);
  assert.equal(browserState.localKeys.some((key) => /supabase|auth|token/i.test(key)), false);
  assert.equal(browserState.sessionKeys.some((key) => /supabase|auth|token/i.test(key)), false);

  await page.close();
  const restoredPage = await context.newPage();
  await restoredPage.goto(`${baseUrl}/admin`, { waitUntil: "domcontentloaded" });
  await restoredPage.getByRole("heading", { name: /Live summary session/i }).waitFor({ timeout: 20_000 });
  await restoredPage.waitForFunction(() => /^[A-Z0-9]{6}$/.test(document.querySelector(".session-code-text")?.textContent?.trim() || ""));

  const endResponse = restoredPage.waitForResponse((response) =>
    response.request().method() === "POST" && /\/api\/session\/[A-Z0-9]+\/stop$/.test(response.url())
  );
  await restoredPage.getByRole("button", { name: /End session/i }).click();
  assert.equal((await endResponse).status(), 200);
  await restoredPage.getByText("Session ended", { exact: true }).waitFor({ timeout: 10_000 });

  const traversalResponse = await context.request.get(`${baseUrl}/assets/%2e%2e/%2e%2e/.env`);
  assert.equal(traversalResponse.status(), 404);
  assert.equal((await traversalResponse.text()).includes("SUPABASE_SECRET_KEY"), false);

  console.log("Browser security e2e passed: HttpOnly restoration, no Web Storage auth, forced end, traversal denial.");
} finally {
  await context?.close().catch(() => {});
  await browser?.close().catch(() => {});
  if (http?.listening) await new Promise((resolve) => http.close(resolve));
  dbModule.__setDbTestOverrides(null);
  authModule.__setAuthTestOverrides(null);
  realtimeModule.__setRealtimeTestPublisher(null);
  membershipModule.__setRealtimeMembershipTestOverride(null);
  stateModule.activeSessions.clear();
  for (const timer of stateModule.sessionTimers.values()) clearTimeout(timer);
  stateModule.sessionTimers.clear();
}
