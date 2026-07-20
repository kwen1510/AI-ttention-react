import test from "node:test";
import assert from "node:assert/strict";

import { createDbOverrides } from "./api.integration.helpers.mjs";
import { applyBaseTestEnv, createAuthOverrides, jsonRequest, loadServer, stopServer } from "./_helpers.mjs";

test("async mode creates an obfuscated student link and processes group recordings", async () => {
  applyBaseTestEnv(11042);
  process.env.MOCK_AI_SERVICES = "true";
  process.env.ALLOW_DEV_TEST = "true";
  process.env.OPENAI_API_KEY = "";
  process.env.OPENAI_KEY = "";
  process.env.ELEVENLABS_KEY = "";
  process.env.ASYNC_MAX_SEGMENTS_PER_GROUP = "1";
  process.env.ASYNC_MAX_TRANSCRIPT_CHARS_PER_GROUP = "5000";

  const authModule = await import("../server/middleware/auth.js");
  const dbModule = await import("../server/db/db.js");
  authModule.__setAuthTestOverrides(createAuthOverrides());
  const dbOverrides = createDbOverrides({
    async_sessions: [],
    async_groups: [],
    async_segments: [],
    async_group_reports: []
  });
  dbModule.__setDbTestOverrides(dbOverrides);

  const { http, startServer } = await loadServer(`async-api-${Date.now()}`);

  try {
    const address = await startServer({ exitOnFailure: false });
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const teacherHeaders = {
      Authorization: "Bearer teacher-token",
      "Content-Type": "application/json"
    };

    const { response: createResponse, body: createBody } = await jsonRequest(baseUrl, "/api/async/sessions", {
      method: "POST",
      headers: teacherHeaders,
      body: JSON.stringify({
        title: "Energy planning discussion",
        instructions: "Discuss the best energy plan. Say which ideas you reject and why.",
        feedbackPrompt: "Summarise the group process and give feedback.",
        maxGroupNumber: 8
      })
    });
    assert.equal(createResponse.status, 201);
    assert.equal(createBody.session.title, "Energy planning discussion");
    assert.match(createBody.session.shareId, /^[A-Za-z0-9_-]{20,}$/);
    assert.match(createBody.session.joinUrl, /\/async\/j\//);
    assert.equal(createBody.session.joinUrl.includes("ROOM"), false);

    const shareId = createBody.session.shareId;
    const { response: invalidJoinResponse } = await jsonRequest(baseUrl, "/api/async/join/ROOM42");
    assert.equal(invalidJoinResponse.status, 404);

    const { response: joinResponse, body: joinBody } = await jsonRequest(baseUrl, `/api/async/join/${shareId}`);
    assert.equal(joinResponse.status, 200);
    assert.equal(joinBody.session.title, "Energy planning discussion");
    assert.equal("id" in joinBody.session, false);
    assert.equal("shareId" in joinBody.session, false);
    assert.equal("owner_id" in joinBody.session, false);

    const { response: forbiddenDetailResponse } = await jsonRequest(baseUrl, `/api/async/sessions/${createBody.session.id}`, {
      headers: {
        Authorization: "Bearer teacher-b-token",
        "Content-Type": "application/json"
      }
    });
    assert.equal(forbiddenDetailResponse.status, 403);

    const { response: groupResponse, body: groupBody } = await jsonRequest(baseUrl, `/api/async/join/${shareId}/groups`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ groupNumber: 2, displayName: "Blue group" })
    });
    assert.equal(groupResponse.status, 200);
    assert.equal(groupBody.group.groupNumber, 2);
    assert.equal(groupBody.group.displayName, "Blue group");

    const formData = new FormData();
    formData.append(
      "file",
      new Blob([
        "MOCK_TRANSCRIPT: Group 2 suggests solar panels for the roof. They reject diesel generators because they are too costly and noisy. They decide to compare batteries next."
      ], { type: "audio/webm" }),
      "async-group-2.webm"
    );
    formData.append("groupNumber", "2");
    formData.append("displayName", "Blue group");

    const uploadResponse = await fetch(`${baseUrl}/api/async/join/${shareId}/upload`, {
      method: "POST",
      body: formData
    });
    const uploadBody = await uploadResponse.json();
    assert.equal(uploadResponse.status, 200);
    assert.equal(uploadBody.success, true);
    assert.match(uploadBody.transcript, /solar panels/i);
    assert.match(uploadBody.report.summary, /solar panels/i);
    assert.equal(uploadBody.report.segmentCount, 1);
    assert.equal(uploadBody.report.process.ideasFormed.length >= 1, true);
    assert.equal(uploadBody.report.process.ideasRejected.length >= 1, true);
    assert.equal(uploadBody.report.process.decisions.length >= 1, true);

    const extraFormData = new FormData();
    extraFormData.append(
      "file",
      new Blob(["MOCK_TRANSCRIPT: Group 2 tries to add another segment."], { type: "audio/webm" }),
      "async-group-2-extra.webm"
    );
    extraFormData.append("groupNumber", "2");
    const cappedUpload = await fetch(`${baseUrl}/api/async/join/${shareId}/upload`, {
      method: "POST",
      body: extraFormData
    });
    const cappedBody = await cappedUpload.json();
    assert.equal(cappedUpload.status, 429);
    assert.match(cappedBody.error, /upload limit/i);

    const { response: detailResponse, body: detailBody } = await jsonRequest(baseUrl, `/api/async/sessions/${createBody.session.id}`, {
      headers: teacherHeaders
    });
    assert.equal(detailResponse.status, 200);
    assert.equal(detailBody.session.groups.length, 1);
    assert.equal(detailBody.session.groups[0].report.segmentCount, 1);

    const { response: closeResponse } = await jsonRequest(baseUrl, `/api/async/sessions/${createBody.session.id}/status`, {
      method: "POST",
      headers: teacherHeaders,
      body: JSON.stringify({ status: "closed" })
    });
    assert.equal(closeResponse.status, 200);

    const blockedFormData = new FormData();
    blockedFormData.append("file", new Blob(["MOCK_TRANSCRIPT: late upload"], { type: "audio/webm" }), "late.webm");
    blockedFormData.append("groupNumber", "2");
    const blockedUpload = await fetch(`${baseUrl}/api/async/join/${shareId}/upload`, {
      method: "POST",
      body: blockedFormData
    });
    assert.equal(blockedUpload.status, 403);

    const { response: expiredCreateResponse, body: expiredCreateBody } = await jsonRequest(baseUrl, "/api/async/sessions", {
      method: "POST",
      headers: teacherHeaders,
      body: JSON.stringify({
        title: "Expired async discussion",
        instructions: "This should no longer accept uploads.",
        expiresAt: new Date(Date.now() - 60_000).toISOString()
      })
    });
    assert.equal(expiredCreateResponse.status, 201);
    assert.equal(expiredCreateBody.session.isOpen, false);

    const expiredGroupResponse = await fetch(`${baseUrl}/api/async/join/${expiredCreateBody.session.shareId}/groups`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ groupNumber: 1 })
    });
    assert.equal(expiredGroupResponse.status, 403);

    assert.equal(dbOverrides.dump("async_sessions").length, 2);
    assert.equal(dbOverrides.dump("async_groups").length, 1);
    assert.equal(dbOverrides.dump("async_segments").length, 1);
    assert.equal(dbOverrides.dump("async_group_reports").length, 1);
  } finally {
    await stopServer(http);
    authModule.__setAuthTestOverrides(null);
    dbModule.__setDbTestOverrides(null);
    delete process.env.ASYNC_MAX_SEGMENTS_PER_GROUP;
    delete process.env.ASYNC_MAX_TRANSCRIPT_CHARS_PER_GROUP;
  }
});
