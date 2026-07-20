import { db } from "../db/db.js";
import { isAdminUser, isGuestUser, normalizeEmail } from "../middleware/auth.js";

let warnedAboutMissingPromptCreatorColumns = false;

function looksLikeEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(String(value || "").trim());
}

function isMissingPromptCreatorColumnError(error) {
    const message = String(error?.message || "");
    return message.includes("created_by_user_id") || message.includes("created_by_email");
}

function warnAboutMissingPromptCreatorColumns(error) {
    if (warnedAboutMissingPromptCreatorColumns) {
        return;
    }

    warnedAboutMissingPromptCreatorColumns = true;
    console.warn("⚠️ Prompt creator columns are missing; falling back to legacy authorName ownership until the migration is applied.", error.message);
}

export function normalizePromptRecord(prompt) {
    if (!prompt) {
        return null;
    }

    const legacyCreatorEmail = looksLikeEmail(prompt.authorName) ? normalizeEmail(prompt.authorName) : null;
    const createdByEmail = normalizeEmail(prompt.createdByEmail || legacyCreatorEmail);

    return {
        ...prompt,
        tags: Array.isArray(prompt.tags) ? prompt.tags : [],
        createdByUserId: prompt.createdByUserId || null,
        createdByEmail: createdByEmail || null,
        creatorEmail: createdByEmail || null
    };
}

export function canTeacherManagePrompt(prompt, teacher) {
    if (!prompt || !teacher) {
        return false;
    }

    if (isAdminUser(teacher)) {
        return true;
    }

    if (isGuestUser(teacher)) {
        return false;
    }

    const normalizedPrompt = normalizePromptRecord(prompt);
    const teacherEmail = normalizeEmail(teacher.email);

    return (
        Boolean(normalizedPrompt.createdByUserId && normalizedPrompt.createdByUserId === teacher.id) ||
        Boolean(normalizedPrompt.createdByEmail && normalizedPrompt.createdByEmail === teacherEmail)
    );
}

export function canTeacherViewPrompt(prompt, teacher) {
    if (!prompt || !teacher) {
        return false;
    }

    const normalizedPrompt = normalizePromptRecord(prompt);
    return normalizedPrompt.isPublic !== false || canTeacherManagePrompt(normalizedPrompt, teacher);
}

export function canTeacherCreatePrompt(teacher) {
    return Boolean(teacher) && !isGuestUser(teacher);
}

export function decoratePromptForTeacher(prompt, teacher) {
    const normalizedPrompt = normalizePromptRecord(prompt);

    return {
        ...normalizedPrompt,
        canEdit: canTeacherManagePrompt(normalizedPrompt, teacher),
        canDelete: canTeacherManagePrompt(normalizedPrompt, teacher),
        canClone: canTeacherCreatePrompt(teacher)
    };
}

export async function insertTeacherPrompt(prompt) {
    try {
        return await db.collection("teacher_prompts").insertOne(prompt);
    } catch (error) {
        if (!isMissingPromptCreatorColumnError(error)) {
            throw error;
        }

        warnAboutMissingPromptCreatorColumns(error);

        const legacyPrompt = { ...prompt };
        delete legacyPrompt.createdByUserId;
        delete legacyPrompt.createdByEmail;
        return db.collection("teacher_prompts").insertOne(legacyPrompt);
    }
}
