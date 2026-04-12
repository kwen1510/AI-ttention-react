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
process.env.MOCK_AI_SERVICES = "true";

const { http, startServer } = await import("../index.js");
const TEST_INTERVAL_SECONDS = 5;

function getBaseUrl() {
  const address = http.address();
  if (!address || typeof address === "string" || !address.port) {
    throw new Error("Browser verification server did not expose a TCP port");
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
  const aiffPath = path.join(os.tmpdir(), "aittention-browser-mic.aiff");
  const wavPath = path.join(os.tmpdir(), "aittention-browser-mic.wav");

  if (!fs.existsSync(wavPath)) {
    const spokenText = Array.from({ length: 10 }, (_, index) => (
      `Chunk ${index + 1}. Testing one two three. The teacher should receive another summary update.`
    )).join(" ");

    execFileSync("/usr/bin/say", ["-r", "135", "-o", aiffPath, spokenText], { stdio: "ignore" });
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
  if (response.ok()) {
    return response;
  }

  const body = await response.text();
  throw new Error(`${label} failed (${response.status()}): ${body}`);
}

async function waitForSessionCode(page) {
  await page.waitForFunction(() => {
    const value = document.querySelector(".session-code-text")?.textContent?.trim();
    return /^[A-Z0-9]{6}$/.test(value || "");
  }, null, { timeout: 20_000 });

  return String(await page.locator(".session-code-text").textContent()).trim();
}

async function openStudentJoinModal(page) {
  await page.locator("button:has(.session-code-text)").click();
  await page.getByRole("heading", { name: /Student access/i }).waitFor({ timeout: 20_000 });
  await page.getByText(/Scan this QR code or enter the session code/i).waitFor({ timeout: 20_000 });
}

async function closeDialog(page) {
  await page.keyboard.press("Escape");
  await page.waitForTimeout(250);
}

const diagnostics = [];
let browser;
let context;

try {
  const audioPath = createFakeMicInput();
  await startServer({ exitOnFailure: false });

  const baseUrl = getBaseUrl();
  const chromePath = getChromeExecutablePath();
  console.log(`🌐 Summary browser verification server running at ${baseUrl}`);
  console.log(`🎙️ Using fake microphone input ${audioPath}`);

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
  attachDiagnostics(teacherPage, "teacher", diagnostics, baseUrl);
  await teacherPage.goto(`${baseUrl}/staging/admin`, { waitUntil: "domcontentloaded" });
  await teacherPage.getByRole("heading", { name: "Live summary session" }).waitFor({ timeout: 20_000 });

  const sessionCode = await waitForSessionCode(teacherPage);
  assert.match(sessionCode, /^[A-Z0-9]{6}$/);
  const joinUrl = `${baseUrl}/s?c=${sessionCode}`;

  await teacherPage.locator('input[type="number"]').first().fill(String(TEST_INTERVAL_SECONDS));

  await openStudentJoinModal(teacherPage);
  await closeDialog(teacherPage);

  const studentPage = await context.newPage();
  attachDiagnostics(studentPage, "student", diagnostics, baseUrl);
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
  await studentPage.locator(".ui-badge").filter({ hasText: /Uploading audio chunk|Last upload/i }).first().waitFor({ timeout: 45_000 });
  await teacherPage.locator(".ui-badge").filter({ hasText: /Uploading|Last upload/i }).first().waitFor({ timeout: 45_000 });
  await teacherPage.getByText(/1 transcript segments?|2 transcript segments?/, { exact: false }).waitFor({ timeout: 45_000 });

  await teacherPage.getByText(/2 transcript segments?/, { exact: false }).waitFor({ timeout: 70_000 });
  await studentPage.waitForFunction(() => !document.body.innerText.includes("No summary yet"), null, {
    timeout: 70_000,
  });

  const stopResponse = teacherPage.waitForResponse((response) =>
    response.request().method() === "POST" &&
    response.url().endsWith(`/api/session/${sessionCode}/stop`)
  );
  await teacherPage.getByRole("button", { name: /Stop recording/i }).click();
  await expectOkResponse(stopResponse, "summary stop");

  await studentPage.locator(".ui-badge").filter({ hasText: /Finalizing session audio|Last upload/i }).first().waitFor({ timeout: 30_000 });
  await studentPage.getByText(/Wrapping up recording|Recording complete/i, { exact: false }).waitFor({ timeout: 30_000 });
  await teacherPage.locator(".ui-badge").filter({ hasText: /Last upload/i }).first().waitFor({ timeout: 30_000 });

  const promptsPage = await context.newPage();
  attachDiagnostics(promptsPage, "prompts", diagnostics, baseUrl);
  await promptsPage.goto(`${baseUrl}/staging/prompts`, { waitUntil: "domcontentloaded" });
  await promptsPage.getByRole("heading", { name: "Prompt library" }).waitFor({ timeout: 20_000 });

  const checkboxPage = await context.newPage();
  attachDiagnostics(checkboxPage, "checkbox", diagnostics, baseUrl);
  await checkboxPage.goto(`${baseUrl}/staging/checkbox`, { waitUntil: "domcontentloaded" });
  await checkboxPage.getByRole("heading", { name: "Live checklist session" }).waitFor({ timeout: 20_000 });

  const historyPage = await context.newPage();
  attachDiagnostics(historyPage, "history", diagnostics, baseUrl);
  await historyPage.goto(`${baseUrl}/staging/history`, { waitUntil: "domcontentloaded" });
  await historyPage.getByRole("heading", { name: "Session history" }).waitFor({ timeout: 20_000 });
  await historyPage.getByText(`Session ${sessionCode}`, { exact: false }).waitFor({ timeout: 20_000 });

  if (diagnostics.length > 0) {
    throw new Error(`Browser verification collected errors:\n${diagnostics.join("\n")}`);
  }

  console.log("Browser summary verification passed.");
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
