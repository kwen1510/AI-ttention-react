import assert from "node:assert/strict";
import fs from "node:fs";
import { chromium } from "playwright-core";

process.env.HOST = process.env.HOST || "127.0.0.1";
process.env.PORT = process.env.PORT || "0";
process.env.STAGING_AUTH_BYPASS = "true";
process.env.ALLOW_DEV_TEST = "true";
process.env.ALLOW_LEGACY_TEACHER_ALLOWLIST = "false";

const { http, startServer } = await import("../index.js");

function getBaseUrl() {
  const address = http.address();
  if (!address || typeof address === "string" || !address.port) {
    throw new Error("Browser e2e server did not expose a TCP port");
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

  page.on("requestfailed", (request) => {
    const url = request.url();
    if (!url.startsWith(baseUrl)) return;
    const errorText = request.failure()?.errorText || "unknown";
    if (errorText.includes("ERR_ABORTED")) return;
    diagnostics.push(`[${label}] request failed: ${errorText} ${url}`);
  });
}

async function waitForSessionCode(page) {
  await page.waitForFunction(() => {
    const value = document.querySelector(".session-code-text")?.textContent?.trim();
    return Boolean(value && value !== "-" && value.length >= 6);
  }, null, { timeout: 20_000 });

  return String(await page.locator(".session-code-text").textContent()).trim();
}

async function closeQrModal(page) {
  const backdrop = page.locator("div.fixed.inset-0.bg-black.bg-opacity-50");
  if (await backdrop.count()) {
    await backdrop.click({ position: { x: 8, y: 8 } });
    await page.waitForTimeout(200);
  }
}

async function deletePromptByTitle(page, title) {
  await page.getByPlaceholder("Search prompts...").fill(title);
  await page.getByText(title, { exact: true }).click();

  const deletePromise = page.waitForResponse((response) =>
    response.request().method() === "DELETE" &&
    /\/api\/prompts\/[^/]+$/.test(response.url())
  );

  await page.evaluate(() => {
    window.confirm = () => true;
  });
  await page.getByRole("button", { name: "Delete" }).click();
  await expectOkResponse(deletePromise, `prompt delete ${title}`);
  await page.waitForTimeout(300);
}

async function expectOkResponse(responsePromise, label) {
  const response = await responsePromise;
  if (response.ok()) {
    return response;
  }

  const body = await response.text();
  throw new Error(`${label} failed (${response.status()}): ${body}`);
}

const diagnostics = [];
let browser;
let context;

try {
  await startServer({ exitOnFailure: false });
  const baseUrl = getBaseUrl();
  const chromePath = getChromeExecutablePath();
  console.log(`🌐 Browser e2e server running at ${baseUrl}`);
  console.log(`🧭 Using browser executable ${chromePath}`);

  browser = await chromium.launch({
    executablePath: chromePath,
    headless: true,
    args: [
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
    ],
  });

  context = await browser.newContext({
    acceptDownloads: true,
    viewport: { width: 1440, height: 1100 },
  });

  await context.grantPermissions(["microphone"], { origin: baseUrl });

  const teacherSummaryPage = await context.newPage();
  attachDiagnostics(teacherSummaryPage, "teacher-summary", diagnostics, baseUrl);
  await teacherSummaryPage.goto(`${baseUrl}/staging/admin`, { waitUntil: "domcontentloaded" });
  await teacherSummaryPage.getByText("AI Summarization Prompts").waitFor({ timeout: 20_000 });

  const summarySessionCode = await waitForSessionCode(teacherSummaryPage);
  assert.match(summarySessionCode, /^[A-Z0-9]{6}$/);

  await teacherSummaryPage.getByRole("button", { name: /AI Summarization Prompts/i }).click();
  const summaryPromptText = `E2E summary prompt ${Date.now()}`;
  const savePromptResponse = teacherSummaryPage.waitForResponse((response) =>
    response.request().method() === "POST" &&
    response.url().endsWith(`/api/session/${summarySessionCode}/prompt`)
  );
  await teacherSummaryPage.locator("textarea").first().fill(summaryPromptText);
  await teacherSummaryPage.getByRole("button", { name: "Apply" }).click();
  await expectOkResponse(savePromptResponse, "summary prompt save");
  await teacherSummaryPage.getByText("Prompt saved successfully").waitFor();

  const joinTokenResponse = teacherSummaryPage.waitForResponse((response) =>
    response.request().method() === "POST" &&
    response.url().endsWith(`/api/session/${summarySessionCode}/join-token`)
  );
  await teacherSummaryPage.locator("button.session-code-display").click();
  const joinTokenPayload = await (await expectOkResponse(joinTokenResponse, "join token creation")).json();
  assert.match(joinTokenPayload.url, /\/student\?token=/);
  await teacherSummaryPage.getByText("Students can open this link").waitFor();
  await closeQrModal(teacherSummaryPage);

  const studentSummaryPage = await context.newPage();
  attachDiagnostics(studentSummaryPage, "student-summary", diagnostics, baseUrl);
  await studentSummaryPage.goto(joinTokenPayload.url, { waitUntil: "domcontentloaded" });
  await studentSummaryPage.getByText("Secure session link loaded").waitFor({ timeout: 20_000 });
  assert.equal(await studentSummaryPage.locator("#sessionCode").count(), 0);
  await studentSummaryPage.locator("#groupNumber").fill("1");
  await studentSummaryPage.getByRole("button", { name: "Join Session" }).click();
  await studentSummaryPage.getByText(`Session ${summarySessionCode}`, { exact: false }).waitFor({ timeout: 20_000 });
  await studentSummaryPage.getByText("Group 1", { exact: false }).waitFor();
  await teacherSummaryPage.getByRole("heading", { name: "Group 1" }).waitFor({ timeout: 20_000 });

  const startSummaryResponse = teacherSummaryPage.waitForResponse((response) =>
    response.request().method() === "POST" &&
    response.url().endsWith(`/api/session/${summarySessionCode}/start`)
  );
  await teacherSummaryPage.getByRole("button", { name: "Start Recording" }).click();
  await expectOkResponse(startSummaryResponse, "summary start");
  await studentSummaryPage.getByText(/Recording/, { exact: false }).waitFor({ timeout: 20_000 });

  const stopSummaryResponse = teacherSummaryPage.waitForResponse((response) =>
    response.request().method() === "POST" &&
    response.url().endsWith(`/api/session/${summarySessionCode}/stop`)
  );
  await teacherSummaryPage.getByRole("button", { name: "Stop Recording" }).click();
  await expectOkResponse(stopSummaryResponse, "summary stop");
  await studentSummaryPage.getByText("Waiting...", { exact: false }).waitFor({ timeout: 20_000 });

  const promptsPage = teacherSummaryPage;
  await promptsPage.goto(`${baseUrl}/staging/prompts`, { waitUntil: "domcontentloaded" });
  await promptsPage.getByRole("heading", { name: "Prompt Library" }).waitFor({ timeout: 20_000 });

  const promptId = Date.now();
  const promptTitle = `E2E Prompt ${promptId}`;
  const promptTitleCopy = `${promptTitle} (Copy)`;
  const promptDescription = `Created by browser e2e ${promptId}`;
  const promptDescriptionUpdated = `Updated by browser e2e ${promptId}`;
  const promptContent = `Summarise the discussion clearly in three bullet points.\nMention action items if present.`;

  const createPromptResponse = promptsPage.waitForResponse((response) =>
    response.request().method() === "POST" &&
    response.url().endsWith("/api/prompts")
  );
  await promptsPage.getByRole("button", { name: "Create Prompt" }).click();
  await promptsPage.locator("#title").fill(promptTitle);
  await promptsPage.locator("#authorName").fill("Browser E2E");
  await promptsPage.locator("#description").fill(promptDescription);
  await promptsPage.locator("#content").fill(promptContent);
  await promptsPage.locator("#tags").fill("e2e, browser");
  await promptsPage.getByRole("button", { name: "Save Prompt" }).click();
  await expectOkResponse(createPromptResponse, "prompt create");
  await promptsPage.getByText(promptTitle, { exact: true }).waitFor({ timeout: 20_000 });

  await promptsPage.getByText(promptTitle, { exact: true }).click();
  await promptsPage.getByRole("dialog").getByText(promptDescription, { exact: false }).waitFor();

  const updatePromptResponse = promptsPage.waitForResponse((response) =>
    response.request().method() === "PUT" &&
    /\/api\/prompts\/[^/]+$/.test(response.url())
  );
  await promptsPage.getByRole("button", { name: "Edit" }).click();
  await promptsPage.locator("#description").fill(promptDescriptionUpdated);
  await promptsPage.getByRole("button", { name: "Update Prompt" }).click();
  await expectOkResponse(updatePromptResponse, "prompt update");
  await promptsPage.getByText(promptTitle, { exact: true }).waitFor();

  await promptsPage.getByText(promptTitle, { exact: true }).click();
  await promptsPage.getByRole("dialog").getByText(promptDescriptionUpdated, { exact: false }).waitFor();

  const clonePromptResponse = promptsPage.waitForResponse((response) =>
    response.request().method() === "POST" &&
    /\/api\/prompts\/[^/]+\/clone$/.test(response.url())
  );
  await promptsPage.evaluate(() => {
    window.prompt = () => "Browser Clone";
  });
  await promptsPage.getByRole("button", { name: "Clone" }).click();
  await expectOkResponse(clonePromptResponse, "prompt clone");
  await promptsPage.getByText(promptTitleCopy, { exact: true }).waitFor({ timeout: 20_000 });

  await promptsPage.getByText(promptTitle, { exact: true }).click();
  await promptsPage.getByRole("dialog").getByText(promptDescriptionUpdated, { exact: false }).waitFor();
  const usePromptResponse = promptsPage.waitForResponse((response) =>
    response.request().method() === "POST" &&
    /\/api\/prompts\/[^/]+\/use$/.test(response.url())
  );
  await promptsPage.getByRole("button", { name: "Use Prompt" }).click();
  await expectOkResponse(usePromptResponse, "prompt use");
  await promptsPage.waitForURL(new RegExp(`${baseUrl}/staging/admin\\?prompt=`), { timeout: 20_000 });
  await promptsPage.getByRole("button", { name: /AI Summarization Prompts/i }).click();
  await promptsPage.locator("textarea").first().waitFor();
  assert.equal(await promptsPage.locator("textarea").first().inputValue(), promptContent);

  await promptsPage.goto(`${baseUrl}/staging/prompts`, { waitUntil: "domcontentloaded" });
  await promptsPage.getByRole("heading", { name: "Prompt Library" }).waitFor();
  await deletePromptByTitle(promptsPage, promptTitle);
  await deletePromptByTitle(promptsPage, promptTitleCopy);

  const teacherCheckboxPage = await context.newPage();
  attachDiagnostics(teacherCheckboxPage, "teacher-checkbox", diagnostics, baseUrl);
  await teacherCheckboxPage.goto(`${baseUrl}/staging/checkbox`, { waitUntil: "domcontentloaded" });
  await teacherCheckboxPage.getByText("Discussion Criteria Setup").waitFor({ timeout: 20_000 });

  const checkboxSessionCode = await waitForSessionCode(teacherCheckboxPage);
  const checkboxScenario = `Discuss the causes of climate change ${Date.now()}`;
  const checkboxCriteria = [
    "States at least one human cause (Mentions fossil fuels or deforestation)",
    "Suggests one mitigation strategy (Names a realistic response)",
  ].join("\n");

  const saveCriteriaResponse = teacherCheckboxPage.waitForResponse((response) =>
    response.request().method() === "POST" &&
    response.url().endsWith("/api/checkbox/session")
  );
  await teacherCheckboxPage.locator("textarea").first().fill(checkboxScenario);
  await teacherCheckboxPage.locator("textarea").nth(1).fill(checkboxCriteria);
  await teacherCheckboxPage.getByRole("button", { name: "Save & Apply" }).click();
  await expectOkResponse(saveCriteriaResponse, "checkbox save");
  await teacherCheckboxPage.getByText("Criteria saved successfully!", { exact: false }).waitFor({ timeout: 20_000 });

  const studentCheckboxPage = await context.newPage();
  attachDiagnostics(studentCheckboxPage, "student-checkbox", diagnostics, baseUrl);
  await studentCheckboxPage.goto(`${baseUrl}/student?code=${checkboxSessionCode}&group=2`, {
    waitUntil: "domcontentloaded",
  });
  await studentCheckboxPage.getByText(`Session ${checkboxSessionCode}`, { exact: false }).waitFor({ timeout: 20_000 });
  await studentCheckboxPage.getByText("Waiting for teacher to release checklist").waitFor({ timeout: 20_000 });
  await teacherCheckboxPage.getByRole("heading", { name: "Group 2" }).waitFor({ timeout: 20_000 });

  const startCheckboxResponse = teacherCheckboxPage.waitForResponse((response) =>
    response.request().method() === "POST" &&
    response.url().endsWith(`/api/session/${checkboxSessionCode}/start`)
  );
  await teacherCheckboxPage.getByRole("button", { name: "Start Recording" }).click();
  await expectOkResponse(startCheckboxResponse, "checkbox start");
  await studentCheckboxPage.getByText(/Recording/, { exact: false }).waitFor({ timeout: 20_000 });

  const stopCheckboxResponse = teacherCheckboxPage.waitForResponse((response) =>
    response.request().method() === "POST" &&
    response.url().endsWith(`/api/session/${checkboxSessionCode}/stop`)
  );
  await teacherCheckboxPage.getByRole("button", { name: "Stop Recording" }).click();
  await expectOkResponse(stopCheckboxResponse, "checkbox stop");
  await studentCheckboxPage.getByText("Waiting...", { exact: false }).waitFor({ timeout: 20_000 });

  await teacherCheckboxPage.getByRole("button", { name: "Release Checklist" }).click();
  await studentCheckboxPage.getByText("Group Checklist").waitFor({ timeout: 20_000 });
  await studentCheckboxPage.getByText("States at least one human cause").waitFor();
  await studentCheckboxPage.getByText("Suggests one mitigation strategy").waitFor();

  const historyPage = await context.newPage();
  attachDiagnostics(historyPage, "history", diagnostics, baseUrl);
  await historyPage.goto(`${baseUrl}/staging/history`, { waitUntil: "domcontentloaded" });
  await historyPage.getByRole("heading", { name: "Session History" }).waitFor({ timeout: 20_000 });
  await historyPage.getByText(`Session ${summarySessionCode}`, { exact: false }).waitFor({ timeout: 20_000 });
  await historyPage.getByText(`Session ${checkboxSessionCode}`, { exact: false }).waitFor({ timeout: 20_000 });

  const summaryCard = historyPage.locator(".glass-panel", { hasText: `Session ${summarySessionCode}` }).first();
  await summaryCard.getByRole("button", { name: "Open history" }).click();
  const historyModal = historyPage.locator(".qr-modal-content");
  await historyModal.getByRole("heading", { name: `Session ${summarySessionCode}` }).waitFor({ timeout: 20_000 });

  const combinedDownloadPromise = historyPage.waitForEvent("download");
  await historyModal.getByRole("button", { name: "Download Combined JSON" }).click();
  await combinedDownloadPromise;

  const segmentsDownloadPromise = historyPage.waitForEvent("download");
  await historyModal.getByRole("button", { name: "Download Segments JSON" }).click();
  await segmentsDownloadPromise;

  await historyModal.locator("button").last().click();
  await historyPage.waitForTimeout(200);

  const dataPage = await context.newPage();
  attachDiagnostics(dataPage, "data", diagnostics, baseUrl);
  await dataPage.goto(`${baseUrl}/staging/data`, { waitUntil: "domcontentloaded" });
  await dataPage.getByRole("heading", { name: "Session History" }).waitFor({ timeout: 20_000 });
  await dataPage.getByText(`Session ${summarySessionCode}`, { exact: false }).waitFor({ timeout: 20_000 });

  if (diagnostics.length > 0) {
    throw new Error(`Browser diagnostics detected issues:\n${diagnostics.join("\n")}`);
  }

  console.log("Browser e2e test passed.");
} catch (error) {
  if (diagnostics.length > 0) {
    error.message = `${error.message}\nBrowser diagnostics:\n${diagnostics.join("\n")}`;
  }
  throw error;
} finally {
  if (context) {
    await context.close();
  }

  if (browser) {
    await browser.close();
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
