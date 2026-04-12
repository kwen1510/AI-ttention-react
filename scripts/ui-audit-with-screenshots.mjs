import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright-core";

process.env.HOST = process.env.HOST || "127.0.0.1";
process.env.PORT = process.env.PORT || "0";
process.env.STAGING_AUTH_BYPASS = "true";
process.env.ALLOW_DEV_TEST = "true";
process.env.ALLOW_LEGACY_TEACHER_ALLOWLIST = "false";

const { http, startServer } = await import("../index.js");
const SCREENSHOT_DIR = path.join(os.tmpdir(), "aittention-ui-audit");
const TEST_INTERVAL_SECONDS = 5;

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function getBaseUrl() {
  const address = http.address();
  if (!address || typeof address === "string" || !address.port) {
    throw new Error("UI audit server did not expose a TCP port");
  }

  return `http://${process.env.HOST}:${address.port}`;
}

function getChromeExecutablePath() {
  const candidates = [
    process.env.CHROME_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/opt/homebrew/bin/chromium",
  ].filter(Boolean);

  const executablePath = candidates.find((candidate) => fs.existsSync(candidate));
  if (!executablePath) {
    throw new Error("No Chrome or Chromium executable found for Playwright");
  }

  return executablePath;
}

function createFakeMicInput() {
  ensureDir(SCREENSHOT_DIR);
  const aiffPath = path.join(os.tmpdir(), "aittention-ui-audit-mic.aiff");
  const wavPath = path.join(os.tmpdir(), "aittention-ui-audit-mic.wav");

  if (!fs.existsSync(wavPath)) {
    const spokenText = [
      "This is a UI audit for AI attention.",
      "The student should receive a transcript in English.",
      "The teacher should receive another summary update.",
      "We are checking layouts, buttons, and session flow.",
    ].join(" ");

    execFileSync("/usr/bin/say", ["-r", "140", "-o", aiffPath, spokenText], { stdio: "ignore" });
    execFileSync("/usr/bin/afconvert", ["-f", "WAVE", "-d", "LEI16", aiffPath, wavPath], { stdio: "ignore" });
  }

  return wavPath;
}

function attachDiagnostics(page, label, diagnostics, baseUrl) {
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    diagnostics.push(`[${label}] console error: ${message.text()}`);
  });

  page.on("pageerror", (error) => {
    diagnostics.push(`[${label}] page error: ${error.message}`);
  });

  page.on("response", (response) => {
    const url = response.url();
    if (!url.startsWith(baseUrl)) return;
    if (response.status() < 400) return;
    if (new URL(url).pathname === "/favicon.ico") return;
    diagnostics.push(`[${label}] HTTP ${response.status()} ${url}`);
  });
}

async function expectOkResponse(responsePromise, label) {
  const response = await responsePromise;
  if (response.ok()) return response;
  throw new Error(`${label} failed (${response.status()}): ${await response.text()}`);
}

async function waitForSessionCode(page) {
  await page.waitForFunction(() => {
    const value = document.querySelector(".session-code-text")?.textContent?.trim();
    return /^[A-Z0-9]{6}$/.test(value || "");
  }, null, { timeout: 20_000 });

  return String(await page.locator(".session-code-text").textContent()).trim();
}

async function assertNoHorizontalOverflow(page, label) {
  const overflow = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));

  if (overflow.scrollWidth > overflow.clientWidth + 1) {
    throw new Error(`${label} has horizontal overflow (${overflow.scrollWidth} > ${overflow.clientWidth})`);
  }
}

async function assertDialogFitsViewport(page, label) {
  const geometry = await page.evaluate(() => {
    const dialog = document.querySelector("[role='dialog']");
    if (!dialog) return null;
    const rect = dialog.getBoundingClientRect();
    return {
      top: rect.top,
      left: rect.left,
      right: rect.right,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    };
  });

  if (!geometry) {
    throw new Error(`${label} dialog not found`);
  }

  if (geometry.left < -1 || geometry.top < -1 || geometry.right > geometry.viewportWidth + 1 || geometry.bottom > geometry.viewportHeight + 1) {
    throw new Error(`${label} dialog exceeds viewport bounds`);
  }
}

async function takeScreenshot(page, filename, options = {}) {
  const targetPath = path.join(SCREENSHOT_DIR, filename);
  await page.screenshot({ path: targetPath, ...options });
  return targetPath;
}

async function closeDialog(page) {
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
}

const diagnostics = [];
let browser;
let context;

try {
  ensureDir(SCREENSHOT_DIR);
  const audioPath = createFakeMicInput();
  await startServer({ exitOnFailure: false });

  const baseUrl = getBaseUrl();
  const chromePath = getChromeExecutablePath();
  console.log(`🌐 UI audit server running at ${baseUrl}`);
  console.log(`📸 Saving screenshots to ${SCREENSHOT_DIR}`);

  browser = await chromium.launch({
    executablePath: chromePath,
    headless: true,
    args: [
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
      `--use-file-for-fake-audio-capture=${audioPath}`,
    ],
  });

  context = await browser.newContext({
    acceptDownloads: true,
    viewport: { width: 1440, height: 1100 },
  });
  await context.grantPermissions(["microphone"], { origin: baseUrl });

  const teacherPage = await context.newPage();
  attachDiagnostics(teacherPage, "teacher-summary", diagnostics, baseUrl);
  await teacherPage.goto(`${baseUrl}/staging/admin`, { waitUntil: "domcontentloaded" });
  await teacherPage.getByRole("heading", { name: "Live summary session" }).waitFor({ timeout: 20_000 });
  await assertNoHorizontalOverflow(teacherPage, "Teacher summary page");

  const sessionCode = await waitForSessionCode(teacherPage);
  const joinUrl = `${baseUrl}/s?c=${sessionCode}`;
  await teacherPage.locator('input[type="number"]').first().fill(String(TEST_INTERVAL_SECONDS));
  await takeScreenshot(teacherPage, "01-teacher-summary-dashboard.png", { fullPage: true });

  const mobileStudentJoinPage = await context.newPage();
  attachDiagnostics(mobileStudentJoinPage, "student-join-mobile", diagnostics, baseUrl);
  await mobileStudentJoinPage.setViewportSize({ width: 390, height: 844 });
  await mobileStudentJoinPage.goto(`${baseUrl}/student?c=${sessionCode}&g=3`, {
    waitUntil: "domcontentloaded",
  });
  await mobileStudentJoinPage.locator("#sessionCode").waitFor({ timeout: 20_000 });
  assert.equal(await mobileStudentJoinPage.locator("#sessionCode").inputValue(), sessionCode);
  assert.equal(await mobileStudentJoinPage.locator("#groupNumber").inputValue(), "3");
  await mobileStudentJoinPage.waitForTimeout(500);
  assert.equal(await mobileStudentJoinPage.locator(".session-code-text").count(), 0);
  await assertNoHorizontalOverflow(mobileStudentJoinPage, "Mobile student join page");
  await takeScreenshot(mobileStudentJoinPage, "00-mobile-student-join.png", { fullPage: true });

  await teacherPage.locator("button:has(.session-code-text)").click();
  await teacherPage.getByRole("heading", { name: /Student access/i }).waitFor({ timeout: 20_000 });
  await teacherPage.getByText(/Scan this QR code or enter the session code/i).waitFor({ timeout: 20_000 });
  await assertDialogFitsViewport(teacherPage, "QR modal");
  await takeScreenshot(teacherPage, "02-qr-modal.png");
  await closeDialog(teacherPage);

  const studentPage = await context.newPage();
  attachDiagnostics(studentPage, "student-summary", diagnostics, baseUrl);
  await studentPage.goto(joinUrl, { waitUntil: "domcontentloaded" });
  await studentPage.locator("#groupNumber").fill("1");
  await studentPage.getByRole("button", { name: /Join with code/i }).click();
  await studentPage.getByText(`Session ${sessionCode}`, { exact: false }).waitFor({ timeout: 20_000 });
  await teacherPage.getByRole("heading", { name: "Group 1" }).waitFor({ timeout: 20_000 });

  const startResponse = teacherPage.waitForResponse((response) =>
    response.request().method() === "POST" &&
    response.url().endsWith(`/api/session/${sessionCode}/start`)
  );
  await teacherPage.getByRole("button", { name: /Start recording/i }).click();
  await expectOkResponse(startResponse, "summary start");
  await studentPage.getByText(/Recording/, { exact: false }).waitFor({ timeout: 20_000 });
  await teacherPage.getByText(/1 transcript segments?|2 transcript segments?/, { exact: false }).waitFor({ timeout: 45_000 });
  await studentPage.waitForFunction(() => !document.body.innerText.includes("No summary yet"), null, {
    timeout: 45_000,
  });
  await assertNoHorizontalOverflow(studentPage, "Student summary page");

  await takeScreenshot(teacherPage, "03-teacher-summary-live.png", { fullPage: true });
  await takeScreenshot(studentPage, "04-student-summary-live.png", { fullPage: true });

  const promptsPage = await context.newPage();
  attachDiagnostics(promptsPage, "teacher-prompts", diagnostics, baseUrl);
  await promptsPage.goto(`${baseUrl}/staging/prompts`, { waitUntil: "domcontentloaded" });
  await promptsPage.getByRole("heading", { name: /Prompt library/i }).waitFor({ timeout: 20_000 });
  await assertNoHorizontalOverflow(promptsPage, "Prompts page");
  await takeScreenshot(promptsPage, "05-prompts-page.png", { fullPage: true });

  const mobileTeacherPage = await context.newPage();
  attachDiagnostics(mobileTeacherPage, "teacher-prompts-mobile", diagnostics, baseUrl);
  await mobileTeacherPage.setViewportSize({ width: 390, height: 844 });
  await mobileTeacherPage.goto(`${baseUrl}/staging/prompts`, { waitUntil: "domcontentloaded" });
  await mobileTeacherPage.getByRole("heading", { name: /Prompt library/i }).waitFor({ timeout: 20_000 });
  await assertNoHorizontalOverflow(mobileTeacherPage, "Mobile prompts page");
  await takeScreenshot(mobileTeacherPage, "05a-prompts-page-mobile.png", { fullPage: true });

  const checkboxTeacherPage = await context.newPage();
  attachDiagnostics(checkboxTeacherPage, "teacher-checkbox", diagnostics, baseUrl);
  await checkboxTeacherPage.goto(`${baseUrl}/staging/checkbox`, { waitUntil: "domcontentloaded" });
  await checkboxTeacherPage.getByRole("heading", { name: "Live checklist session" }).waitFor({ timeout: 20_000 });

  const checkboxSessionCode = await waitForSessionCode(checkboxTeacherPage);
  const saveCriteriaResponse = checkboxTeacherPage.waitForResponse((response) =>
    response.request().method() === "POST" &&
    response.url().endsWith("/api/checkbox/session")
  );
  await checkboxTeacherPage.locator("textarea").first().fill("Discuss one cause and one solution for air pollution.");
  await checkboxTeacherPage.locator("textarea").nth(1).fill(
    [
      "Mentions one likely cause (Names a relevant pollution source)",
      "Suggests one realistic action (Names a practical response)"
    ].join("\n")
  );
  await checkboxTeacherPage.getByRole("button", { name: /Save & Apply/i }).click();
  await expectOkResponse(saveCriteriaResponse, "checkbox criteria save");
  await checkboxTeacherPage.getByText(/Criteria saved successfully/i).waitFor({ timeout: 20_000 });
  await assertNoHorizontalOverflow(checkboxTeacherPage, "Checkbox teacher page");
  await takeScreenshot(checkboxTeacherPage, "06-checkbox-teacher.png", { fullPage: true });

  const checkboxStudentPage = await context.newPage();
  attachDiagnostics(checkboxStudentPage, "student-checkbox", diagnostics, baseUrl);
  await checkboxStudentPage.goto(`${baseUrl}/s?c=${checkboxSessionCode}&g=2`, { waitUntil: "domcontentloaded" });
  await checkboxStudentPage.getByRole("button", { name: /Join with code/i }).click();
  await checkboxStudentPage.getByText(`Session ${checkboxSessionCode}`, { exact: false }).waitFor({ timeout: 20_000 });
  await checkboxTeacherPage.getByRole("heading", { name: "Group 2" }).waitFor({ timeout: 20_000 });

  const startCheckboxResponse = checkboxTeacherPage.waitForResponse((response) =>
    response.request().method() === "POST" &&
    response.url().endsWith(`/api/session/${checkboxSessionCode}/start`)
  );
  await checkboxTeacherPage.getByRole("button", { name: /Start recording/i }).click();
  await expectOkResponse(startCheckboxResponse, "checkbox start");
  await checkboxStudentPage.getByText(/Recording/, { exact: false }).waitFor({ timeout: 20_000 });

  const stopCheckboxResponse = checkboxTeacherPage.waitForResponse((response) =>
    response.request().method() === "POST" &&
    response.url().endsWith(`/api/session/${checkboxSessionCode}/stop`)
  );
  await checkboxTeacherPage.getByRole("button", { name: /Stop recording/i }).click();
  await expectOkResponse(stopCheckboxResponse, "checkbox stop");
  await checkboxTeacherPage.getByRole("button", { name: /Release Checklist/i }).click();
  await checkboxStudentPage.getByText("Group Checklist", { exact: false }).waitFor({ timeout: 20_000 });
  await assertNoHorizontalOverflow(checkboxStudentPage, "Checkbox student page");
  await takeScreenshot(checkboxStudentPage, "07-student-checklist.png", { fullPage: true });

  const historyPage = await context.newPage();
  attachDiagnostics(historyPage, "history", diagnostics, baseUrl);
  await historyPage.goto(`${baseUrl}/staging/history`, { waitUntil: "domcontentloaded" });
  await historyPage.getByRole("heading", { name: /Session history/i }).waitFor({ timeout: 20_000 });
  await historyPage.getByText(`Session ${sessionCode}`, { exact: false }).waitFor({ timeout: 20_000 });
  await historyPage.getByText(`Session ${checkboxSessionCode}`, { exact: false }).waitFor({ timeout: 20_000 });
  await assertNoHorizontalOverflow(historyPage, "History page");
  await takeScreenshot(historyPage, "08-history-page.png", { fullPage: true });

  const summaryCard = historyPage
    .getByRole("heading", { name: `Session ${sessionCode}` })
    .locator("xpath=ancestor::div[contains(@class,'ui-panel')][1]");
  await summaryCard.getByRole("button", { name: /Open history/i }).click();
  await historyPage.getByRole("heading", { name: `Session ${sessionCode}` }).waitFor({ timeout: 20_000 });
  await assertDialogFitsViewport(historyPage, "History modal");
  await takeScreenshot(historyPage, "09-history-modal.png");
  await closeDialog(historyPage);

  const stopSummaryResponse = teacherPage.waitForResponse((response) =>
    response.request().method() === "POST" &&
    response.url().endsWith(`/api/session/${sessionCode}/stop`)
  );
  await teacherPage.getByRole("button", { name: /Stop recording/i }).click();
  await expectOkResponse(stopSummaryResponse, "summary stop");
  await studentPage.getByText(/Wrapping up recording|Recording complete/i, { exact: false }).waitFor({ timeout: 30_000 });

  await studentPage.getByRole("button", { name: /Leave session/i }).click();
  await studentPage.locator("#sessionCode").waitFor({ timeout: 20_000 });
  await assertNoHorizontalOverflow(studentPage, "Student join page after leave");
  await takeScreenshot(studentPage, "10-student-after-leave.png", { fullPage: true });

  await teacherPage.goto(`${baseUrl}/staging/admin`, { waitUntil: "domcontentloaded" });
  await teacherPage.getByRole("heading", { name: "Live summary session" }).waitFor({ timeout: 20_000 });
  await teacherPage.getByRole("button", { name: /Sign out/i }).click();
  await teacherPage.getByText(/Teacher tools require an approved teacher account/i, { exact: false }).waitFor({ timeout: 20_000 });
  await assertNoHorizontalOverflow(teacherPage, "Teacher sign-out redirect page");
  await takeScreenshot(teacherPage, "11-teacher-signed-out.png", { fullPage: true });

  if (diagnostics.length > 0) {
    throw new Error(`Browser diagnostics detected issues:\n${diagnostics.join("\n")}`);
  }

  console.log(`UI audit passed. Screenshots saved to ${SCREENSHOT_DIR}`);
} finally {
  if (context) {
    await context.close().catch(() => {});
  }

  if (browser) {
    await browser.close().catch(() => {});
  }

  if (http.listening) {
    await new Promise((resolve, reject) => {
      http.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }
}

process.exit(0);
