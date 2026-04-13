import test from "node:test";
import assert from "node:assert/strict";

import { createDbOverrides } from "./api.integration.helpers.mjs";
import { applyBaseTestEnv, createAuthOverrides } from "./_helpers.mjs";

test("prompt helpers enforce creator-or-admin permissions and preserve clone ownership", async () => {
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
        updated_at: 1000,
        views: 0,
        last_viewed: null,
        usage_count: 0,
        last_used: null
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
        updated_at: 2000,
        views: 0,
        last_viewed: null,
        usage_count: 0,
        last_used: null
      }
    ]
  }));

  try {
    const teacher = await authModule.authenticateTeacherFromToken("teacher-token");
    const admin = await authModule.authenticateTeacherFromToken("admin-token");
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
    assert.equal(otherPrompt.canClone, true);
    assert.equal(otherPrompt.createdByEmail, "teacher-b@example.com");

    assert.equal(promptsModule.canTeacherManagePrompt(ownPrompt, teacher), true);
    assert.equal(promptsModule.canTeacherManagePrompt(otherPrompt, teacher), false);
    assert.equal(promptsModule.canTeacherManagePrompt(otherPrompt, admin), true);

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
      updated_at: 3000,
      views: 0,
      last_viewed: null,
      usage_count: 0,
      last_used: null
    });
    assert.equal(createdPrompt.inserted.createdByUserId, "teacher-1");
    assert.equal(createdPrompt.inserted.createdByEmail, "teacher@example.com");

    const clonedPrompt = await promptsModule.insertTeacherPrompt({
      ...(await promptsCollection.findOne({ _id: "prompt-2" })),
      _id: "prompt-4",
      title: "Other teacher prompt (Copy)",
      authorName: teacher.email,
      createdByUserId: teacher.id,
      createdByEmail: teacher.email,
      created_at: 4000,
      updated_at: 4000,
      views: 0,
      last_viewed: null,
      usage_count: 0,
      last_used: null
    });
    assert.equal(clonedPrompt.inserted.createdByUserId, "teacher-1");
    assert.equal(clonedPrompt.inserted.createdByEmail, "teacher@example.com");
    assert.match(clonedPrompt.inserted.title, /\(Copy\)$/);
  } finally {
    authModule.__setAuthTestOverrides(null);
    dbModule.__setDbTestOverrides(null);
  }
});
