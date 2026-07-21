import test from "node:test";
import assert from "node:assert/strict";

import { createDbOverrides } from "./api.integration.helpers.mjs";
import { applyBaseTestEnv, createAuthOverrides, jsonRequest, loadServer, stopServer } from "./_helpers.mjs";

test("prompt helpers enforce creator-or-admin permissions and preserve ownership", async () => {
  applyBaseTestEnv(0);

  const authModule = await import("../server/middleware/auth.js");
  const dbModule = await import("../server/db/db.js");
  const promptsModule = await import(`../server/services/prompts.js?test=prompt-service-${Date.now()}`);

  authModule.__setAuthTestOverrides(createAuthOverrides());
  dbModule.__setDbTestOverrides(createDbOverrides({
    teacher_prompts: [
      {
        _id: "prompt-1",
        title: "Teacher prompt",
        description: "Owned by teacher one",
        content: "Summarise the transcript",
        category: "General",
        mode: "summary",
        tags: ["summary"],
        isPublic: true,
        authorName: "teacher@example.com",
        createdByUserId: "teacher-1",
        createdByEmail: "teacher@example.com",
        created_at: 1000,
        updated_at: 1000
      },
      {
        _id: "prompt-2",
        title: "Other teacher prompt",
        description: "Owned by teacher two",
        content: "Review the checklist",
        category: "Assessment",
        mode: "checkbox",
        tags: ["checklist"],
        isPublic: true,
        authorName: "teacher-b@example.com",
        createdByUserId: "teacher-2",
        createdByEmail: "teacher-b@example.com",
        created_at: 2000,
        updated_at: 2000
      }
    ]
  }));

  try {
    const teacher = await authModule.authenticateTeacherFromToken("teacher-token");
    const admin = await authModule.authenticateTeacherFromToken("admin-token");
    const guest = await authModule.authenticateTeacherFromToken("guest-token");
    const promptsCollection = dbModule.db.collection("teacher_prompts");

    const ownPrompt = promptsModule.decoratePromptForTeacher(
      await promptsCollection.findOne({ _id: "prompt-1" }),
      teacher
    );
    const otherPrompt = promptsModule.decoratePromptForTeacher(
      await promptsCollection.findOne({ _id: "prompt-2" }),
      teacher
    );

    assert.equal(ownPrompt.canEdit, true);
    assert.equal(ownPrompt.canDelete, true);
    assert.equal(otherPrompt.canEdit, false);
    assert.equal(otherPrompt.canDelete, false);
    assert.equal(otherPrompt.createdByEmail, "teacher-b@example.com");

    assert.equal(promptsModule.canTeacherManagePrompt(ownPrompt, teacher), true);
    assert.equal(promptsModule.canTeacherManagePrompt(otherPrompt, teacher), false);
    assert.equal(promptsModule.canTeacherManagePrompt(otherPrompt, admin), true);
    assert.equal(promptsModule.canTeacherManagePrompt(ownPrompt, guest), false);
    assert.equal(promptsModule.canTeacherViewPrompt(ownPrompt, guest), true);
    assert.equal(promptsModule.canTeacherCreatePrompt(guest), false);

    const localPrompt = { ...otherPrompt, isPublic: false };
    assert.equal(promptsModule.canTeacherViewPrompt(localPrompt, teacher), false);
    assert.equal(promptsModule.canTeacherViewPrompt(localPrompt, admin), true);
    assert.equal(promptsModule.canTeacherViewPrompt(localPrompt, guest), false);

    const createdPrompt = await promptsModule.insertTeacherPrompt({
      _id: "prompt-3",
      title: "New prompt",
      description: "",
      content: "Fresh content",
      category: "General",
      mode: "summary",
      tags: [],
      isPublic: true,
      authorName: teacher.email,
      createdByUserId: teacher.id,
      createdByEmail: teacher.email,
      created_at: 3000,
      updated_at: 3000
    });
    assert.equal(createdPrompt.inserted.createdByUserId, "teacher-1");
    assert.equal(createdPrompt.inserted.createdByEmail, "teacher@example.com");

  } finally {
    authModule.__setAuthTestOverrides(null);
    dbModule.__setDbTestOverrides(null);
  }
});

test("prompt writes derive ownership from auth and partial edits preserve privacy and mode", async () => {
  applyBaseTestEnv(11046);
  const authModule = await import("../server/middleware/auth.js");
  const dbModule = await import("../server/db/db.js");
  const dbOverrides = createDbOverrides({ teacher_prompts: [] });
  authModule.__setAuthTestOverrides(createAuthOverrides());
  dbModule.__setDbTestOverrides(dbOverrides);
  const { http, startServer } = await loadServer(`prompt-write-security-${Date.now()}`);

  try {
    const address = await startServer({ exitOnFailure: false });
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const created = await jsonRequest(baseUrl, "/api/prompts", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer teacher-token" },
      body: JSON.stringify({
        title: "Private checklist",
        content: "Scenario: Discuss\nUses evidence",
        mode: "checkbox",
        isPublic: false,
        authorName: "attacker@example.com"
      })
    });
    assert.equal(created.response.status, 201);
    assert.equal(created.body.createdByEmail, "teacher@example.com");
    assert.equal(created.body.authorName, "teacher@example.com");

    const updated = await jsonRequest(baseUrl, `/api/prompts/${created.body._id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: "Bearer teacher-token" },
      body: JSON.stringify({ description: "Description only" })
    });
    assert.equal(updated.response.status, 200);
    assert.equal(updated.body.mode, "checkbox");
    assert.equal(updated.body.isPublic, false);
    assert.equal(updated.body.authorName, "teacher@example.com");
  } finally {
    await stopServer(http);
    authModule.__setAuthTestOverrides(null);
    dbModule.__setDbTestOverrides(null);
  }
});
