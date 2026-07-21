import express from "express";
import { randomInt } from "crypto";
import { randomUUID as uuid } from "node:crypto";
import { isLikelySupportedAudioBuffer, upload } from "../middleware/upload.js";
import { authenticateUserFromToken, authorizeTeacherUser, extractBearerToken, isTeacherEmailAllowedForLogin, normalizeEmail, optionalTeacherContext, requireTeacher } from "../middleware/auth.js";
import { aiUploadLimiter, asyncJoinLimiter, asyncUploadLimiter, authLimiter } from "../middleware/rateLimit.js";
import { createSupabaseAuthClient, supabase } from "../db/supabaseClient.js";
import { clearTeacherSessionCookie, setTeacherSessionCookie } from "../services/teacherSessionCookie.js";
import { createSupabaseDb } from "../db/db.js";
import { isIgnorableTranscriptionText, transcribe } from "../services/elevenlabs.js";
import { cleanTranscriptChunk, summarise } from "../services/openai.js";
import {
    assertJoinableSessionState,
    buildJoinUrl,
    createJoinToken,
    getJoinTokenTtlSeconds,
    verifyJoinToken
} from "../services/joinTokens.js";
import { activeSessions, sessionTimers } from "../services/state.js";
import {
    appendTranscriptSegment,
    countTranscriptWords,
    createSummaryUpdateFields,
    createTranscriptRecord,
    getTranscriptBundle,
    hasTranscriptSegment,
    persistSummarySnapshot
} from "../services/transcript.js";
import {
    processCheckboxTranscript,
    normalizeCriteriaRecords,
    ensureGroupProgressDoc,
    extractExistingProgress,
    applyMatchToProgressEntry,
    buildChecklistCriteria,
    cleanupOldSessionData
} from "../services/checkbox.js";
import {
    buildCombinedHistoryExport,
    buildHistorySessionDetail,
    buildSegmentsHistoryExport,
    getHistorySessionOrThrow,
    listHistorySessions
} from "../services/history.js";
import {
    canTeacherCreatePrompt,
    canTeacherManagePrompt,
    canTeacherViewPrompt,
    decoratePromptForTeacher,
    insertTeacherPrompt,
    normalizePromptRecord
} from "../services/prompts.js";
import { isSummaryReleased, recordSummaryRelease } from "../services/summaryRelease.js";
import {
    analyzeAsyncDiscussion,
    buildAsyncJoinUrl,
    generateAsyncShareId,
    isAsyncSessionOpen,
    normalizeAsyncGroupNumber,
    normalizeAsyncShareId
} from "../services/asyncMode.js";
import {
    REALTIME_EVENTS,
    buildGroupRealtimeTopic,
    buildSessionRealtimeTopic,
    buildStudentRealtimeTopic,
    normalizeGroupNumber,
    normalizeSessionCode,
    publishRealtimeEvent
} from "../services/realtime.js";
import {
    assertStudentRealtimeMembership,
    deleteSessionRealtimeMemberships,
    extendSessionRealtimeMemberships,
    grantRealtimeTopics,
    revokeSessionRealtimeMemberships
} from "../services/realtimeMemberships.js";

const router = express.Router();
const db = createSupabaseDb();
const SESSION_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const FINAL_UPLOAD_GRACE_MS = 15_000;
const DEFAULT_CLASSROOM_SESSION_TTL_MS = 4 * 60 * 60 * 1000;
const DEFAULT_PENDING_SESSION_TTL_MS = 60 * 60 * 1000;
const DEFAULT_ASYNC_MAX_SEGMENTS_PER_GROUP = 20;
const DEFAULT_ASYNC_MAX_TRANSCRIPT_CHARS_PER_GROUP = 50_000;

router.use(optionalTeacherContext);

function sendJsonDownload(res, filename, payload) {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(JSON.stringify(payload, null, 2));
}

function createHttpError(message, status = 400) {
    const error = new Error(message);
    error.status = status;
    return error;
}

function sendRouteError(res, error, fallbackMessage) {
    const status = Number.isInteger(error?.status) ? error.status : 500;
    return res.status(status).json({
        error: status >= 500 && error?.expose !== true ? fallbackMessage : (error?.message || fallbackMessage)
    });
}

function isUniqueViolation(error) {
    return String(error?.code || "") === "23505" || /duplicate key/i.test(String(error?.message || ""));
}

function normalizeIntervalMs(value, fallback = 30000) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 5000) {
        return fallback;
    }
    return parsed;
}

function normalizePositiveInteger(value, fallback) {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1) {
        return fallback;
    }
    return parsed;
}

function getClassroomSessionTtlMs() {
    const configured = Number(process.env.CLASSROOM_SESSION_TTL_MINUTES);
    if (!Number.isFinite(configured) || configured < 15) return DEFAULT_CLASSROOM_SESSION_TTL_MS;
    return Math.min(Math.floor(configured), 12 * 60) * 60 * 1000;
}

function getPendingSessionTtlMs() {
    const configured = Number(process.env.PENDING_SESSION_TTL_MINUTES);
    if (!Number.isFinite(configured) || configured < 5) return DEFAULT_PENDING_SESSION_TTL_MS;
    return Math.min(Math.floor(configured), 120) * 60 * 1000;
}

function isClassroomSessionExpired(session, memory, now = Date.now()) {
    const expiresAt = Number(session?.expires_at || memory?.expiresAt || 0);
    return Boolean(expiresAt && expiresAt <= now);
}

async function expireClassroomSession(code, expiresAt) {
    const now = Date.now();
    const session = await db.collection("sessions").findOne({ code });
    if (!session || Number(session.expires_at || expiresAt) > now || session.ended_reason) return;

    if (!session.start_time) {
        await publishRealtimeEvent({
            sessionCode: code,
            event: REALTIME_EVENTS.SESSION_ENDED,
            audience: "all",
            payload: { reason: "abandoned", endedAt: now }
        });
        await deleteSessionRealtimeMemberships(code);
        await db.collection("sessions").deleteOne({ _id: session._id });
        activeSessions.delete(code);
        sessionTimers.delete(code);
        return;
    }

    const acceptUploadsUntil = now + FINAL_UPLOAD_GRACE_MS;

    await db.collection("sessions").updateOne({ _id: session._id }, {
        $set: {
            active: false,
            is_current: false,
            end_time: now,
            ended_reason: "expired",
            accept_uploads_until: acceptUploadsUntil
        }
    });
    const memory = activeSessions.get(code);
    if (memory) {
        activeSessions.set(code, { ...memory, active: false, stopRequestedAt: now, acceptUploadsUntil });
    }
    await publishRealtimeEvent({
        sessionCode: code,
        event: REALTIME_EVENTS.STOP_RECORDING,
        audience: "all",
        payload: { reason: "expired" }
    });
    await revokeSessionRealtimeMemberships(code);
    const terminalTimer = setTimeout(() => {
        void publishRealtimeEvent({
            sessionCode: code,
            event: REALTIME_EVENTS.SESSION_ENDED,
            audience: "all",
            payload: { reason: "expired", endedAt: now }
        });
    }, FINAL_UPLOAD_GRACE_MS);
    terminalTimer.unref?.();
}

function scheduleClassroomExpiry(code, expiresAt) {
    const previous = sessionTimers.get(code);
    if (previous) clearTimeout(previous);
    const delay = Math.max(0, Number(expiresAt) - Date.now());
    const timer = setTimeout(() => {
        sessionTimers.delete(code);
        void expireClassroomSession(code, expiresAt).catch((error) => {
            console.error(`❌ Failed to expire classroom session ${code}:`, error);
        });
    }, Math.min(delay, 2_147_483_647));
    timer.unref?.();
    sessionTimers.set(code, timer);
}

function generateSessionCode() {
    let code = "";
    for (let index = 0; index < 6; index++) {
        code += SESSION_CODE_ALPHABET[randomInt(SESSION_CODE_ALPHABET.length)];
    }
    return code;
}

async function generateUniqueSessionCode() {
    for (let attempt = 0; attempt < 25; attempt++) {
        const code = generateSessionCode();
        const existingSession = await db.collection("sessions").findOne({ code });
        if (!existingSession && !activeSessions.has(code)) {
            return code;
        }
    }
    throw createHttpError("Failed to generate a unique session code", 500);
}

async function getOwnedSessionContext(sessionCode, teacherId) {
    const session = await db.collection("sessions").findOne({ code: sessionCode });
    if (session) {
        if (session.owner_id !== teacherId) {
            throw createHttpError("Forbidden", 403);
        }
        return { session, memory: activeSessions.get(sessionCode) || null };
    }

    const memory = activeSessions.get(sessionCode);
    if (memory?.ownerId === teacherId) {
        return { session: null, memory };
    }

    throw createHttpError("Session not found", 404);
}

async function ensureSessionRecord({
    code,
    teacherId,
    mode,
    intervalMs,
    createdAt,
    active = false,
    startTime = null,
    strictness = undefined,
    expiresAt = undefined,
    isCurrent = true
}) {
    try {
        const inserted = await db.collection("sessions").insertOne({
            _id: uuid(),
            owner_id: teacherId,
            code,
            mode,
            active,
            interval_ms: intervalMs,
            strictness,
            created_at: createdAt,
            start_time: startTime,
            end_time: null,
            expires_at: expiresAt,
            is_current: isCurrent,
            accept_uploads_until: null,
            ended_reason: null,
            total_duration_seconds: null
        });
        return inserted.inserted;
    } catch (error) {
        if (!isUniqueViolation(error)) {
            throw error;
        }

        const existing = await db.collection("sessions").findOne({ code });
        if (!existing) {
            throw error;
        }

        if (existing.owner_id && existing.owner_id !== teacherId) {
            throw createHttpError("Session code collision detected. Create a new session and try again.", 409);
        }

        return existing;
    }
}

function restoreSessionRuntimeState(session) {
    const code = String(session.code || "").trim().toUpperCase();
    const existing = activeSessions.get(code);
    const expiresAt = Number(session.expires_at || 0);
    const state = {
        ...(existing || {}),
        id: session._id,
        code,
        ownerId: session.owner_id,
        active: Boolean(session.active),
        interval: session.interval_ms || 30000,
        startTime: session.start_time || null,
        created_at: session.created_at || Date.now(),
        persisted: true,
        expiresAt,
        acceptUploadsUntil: session.accept_uploads_until || existing?.acceptUploadsUntil || null,
        mode: session.mode || "summary",
        groups: existing?.groups || new Map()
    };
    activeSessions.set(code, state);
    scheduleClassroomExpiry(code, expiresAt);
    return state;
}

async function getOrCreateTeacherClassroomSession({ teacherId, mode }) {
    const now = Date.now();
    let current = await db.collection("sessions").findOne({
        owner_id: teacherId,
        mode,
        is_current: true
    });

    if (current && Number(current.expires_at || 0) <= now) {
        if (!current.start_time) {
            await deleteSessionRealtimeMemberships(current.code);
            await db.collection("sessions").deleteOne({ _id: current._id });
        } else {
            await db.collection("sessions").updateOne({ _id: current._id }, {
                $set: {
                    active: false,
                    is_current: false,
                    end_time: now,
                    ended_reason: "expired"
                }
            });
        }
        activeSessions.delete(current.code);
        current = null;
    }

    if (current) {
        restoreSessionRuntimeState(current);
        return { session: current, reused: true };
    }

    const code = await generateUniqueSessionCode();
    try {
        const session = await ensureSessionRecord({
            code,
            teacherId,
            mode,
            intervalMs: 30000,
            createdAt: now,
            active: false,
            expiresAt: now + getPendingSessionTtlMs()
        });
        restoreSessionRuntimeState(session);
        return { session, reused: false };
    } catch (error) {
        if (!isUniqueViolation(error)) throw error;
        const winner = await db.collection("sessions").findOne({
            owner_id: teacherId,
            mode,
            is_current: true
        });
        if (!winner) throw error;
        restoreSessionRuntimeState(winner);
        return { session: winner, reused: true };
    }
}

async function ensureGroupRecord(sessionId, groupNumber) {
    let group = await db.collection("groups").findOne({
        session_id: sessionId,
        number: groupNumber
    });

    if (!group) {
        const created = await db.collection("groups").insertOne({
            _id: uuid(),
            session_id: sessionId,
            number: groupNumber,
            created_at: Date.now()
        });
        group = created.inserted;
    }

    return group;
}

async function resolveStudentSessionContext({
    sessionCode,
    joinToken,
    groupNumber,
    requireActive = false,
    allowUploadGrace = false
} = {}) {
    const parsedGroup = normalizeGroupNumber(groupNumber);
    if (!parsedGroup) {
        throw createHttpError("Invalid group number", 400);
    }

    let normalizedCode = normalizeSessionCode(sessionCode);
    let tokenPayload = null;
    if (joinToken) {
        tokenPayload = verifyJoinToken(joinToken, {
            expectedSessionCode: normalizedCode || undefined
        });
        normalizedCode = tokenPayload.sessionCode;
    }

    if (!normalizedCode) {
        throw createHttpError("Session not found", 404);
    }

    let sessionState = activeSessions.get(normalizedCode);
    let session = null;
    if (!sessionState || sessionState.persisted) {
        session = await db.collection("sessions").findOne({ code: normalizedCode });
    }

    if (!sessionState && !session) {
        throw createHttpError("Session not found", 404);
    }

    if (isClassroomSessionExpired(session, sessionState)) {
        throw createHttpError("Session expired", 410);
    }

    const hasFinalizationGrace = Number(
        session?.accept_uploads_until || sessionState?.acceptUploadsUntil || 0
    ) >= Date.now();
    if ((session?.ended_reason || session?.end_time) && (!allowUploadGrace || !hasFinalizationGrace)) {
        throw createHttpError("Session ended", 404);
    }

    if (requireActive) {
        assertJoinableSessionState(normalizedCode, sessionState, session, { allowUploadGrace });
    }

    if (!sessionState && session) {
        sessionState = restoreSessionRuntimeState(session);
    }

    const nextState = sessionState || activeSessions.get(normalizedCode);
    if (nextState && !nextState.groups) {
        nextState.groups = new Map();
    }

    let group = null;
    if (session?._id) {
        group = await ensureGroupRecord(session._id, parsedGroup);
    }

    return {
        code: normalizedCode,
        groupNumber: parsedGroup,
        tokenPayload,
        session,
        sessionState: nextState,
        group,
        mode: session?.mode || nextState?.mode || "summary",
        interval: session?.interval_ms || nextState?.interval || 30000,
        active: Boolean(session?.active || nextState?.active)
    };
}

async function authenticateAnonymousStudent(req) {
    const token = extractBearerToken(req.headers.authorization || "");
    const user = await authenticateUserFromToken(token);
    if (user?.is_anonymous !== true) {
        throw createHttpError("Anonymous student authentication required", 403);
    }
    return { token, user };
}

async function authorizeStudentGroupRequest(req, sessionCode, groupNumber) {
    const identity = await authenticateAnonymousStudent(req);
    await assertStudentRealtimeMembership({
        userId: identity.user.id,
        sessionCode,
        groupNumber
    });
    return identity;
}

async function loadChecklistState(session, sessionCode, groupNumber) {
    if (!session?._id) return null;

    const [checkboxSession, criteria, progressDoc] = await Promise.all([
        db.collection("checkbox_sessions").findOne({ session_id: session._id }),
        db.collection("checkbox_criteria")
            .find({ session_id: session._id })
            .sort({ order_index: 1, created_at: 1 })
            .toArray(),
        db.collection("checkbox_progress").findOne({
            session_id: session._id,
            group_number: groupNumber
        })
    ]);

    if (!checkboxSession && criteria.length === 0) return null;
    return {
        sessionCode,
        groupNumber,
        criteria: buildChecklistCriteria(criteria, progressDoc?.progress || {}),
        scenario: checkboxSession?.scenario || "",
        timestamp: Date.now(),
        isReleased: Boolean(checkboxSession?.released_groups?.[groupNumber])
    };
}

async function buildStudentJoinState(context, realtimeUser) {
    const { code, groupNumber, session, sessionState, mode, interval, active } = context;
    const status = active ? "recording" : "waiting";
    const payload = {
        code,
        group: groupNumber,
        mode,
        status,
        interval,
        expiresAt: session?.expires_at || sessionState?.expiresAt || null,
        realtime: {
            studentTopic: buildStudentRealtimeTopic(code),
            groupTopic: buildGroupRealtimeTopic(code, groupNumber)
        }
    };
    await grantRealtimeTopics({
        userId: realtimeUser.id,
        sessionCode: code,
        topics: [payload.realtime.studentTopic, payload.realtime.groupTopic],
        audience: "student",
        groupNumber,
        expiresAt: payload.expiresAt || Date.now() + getClassroomSessionTtlMs()
    });
    if (mode === "summary") {
        const released = await isSummaryReleased({
            sessionCode: code,
            sessionId: session?._id || sessionState?.id || null,
            groupNumber
        });
        let latestSummary = null;
        if (released && session?._id) {
            const group = await db.collection("groups").findOne({
                session_id: session._id,
                number: groupNumber
            });
            if (group) {
                const summaryRecord = await db.collection("summaries").findOne({ group_id: group._id });
                latestSummary = summaryRecord?.text || null;
            }
        }

        payload.summaryState = {
            sessionCode: code,
            groupNumber,
            isReleased: released,
            summary: released ? latestSummary : null,
            timestamp: Date.now()
        };
    } else if (mode === "checkbox") {
        payload.checklistState = await loadChecklistState(session, code, groupNumber);
    }

    return payload;
}

async function publishStudentPresence(context, event, extra = {}) {
    const { code, groupNumber } = context;
    await publishRealtimeEvent({
        sessionCode: code,
        groupNumber,
        event,
        audience: "session",
        payload: {
            group: groupNumber,
            groupNumber,
            ...extra
        }
    });
}

function resolveAppOrigin(req) {
    return process.env.APP_PUBLIC_ORIGIN || `${req.protocol}://${req.get("host")}`;
}

function normalizeNullableTimestamp(value) {
    if (!value) {
        return null;
    }

    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function sanitizeShortText(value, fallback, maxLength = 160) {
    const normalized = String(value || "").trim().replace(/\s+/g, " ");
    return (normalized || fallback).slice(0, maxLength);
}

function sanitizeLongText(value, fallback = "", maxLength = 4000) {
    const normalized = String(value || "").trim();
    return (normalized || fallback).slice(0, maxLength);
}

async function generateUniqueAsyncShareId() {
    for (let attempt = 0; attempt < 25; attempt++) {
        const shareId = generateAsyncShareId();
        const existing = await db.collection("async_sessions").findOne({ share_id: shareId });
        if (!existing) {
            return shareId;
        }
    }

    throw createHttpError("Failed to generate a unique async share link", 500);
}

async function getOwnedAsyncSessionOrThrow(sessionId, teacherId) {
    const session = await db.collection("async_sessions").findOne({ _id: sessionId });
    if (!session) {
        throw createHttpError("Async session not found", 404);
    }

    if (session.owner_id !== teacherId) {
        throw createHttpError("Forbidden", 403);
    }

    return session;
}

async function getAsyncSessionByShareIdOrThrow(shareId) {
    const normalizedShareId = normalizeAsyncShareId(shareId);
    if (!normalizedShareId) {
        throw createHttpError("Async activity not found", 404);
    }

    const session = await db.collection("async_sessions").findOne({ share_id: normalizedShareId });
    if (!session) {
        throw createHttpError("Async activity not found", 404);
    }

    return session;
}

async function ensureAsyncGroup(asyncSessionId, groupNumber, displayName = "") {
    let group = await db.collection("async_groups").findOne({
        async_session_id: asyncSessionId,
        group_number: groupNumber
    });

    const normalizedDisplayName = sanitizeShortText(displayName, `Group ${groupNumber}`, 100);
    if (!group) {
        const created = await db.collection("async_groups").insertOne({
            _id: uuid(),
            async_session_id: asyncSessionId,
            group_number: groupNumber,
            display_name: normalizedDisplayName,
            created_at: Date.now(),
            updated_at: Date.now()
        });
        return created.inserted;
    }

    if (displayName && group.display_name !== normalizedDisplayName) {
        group = await db.collection("async_groups").findOneAndUpdate(
            { _id: group._id },
            {
                $set: {
                    display_name: normalizedDisplayName,
                    updated_at: Date.now()
                }
            }
        );
    }

    return group;
}

function buildAsyncSessionEnvelope(req, session, { includeInternal = false } = {}) {
    const envelope = {
        id: includeInternal ? session._id : undefined,
        shareId: includeInternal ? session.share_id : undefined,
        title: session.title,
        instructions: session.instructions,
        feedbackPrompt: includeInternal ? session.feedback_prompt || "" : undefined,
        status: session.status,
        maxGroupNumber: session.max_group_number || 12,
        createdAt: session.created_at,
        updatedAt: session.updated_at,
        expiresAt: session.expires_at || null,
        isOpen: isAsyncSessionOpen(session),
        joinUrl: includeInternal ? buildAsyncJoinUrl(resolveAppOrigin(req), session.share_id) : undefined
    };

    return Object.fromEntries(Object.entries(envelope).filter(([, value]) => value !== undefined));
}

async function loadAsyncSessionGroups(asyncSessionId) {
    const groups = await db.collection("async_groups")
        .find({ async_session_id: asyncSessionId })
        .sort({ group_number: 1 })
        .toArray();

    const reports = await db.collection("async_group_reports")
        .find({ async_session_id: asyncSessionId })
        .sort({ updated_at: -1 })
        .toArray();
    const reportsByGroup = new Map(reports.map((report) => [report.async_group_id, report]));

    return groups.map((group) => {
        const report = reportsByGroup.get(group._id) || null;
        return {
            id: group._id,
            groupNumber: group.group_number,
            displayName: group.display_name || `Group ${group.group_number}`,
            createdAt: group.created_at,
            updatedAt: group.updated_at,
            report: report ? {
                summary: report.summary || "",
                feedback: report.feedback || "",
                process: report.process || {},
                segmentCount: report.segment_count || 0,
                updatedAt: report.updated_at
            } : null
        };
    });
}

function getAsyncMaxSegmentsPerGroup() {
    return normalizePositiveInteger(
        process.env.ASYNC_MAX_SEGMENTS_PER_GROUP,
        DEFAULT_ASYNC_MAX_SEGMENTS_PER_GROUP
    );
}

function getAsyncMaxTranscriptCharsPerGroup() {
    return normalizePositiveInteger(
        process.env.ASYNC_MAX_TRANSCRIPT_CHARS_PER_GROUP,
        DEFAULT_ASYNC_MAX_TRANSCRIPT_CHARS_PER_GROUP
    );
}

async function loadAsyncGroupSegments(groupId) {
    return db.collection("async_segments")
        .find({ async_group_id: groupId })
        .sort({ created_at: 1 })
        .toArray();
}

function getAsyncTranscriptCharCount(segments = []) {
    return segments.reduce((total, segment) => total + String(segment.text || "").length, 0);
}

async function assertAsyncGroupCanAcceptUpload(group) {
    const previousSegments = await loadAsyncGroupSegments(group._id);

    if (previousSegments.length >= getAsyncMaxSegmentsPerGroup()) {
        throw createHttpError("This group has reached the upload limit for this activity", 429);
    }

    if (getAsyncTranscriptCharCount(previousSegments) >= getAsyncMaxTranscriptCharsPerGroup()) {
        throw createHttpError("This group has reached the transcript limit for this activity", 429);
    }

    return previousSegments;
}

async function buildAsyncGroupReport({ session, group, latestText, latestDuration, chunkId = null, previousSegments = null }) {
    const existingSegments = previousSegments || (await loadAsyncGroupSegments(group._id));
    const now = Date.now();
    const cleanedText = await cleanTranscriptChunk(latestText, {
        previousSegments: existingSegments
    });
    const finalText = cleanedText || latestText;
    if (getAsyncTranscriptCharCount(existingSegments) + finalText.length > getAsyncMaxTranscriptCharsPerGroup()) {
        throw createHttpError("This group has reached the transcript limit for this activity", 429);
    }

    const wordCount = countTranscriptWords(finalText);
    const segmentNumber = existingSegments.length + 1;
    const created = await db.collection("async_segments").insertOne({
        _id: uuid(),
        async_session_id: session._id,
        async_group_id: group._id,
        segment_number: segmentNumber,
        text: finalText,
        word_count: wordCount,
        duration_seconds: latestDuration,
        client_chunk_id: chunkId,
        created_at: now
    });

    const segments = [...existingSegments, created.inserted];
    const transcriptText = segments.map((segment) => segment.text).join("\n\n");
    const analysis = await analyzeAsyncDiscussion({
        transcriptText,
        segments,
        instructions: session.instructions,
        feedbackPrompt: session.feedback_prompt || ""
    });

    const report = await db.collection("async_group_reports").findOneAndUpdate(
        { async_group_id: group._id },
        {
            $set: {
                _id: uuid(),
                async_session_id: session._id,
                async_group_id: group._id,
                summary: analysis.summary,
                feedback: analysis.feedback,
                process: analysis.process,
                segment_count: segments.length,
                created_at: now,
                updated_at: now
            }
        },
        { upsert: true }
    );

    return {
        transcript: finalText,
        segment: created.inserted,
        report
    };
}

export function validateStudentUploadRequest({ file, joinToken, sessionCode, groupNumber }) {
    const normalizedSessionCode = String(sessionCode || "").trim().toUpperCase();
    if (!file || (!joinToken && !normalizedSessionCode) || !Number.isFinite(groupNumber) || groupNumber <= 0) {
        throw createHttpError("Missing file, session code, or group number", 400);
    }
}

function allowMockAudioPayloads() {
    return process.env.ALLOW_DEV_TEST === "true" && process.env.MOCK_AI_SERVICES === "true";
}

export function validateAudioUploadPayload(file) {
    if (!file?.buffer?.length) {
        throw createHttpError("Missing audio file", 400);
    }

    if (allowMockAudioPayloads()) {
        return;
    }

    if (!isLikelySupportedAudioBuffer(file.buffer, file.mimetype)) {
        throw createHttpError("Invalid or unsupported audio file", 400);
    }
}

async function resolveJoinableSession(joinToken, options = {}) {
    const payload = verifyJoinToken(joinToken);
    const sessionCode = payload.sessionCode;
    const session = await db.collection("sessions").findOne({ code: sessionCode });
    const sessionState = activeSessions.get(sessionCode);
    return {
        payload,
        ...assertJoinableSessionState(sessionCode, sessionState, session, options)
    };
}

function extractTranscriptMetrics(transcription) {
    const text = String(transcription?.text || "").trim();
    const wordCount = Array.isArray(transcription?.words) && transcription.words.length > 0
        ? transcription.words.length
        : text.split(/\s+/).filter(Boolean).length;

    const duration = Array.isArray(transcription?.words) && transcription.words.length > 0
        ? Number(transcription.words[transcription.words.length - 1]?.end || 0)
        : Math.max(10, Math.min(30, text.length * 0.05));

    return {
        text,
        wordCount,
        duration
    };
}

router.post("/session/:code/student-join", express.json(), async (req, res) => {
    try {
        const { user: realtimeUser } = await authenticateAnonymousStudent(req);
        const context = await resolveStudentSessionContext({
            sessionCode: req.params.code,
            joinToken: req.body?.token || req.query?.token,
            groupNumber: req.body?.group ?? req.query?.group
        });

        const mem = context.sessionState || activeSessions.get(context.code);
        if (mem) {
            if (!mem.groups) mem.groups = new Map();
            mem.groups.set(context.groupNumber, {
                ...(mem.groups.get(context.groupNumber) || {}),
                joined: true,
                recording: Boolean(mem.active),
                lastAck: Date.now()
            });
            activeSessions.set(context.code, mem);
        }

        const payload = await buildStudentJoinState(context, realtimeUser);
        await publishStudentPresence(context, REALTIME_EVENTS.STUDENT_JOINED, {
            summaryReleased: payload.summaryState?.isReleased
        });

        res.json(payload);
    } catch (err) {
        console.error("❌ Failed to join student session:", err);
        sendRouteError(res, err, "Failed to join session");
    }
});

router.post("/session/:code/student-event", express.json(), async (req, res) => {
    try {
        const event = String(req.body?.event || "").trim();
        const context = await resolveStudentSessionContext({
            sessionCode: req.params.code,
            joinToken: req.body?.token,
            groupNumber: req.body?.group ?? req.body?.groupNumber
        });
        await authorizeStudentGroupRequest(req, context.code, context.groupNumber);

        const mem = context.sessionState || activeSessions.get(context.code);
        if (mem) {
            if (!mem.groups) mem.groups = new Map();
            const currentGroupState = mem.groups.get(context.groupNumber) || {};
            mem.groups.set(context.groupNumber, {
                ...currentGroupState,
                joined: true,
                recording: event === "recording_started" ? true : currentGroupState.recording,
                lastAck: Date.now()
            });
            activeSessions.set(context.code, mem);
        }

        if (event === REALTIME_EVENTS.UPLOAD_STATUS || event === "upload_status") {
            await publishRealtimeEvent({
                sessionCode: context.code,
                groupNumber: context.groupNumber,
                event: REALTIME_EVENTS.UPLOAD_STATUS,
                audience: "session",
                payload: {
                    group: context.groupNumber,
                    ...req.body?.payload
                }
            });
        } else if (event === REALTIME_EVENTS.UPLOAD_ERROR || event === "upload_error") {
            await publishRealtimeEvent({
                sessionCode: context.code,
                groupNumber: context.groupNumber,
                event: REALTIME_EVENTS.UPLOAD_ERROR,
                audience: "session",
                payload: {
                    group: context.groupNumber,
                    ...req.body?.payload
                }
            });
        }

        res.json({ success: true });
    } catch (err) {
        console.error("❌ Failed to process student event:", err);
        sendRouteError(res, err, "Failed to process student event");
    }
});

router.post("/session/:code/student-leave", express.json(), async (req, res) => {
    try {
        const context = await resolveStudentSessionContext({
            sessionCode: req.params.code,
            joinToken: req.body?.token,
            groupNumber: req.body?.group ?? req.body?.groupNumber
        });
        await authorizeStudentGroupRequest(req, context.code, context.groupNumber);

        const mem = context.sessionState || activeSessions.get(context.code);
        if (mem?.groups) {
            mem.groups.delete(context.groupNumber);
            activeSessions.set(context.code, mem);
        }

        await publishStudentPresence(context, REALTIME_EVENTS.STUDENT_LEFT);
        res.json({ success: true });
    } catch (err) {
        console.error("❌ Failed to leave student session:", err);
        sendRouteError(res, err, "Failed to leave session");
    }
});

router.post("/session/:code/release-summary", express.json(), async (req, res) => {
    try {
        const teacher = await requireTeacher(req, res);
        if (!teacher) return;

        const code = normalizeSessionCode(req.params.code);
        const groupNumber = normalizeGroupNumber(req.body?.groupNumber ?? req.body?.group);
        if (!groupNumber) {
            throw createHttpError("Invalid group number", 400);
        }

        const { session, memory } = await getOwnedSessionContext(code, teacher.id);
        const sessionId = session?._id || memory?.id || null;
        const summaryRelease = await recordSummaryRelease({
            sessionCode: code,
            sessionId,
            groupNumber,
            isReleased: req.body?.isReleased !== false
        });

        let latestSummary = null;
        if (sessionId) {
            const group = await db.collection("groups").findOne({
                session_id: sessionId,
                number: groupNumber
            });
            if (group) {
                const summaryRecord = await db.collection("summaries").findOne({ group_id: group._id });
                latestSummary = summaryRecord?.text || null;
            }
        }

        const summaryState = {
            sessionCode: code,
            groupNumber,
            isReleased: summaryRelease.isReleased,
            summary: summaryRelease.isReleased ? latestSummary : null,
            timestamp: summaryRelease.timestamp
        };

        await publishRealtimeEvent({
            sessionCode: code,
            groupNumber,
            event: REALTIME_EVENTS.SUMMARY_STATE,
            audience: "both",
            payload: summaryState
        });

        res.json({ success: true, summaryState });
    } catch (err) {
        console.error("❌ Failed to release summary:", err);
        sendRouteError(res, err, "Failed to release summary");
    }
});

router.post("/checkbox/:sessionCode/release", express.json(), async (req, res) => {
    try {
        const teacher = await requireTeacher(req, res);
        if (!teacher) return;

        const sessionCode = normalizeSessionCode(req.params.sessionCode);
        const groupNumber = normalizeGroupNumber(req.body?.groupNumber ?? req.body?.group);
        if (!groupNumber) {
            throw createHttpError("Invalid group number", 400);
        }

        const { session } = await getOwnedSessionContext(sessionCode, teacher.id);
        if (!session) {
            throw createHttpError("Persisted checkbox session required before release", 404);
        }

        const existingCheckboxSession = await db.collection("checkbox_sessions").findOne({ session_id: session._id });
        const nowTs = Date.now();
        const updatedCheckboxSession = {
            ...(existingCheckboxSession || {}),
            session_id: session._id,
            scenario: existingCheckboxSession?.scenario ?? req.body?.scenario ?? "",
            released_groups: {
                ...(existingCheckboxSession?.released_groups || {}),
                [groupNumber]: req.body?.isReleased !== false
            },
            release_timestamps: {
                ...(existingCheckboxSession?.release_timestamps || {}),
                [groupNumber]: nowTs
            },
            updated_at: nowTs
        };

        await db.collection("checkbox_sessions").findOneAndUpdate(
            { session_id: session._id },
            { $set: updatedCheckboxSession },
            { upsert: true }
        );

        const dbCriteria = await db.collection("checkbox_criteria")
            .find({ session_id: session._id })
            .sort({ order_index: 1, created_at: 1 })
            .toArray();
        const progressDoc = await db.collection("checkbox_progress").findOne({
            session_id: session._id,
            group_number: groupNumber
        });
        const progressMap = progressDoc?.progress || {};
        const incomingCriteria = Array.isArray(req.body?.criteria) ? req.body.criteria : [];

        let finalCriteria = dbCriteria.map((criterion, index) => {
            const progress = progressMap[String(criterion._id)];
            return {
                id: index,
                dbId: criterion._id,
                description: criterion.description,
                rubric: criterion.rubric || "",
                status: progress?.status || "grey",
                completed: progress?.completed || (progress?.status === "green") || false,
                quote: progress?.quote || null
            };
        });

        if (finalCriteria.length === 0) {
            finalCriteria = incomingCriteria.map((criterion, index) => ({
                id: Number(criterion.id ?? index),
                dbId: criterion.dbId,
                description: criterion.description,
                rubric: criterion.rubric || "",
                status: criterion.status || "grey",
                completed: criterion.status === "green" ? true : Boolean(criterion.completed),
                quote: criterion.quote ?? null
            }));
        }

        finalCriteria = finalCriteria.slice().sort((left, right) => Number(left.id) - Number(right.id));
        const checklistData = {
            sessionCode,
            groupNumber,
            criteria: finalCriteria,
            scenario: updatedCheckboxSession.scenario || req.body?.scenario || "",
            timestamp: Date.now(),
            isReleased: req.body?.isReleased !== false
        };

        await publishRealtimeEvent({
            sessionCode,
            groupNumber,
            event: REALTIME_EVENTS.CHECKLIST_STATE,
            audience: "both",
            payload: checklistData
        });
        res.json({ success: true, checklistState: checklistData });
    } catch (err) {
        console.error("❌ Failed to release checklist:", err);
        sendRouteError(res, err, "Failed to release checklist");
    }
});

async function listAllPrompts() {
    const prompts = await db.collection("teacher_prompts")
        .find({})
        .sort({ updated_at: -1, created_at: -1 })
        .toArray();

    return prompts.map((prompt) => normalizePromptRecord(prompt));
}

function filterPrompts(prompts, { search = "", category = "", mode = "" } = {}) {
    const normalizedSearch = String(search || "").trim().toLowerCase();

    return prompts.filter((prompt) => {
        if (category && prompt.category !== category) {
            return false;
        }

        if (mode && prompt.mode !== mode) {
            return false;
        }

        if (!normalizedSearch) {
            return true;
        }

        const haystack = [
            prompt.title,
            prompt.description,
            prompt.content,
            prompt.authorName,
            prompt.createdByEmail,
            ...(Array.isArray(prompt.tags) ? prompt.tags : [])
        ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();

        return haystack.includes(normalizedSearch);
    });
}

router.post("/auth/otp/send", authLimiter, express.json(), async (req, res) => {
    const email = normalizeEmail(req.body?.email);
    if (!email || !email.includes("@") || email.length > 254) {
        return res.status(400).json({ error: "Enter a valid email address" });
    }

    try {
        const allowed = await isTeacherEmailAllowedForLogin(email);
        if (allowed) {
            const redirectOrigin = process.env.APP_PUBLIC_ORIGIN || `${req.protocol}://${req.get("host")}`;
            const { error } = await createSupabaseAuthClient().auth.signInWithOtp({
                email,
                options: {
                    shouldCreateUser: true,
                    emailRedirectTo: `${redirectOrigin.replace(/\/$/, "")}/admin`
                }
            });
            if (error) throw error;
        }

        // Keep the response identical so the endpoint does not disclose approved accounts.
        return res.json({ success: true, message: "If this address is approved, a code has been sent." });
    } catch (error) {
        console.error("❌ Failed to send teacher OTP:", error.message);
        return res.status(503).json({ error: "Unable to send a login code right now" });
    }
});

router.post("/auth/otp/verify", authLimiter, express.json(), async (req, res) => {
    const email = normalizeEmail(req.body?.email);
    const token = String(req.body?.token || "").replace(/\s+/g, "");
    if (!email || !token || token.length > 128) {
        return res.status(400).json({ error: "Email and verification code are required" });
    }

    try {
        const { data, error } = await createSupabaseAuthClient().auth.verifyOtp({ email, token, type: "email" });
        if (error || !data?.user) {
            clearTeacherSessionCookie(res);
            return res.status(401).json({ error: "That code is expired or invalid. Request a new code." });
        }

        const teacher = await authorizeTeacherUser(data.user);
        if (!data.session?.access_token || !data.session?.refresh_token) {
            throw createHttpError("Supabase did not return a refreshable teacher session", 503);
        }
        const cookie = setTeacherSessionCookie(res, teacher, data.session);
        return res.json({
            success: true,
            expiresAt: cookie.expiresAt,
            user: {
                id: teacher.id,
                email: teacher.email,
                role: teacher.role || "teacher",
                isAdmin: Boolean(teacher.isAdmin || teacher.role === "admin")
            }
        });
    } catch (error) {
        clearTeacherSessionCookie(res);
        const status = error?.status === 403 ? 403 : 500;
        return res.status(status).json({
            error: status === 403 ? "Teacher access is not approved" : "Unable to verify the login code"
        });
    }
});

router.post("/auth/logout", async (req, res) => {
    if (req.authToken) {
        await supabase.auth.admin.signOut(req.authToken, "local").catch((error) => {
            console.warn("⚠️ Supabase teacher sign-out failed:", error.message);
        });
    }
    clearTeacherSessionCookie(res);
    res.json({ success: true });
});

router.get("/auth/me", async (req, res) => {
    const teacher = await requireTeacher(req, res);
    if (!teacher) return;

    res.json({
        teacher: true,
        isAdmin: Boolean(teacher.isAdmin || teacher.role === "admin"),
        user: {
            id: teacher.id,
            email: teacher.email,
            role: teacher.role || teacher.teacherAccess?.role || "teacher",
            isAdmin: Boolean(teacher.isAdmin || teacher.role === "admin")
        }
    });
});

router.get("/async/sessions", async (req, res) => {
    try {
        const teacher = await requireTeacher(req, res);
        if (!teacher) return;

        const sessions = await db.collection("async_sessions")
            .find({ owner_id: teacher.id })
            .sort({ created_at: -1 })
            .limit(30)
            .toArray();

        const payload = await Promise.all(sessions.map(async (session) => ({
            ...buildAsyncSessionEnvelope(req, session, { includeInternal: true }),
            groups: await loadAsyncSessionGroups(session._id)
        })));

        res.json({ sessions: payload });
    } catch (err) {
        console.error("❌ Failed to list async sessions:", err);
        sendRouteError(res, err, "Failed to list async sessions");
    }
});

router.post("/async/sessions", express.json(), async (req, res) => {
    try {
        const teacher = await requireTeacher(req, res);
        if (!teacher) return;

        const title = sanitizeShortText(req.body?.title, "Asynchronous discussion", 140);
        const instructions = sanitizeLongText(
            req.body?.instructions,
            "Record your group discussion. Explain your reasoning, alternatives, decisions, and questions.",
            6000
        );
        const feedbackPrompt = sanitizeLongText(
            req.body?.feedbackPrompt,
            "Give concise feedback on the group's reasoning and process.",
            4000
        );
        const maxGroupNumber = normalizeAsyncGroupNumber(req.body?.maxGroupNumber, 99) || 12;
        const expiresAt = normalizeNullableTimestamp(req.body?.expiresAt);
        const shareId = await generateUniqueAsyncShareId();
        const now = Date.now();

        const inserted = await db.collection("async_sessions").insertOne({
            _id: uuid(),
            owner_id: teacher.id,
            share_id: shareId,
            title,
            instructions,
            feedback_prompt: feedbackPrompt,
            status: "open",
            max_group_number: maxGroupNumber,
            created_at: now,
            updated_at: now,
            expires_at: expiresAt,
            closed_at: null
        });

        res.status(201).json({
            session: {
                ...buildAsyncSessionEnvelope(req, inserted.inserted, { includeInternal: true }),
                groups: []
            }
        });
    } catch (err) {
        console.error("❌ Failed to create async session:", err);
        sendRouteError(res, err, "Failed to create async session");
    }
});

router.get("/async/sessions/:id", async (req, res) => {
    try {
        const teacher = await requireTeacher(req, res);
        if (!teacher) return;

        const session = await getOwnedAsyncSessionOrThrow(req.params.id, teacher.id);
        res.json({
            session: {
                ...buildAsyncSessionEnvelope(req, session, { includeInternal: true }),
                groups: await loadAsyncSessionGroups(session._id)
            }
        });
    } catch (err) {
        console.error("❌ Failed to load async session:", err);
        sendRouteError(res, err, "Failed to load async session");
    }
});

router.post("/async/sessions/:id/status", express.json(), async (req, res) => {
    try {
        const teacher = await requireTeacher(req, res);
        if (!teacher) return;

        const session = await getOwnedAsyncSessionOrThrow(req.params.id, teacher.id);
        const status = req.body?.status === "closed" ? "closed" : "open";
        const now = Date.now();
        const updated = await db.collection("async_sessions").findOneAndUpdate(
            { _id: session._id },
            {
                $set: {
                    status,
                    updated_at: now,
                    closed_at: status === "closed" ? now : null
                }
            }
        );

        res.json({
            session: {
                ...buildAsyncSessionEnvelope(req, updated, { includeInternal: true }),
                groups: await loadAsyncSessionGroups(updated._id)
            }
        });
    } catch (err) {
        console.error("❌ Failed to update async session status:", err);
        sendRouteError(res, err, "Failed to update async session status");
    }
});

router.get("/async/join/:shareId", asyncJoinLimiter, async (req, res) => {
    try {
        const session = await getAsyncSessionByShareIdOrThrow(req.params.shareId);
        res.json({ session: buildAsyncSessionEnvelope(req, session) });
    } catch (err) {
        console.error("❌ Failed to load async join link:", err);
        sendRouteError(res, err, "Failed to load async activity");
    }
});

router.post("/async/join/:shareId/groups", asyncJoinLimiter, express.json(), async (req, res) => {
    try {
        const session = await getAsyncSessionByShareIdOrThrow(req.params.shareId);
        if (!isAsyncSessionOpen(session)) {
            throw createHttpError("This asynchronous activity is closed", 403);
        }

        const groupNumber = normalizeAsyncGroupNumber(req.body?.groupNumber, session.max_group_number || 12);
        if (!groupNumber) {
            throw createHttpError("Invalid group number", 400);
        }

        const group = await ensureAsyncGroup(session._id, groupNumber, req.body?.displayName);
        const report = await db.collection("async_group_reports").findOne({ async_group_id: group._id });
        res.json({
            group: {
                groupNumber: group.group_number,
                displayName: group.display_name || `Group ${group.group_number}`,
                report: report ? {
                    summary: report.summary || "",
                    feedback: report.feedback || "",
                    process: report.process || {},
                    segmentCount: report.segment_count || 0,
                    updatedAt: report.updated_at
                } : null
            }
        });
    } catch (err) {
        console.error("❌ Failed to join async activity:", err);
        sendRouteError(res, err, "Failed to join async activity");
    }
});

router.post("/async/join/:shareId/upload", asyncUploadLimiter, upload.single("file"), async (req, res) => {
    try {
        const session = await getAsyncSessionByShareIdOrThrow(req.params.shareId);
        if (!isAsyncSessionOpen(session)) {
            throw createHttpError("This asynchronous activity is closed", 403);
        }

        const groupNumber = normalizeAsyncGroupNumber(req.body?.groupNumber, session.max_group_number || 12);
        const requestedChunkId = String(req.body?.chunkId || "").trim();
        const chunkId = /^[a-zA-Z0-9_-]{16,100}$/.test(requestedChunkId) ? requestedChunkId : null;
        if (!req.file || !groupNumber) {
            throw createHttpError("Missing file or group number", 400);
        }
        validateAudioUploadPayload(req.file);

        const group = await ensureAsyncGroup(session._id, groupNumber, req.body?.displayName);
        const previousSegments = await assertAsyncGroupCanAcceptUpload(group);
        const duplicateSegment = chunkId
            ? previousSegments.find((segment) => segment.client_chunk_id === chunkId)
            : null;
        if (duplicateSegment) {
            const report = await db.collection("async_group_reports").findOne({ async_group_id: group._id });
            return res.json({
                success: true,
                duplicate: true,
                transcript: duplicateSegment.text,
                report: report ? {
                    summary: report.summary || "",
                    feedback: report.feedback || "",
                    process: report.process || {},
                    segmentCount: report.segment_count || 0,
                    updatedAt: report.updated_at
                } : null
            });
        }
        const transcription = await transcribe(req.file.buffer, req.file.mimetype);
        const { text, duration } = extractTranscriptMetrics(transcription);

        if (!text || isIgnorableTranscriptionText(text)) {
            return res.json({ success: true, skipped: true, reason: "No speech detected", chunkId });
        }

        const { transcript, report } = await buildAsyncGroupReport({
            session,
            group,
            latestText: text,
            latestDuration: duration,
            chunkId,
            previousSegments
        });

        res.json({
            success: true,
            group: {
                groupNumber: group.group_number,
                displayName: group.display_name || `Group ${group.group_number}`
            },
            transcript,
            report: {
                summary: report.summary || "",
                feedback: report.feedback || "",
                process: report.process || {},
                segmentCount: report.segment_count || 0,
                updatedAt: report.updated_at
            }
        });
    } catch (err) {
        console.error("❌ Failed to process async upload:", err);
        sendRouteError(res, err, "Failed to process async upload");
    }
});

router.get("/new-session", (_req, res) => {
    res.status(405).json({ error: "Use POST to create a session" });
});

router.post("/new-session", async (req, res) => {
    try {
        const teacher = await requireTeacher(req, res);
        if (!teacher) return;

        if (!req.teacherSupabaseAccessToken && process.env.NODE_ENV === "production") {
            throw createHttpError("A refreshable Supabase teacher session is required", 401);
        }
        const mode = req.query.mode === "checkbox" ? "checkbox" : "summary";
        const { session, reused } = await getOrCreateTeacherClassroomSession({
            teacherId: teacher.id,
            mode
        });
        const code = session.code;
        const createdAt = Number(session.created_at || Date.now());
        const expiresAt = Number(session.expires_at || createdAt + getClassroomSessionTtlMs());
        await grantRealtimeTopics({
            userId: teacher.id,
            sessionCode: code,
            topics: [buildSessionRealtimeTopic(code)],
            audience: "teacher",
            expiresAt
        });

        res.json({
            code,
            mode,
            interval: session.interval_ms || 30000,
            active: Boolean(session.active),
            startTime: session.start_time ? new Date(session.start_time).toISOString() : null,
            createdAt: new Date(createdAt).toISOString(),
            expiresAt: new Date(expiresAt).toISOString(),
            pending: !session.start_time,
            reused,
            realtime: {
                teacherTopic: buildSessionRealtimeTopic(code),
                accessToken: req.teacherSupabaseAccessToken || null
            }
        });
    } catch (err) {
        console.error("❌ Failed to create session:", err);
        sendRouteError(res, err, "Failed to create session");
    }
});

router.post("/session/:code/join-token", async (req, res) => {
    try {
        const teacher = await requireTeacher(req, res);
        if (!teacher) return;

        const sessionCode = String(req.params.code || "").trim().toUpperCase();
        await getOwnedSessionContext(sessionCode, teacher.id);

        const ttlSeconds = getJoinTokenTtlSeconds();
        const token = createJoinToken({
            sessionCode,
            expiresInSeconds: ttlSeconds
        });
        const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
        const url = buildJoinUrl(resolveAppOrigin(req), token);

        res.json({
            token,
            expiresAt,
            url
        });
    } catch (err) {
        console.error("❌ Failed to create join token:", err);
        sendRouteError(res, err, "Failed to create join token");
    }
});

router.post("/session/:code/start", express.json(), async (req, res) => {
    try {
        const teacher = await requireTeacher(req, res);
        if (!teacher) return;

        const { code } = req.params;
        const requestedMode = req.body?.mode === "checkbox" ? "checkbox" : "summary";
        const intervalMs = normalizeIntervalMs(req.body?.interval);
        const { session, memory } = await getOwnedSessionContext(code, teacher.id);
        const createdAt = session?.created_at || memory?.created_at || Date.now();
        const startTime = Date.now();

        if (isClassroomSessionExpired(session, memory, startTime)) {
            throw createHttpError("Session expired. Create a new session.", 410);
        }
        if (session?.ended_reason || session?.end_time || memory?.stopRequestedAt) {
            throw createHttpError("Session ended. Create a new session.", 409);
        }

        let persistedSession = session;
        if (!persistedSession) {
            persistedSession = await ensureSessionRecord({
                code,
                teacherId: teacher.id,
                mode: requestedMode,
                intervalMs,
                createdAt,
                active: true,
                startTime,
                expiresAt: startTime + getClassroomSessionTtlMs()
            });
        }

        const wasStarted = Boolean(persistedSession.start_time);
        const expiresAt = wasStarted
            ? Number(persistedSession.expires_at || startTime + getClassroomSessionTtlMs())
            : startTime + getClassroomSessionTtlMs();

        await db.collection("sessions").updateOne(
            { _id: persistedSession._id },
            {
                $set: {
                    owner_id: teacher.id,
                    mode: requestedMode,
                    active: true,
                    is_current: true,
                    interval_ms: intervalMs,
                    start_time: persistedSession.start_time || startTime,
                    expires_at: expiresAt,
                    end_time: null,
                    ended_reason: null,
                    accept_uploads_until: null
                }
            }
        );
        persistedSession = await db.collection("sessions").findOne({ _id: persistedSession._id });
        await extendSessionRealtimeMemberships(code, expiresAt);

        activeSessions.set(code, {
            ...(memory || {}),
            id: persistedSession._id,
            code,
            ownerId: teacher.id,
            active: true,
            interval: intervalMs,
            startTime: persistedSession.start_time || startTime,
            created_at: createdAt,
            persisted: true,
            mode: requestedMode,
            groups: memory?.groups || new Map(),
            checkbox: memory?.checkbox,
            expiresAt,
            acceptUploadsUntil: null,
            stopRequestedAt: null
        });

        scheduleClassroomExpiry(code, expiresAt);

        await publishRealtimeEvent({
            sessionCode: code,
            event: REALTIME_EVENTS.RECORD_NOW,
            audience: "all",
            payload: { interval: intervalMs }
        });

        res.json({
            success: true,
            code,
            mode: requestedMode,
            interval: intervalMs,
            expiresAt: new Date(expiresAt).toISOString()
        });
    } catch (err) {
        console.error("❌ Failed to start session:", err);
        sendRouteError(res, err, "Failed to start session");
    }
});

router.post("/session/:code/stop", async (req, res) => {
    try {
        const teacher = await requireTeacher(req, res);
        if (!teacher) return;

        const { code } = req.params;
        const { session, memory } = await getOwnedSessionContext(code, teacher.id);
        const endedAt = Date.now();
        const acceptUploadsUntil = endedAt + FINAL_UPLOAD_GRACE_MS;
        const wasStarted = Boolean(session?.start_time || memory?.startTime);

        if (!wasStarted) {
            await publishRealtimeEvent({
                sessionCode: code,
                event: REALTIME_EVENTS.SESSION_ENDED,
                audience: "all",
                payload: { reason: "abandoned", endedAt }
            });
            await deleteSessionRealtimeMemberships(code);
            if (session) await db.collection("sessions").deleteOne({ _id: session._id });
            activeSessions.delete(code);
            const pendingTimer = sessionTimers.get(code);
            if (pendingTimer) clearTimeout(pendingTimer);
            sessionTimers.delete(code);
            return res.json({
                success: true,
                code,
                discarded: true,
                endedAt: new Date(endedAt).toISOString()
            });
        }

        if (session) {
            const startTime = Number(session.start_time || memory?.startTime || endedAt);
            const totalDurationSeconds = startTime
                ? Math.max(0, Math.round((endedAt - startTime) / 1000))
                : null;

            await db.collection("sessions").updateOne(
                { _id: session._id },
                {
                    $set: {
                        active: false,
                        is_current: false,
                        end_time: endedAt,
                        ended_reason: "teacher",
                        accept_uploads_until: acceptUploadsUntil,
                        total_duration_seconds: totalDurationSeconds
                    }
                }
            );
        }

        if (memory) {
            activeSessions.set(code, {
                ...memory,
                active: false,
                acceptUploadsUntil,
                stopRequestedAt: endedAt
            });
        } else if (session) {
            activeSessions.set(code, {
                id: session._id,
                code,
                ownerId: teacher.id,
                active: false,
                interval: session.interval_ms || 30000,
                startTime: session.start_time || null,
                created_at: session.created_at || endedAt,
                persisted: true,
                mode: session.mode || "summary",
                groups: new Map(),
                acceptUploadsUntil,
                stopRequestedAt: endedAt
            });
        }

        await publishRealtimeEvent({
            sessionCode: code,
            event: REALTIME_EVENTS.STOP_RECORDING,
            audience: "all",
            payload: {}
        });
        await revokeSessionRealtimeMemberships(code);
        const terminalTimer = setTimeout(() => {
            void publishRealtimeEvent({
                sessionCode: code,
                event: REALTIME_EVENTS.SESSION_ENDED,
                audience: "all",
                payload: { reason: "teacher", endedAt }
            });
        }, FINAL_UPLOAD_GRACE_MS);
        terminalTimer.unref?.();

        const expiryTimer = sessionTimers.get(code);
        if (expiryTimer) {
            clearTimeout(expiryTimer);
            sessionTimers.delete(code);
        }

        res.json({ success: true, code, endedAt: new Date(endedAt).toISOString() });
    } catch (err) {
        console.error("❌ Failed to stop session:", err);
        sendRouteError(res, err, "Failed to stop session");
    }
});

/* Session prompt management endpoints */
router.post("/session/:code/prompt", express.json(), async (req, res) => {
    try {
        const teacher = await requireTeacher(req, res);
        if (!teacher) return;

        const { code } = req.params;
        const { prompt } = req.body;

        if (!prompt || !prompt.trim()) {
            return res.status(400).json({ error: "Prompt is required" });
        }

        // Get session ID
        let session = await db.collection("sessions").findOne({ code: code });
        if (!session) {
            // Session might not be persisted yet - create a placeholder record
            const mem = activeSessions.get(code);
            if (!mem) {
                return res.status(404).json({ error: "Session not found" });
            }

            session = await ensureSessionRecord({
                code,
                teacherId: teacher.id,
                mode: mem.mode || "summary",
                intervalMs: mem.interval || 30000,
                createdAt: mem.created_at || Date.now(),
                active: mem.active || false,
                startTime: mem.startTime || null
            });
            mem.ownerId = teacher.id;
            activeSessions.set(code, mem);
        } else if (session.owner_id !== teacher.id) {
            return res.status(403).json({ error: "Forbidden" });
        }

        // Save prompt for this session
        await db.collection("session_prompts").findOneAndUpdate(
            { session_id: session._id },
            { $set: { prompt: prompt.trim(), updated_at: Date.now() } },
            { upsert: true }
        );

        // Also cache the current prompt in memory so subsequent summaries use it immediately
        const mem = activeSessions.get(code);
        if (mem) {
            activeSessions.set(code, { ...mem, customPrompt: prompt.trim() });
        }

        res.json({ success: true, message: "Prompt saved successfully" });

    } catch (err) {
        console.error("❌ Failed to save prompt:", err);
        res.status(500).json({ error: "Failed to save prompt" });
    }
});

router.get("/session/:code/prompt", async (req, res) => {
    try {
        const teacher = await requireTeacher(req, res);
        if (!teacher) return;

        const { code } = req.params;

        // Get session ID
        const session = await db.collection("sessions").findOne({ code: code });
        if (!session) {
            return res.json({ prompt: null, message: "No custom prompt set for this session" });
        }

        if (session.owner_id !== teacher.id) {
            return res.status(403).json({ error: "Forbidden" });
        }

        // Get prompt for this session
        const promptData = await db.collection("session_prompts").findOne({ session_id: session._id });

        if (promptData) {
            res.json({
                prompt: promptData.prompt,
                updatedAt: promptData.updated_at
            });
        } else {
            res.json({ prompt: null });
        }

    } catch (err) {
        console.error("❌ Failed to get prompt:", err);
        res.status(500).json({ error: "Failed to get prompt" });
    }
});

router.get("/prompt-library", async (req, res) => {
    try {
        const teacher = await requireTeacher(req, res);
        if (!teacher) return;

        const prompts = (await listAllPrompts())
            .filter((prompt) => canTeacherViewPrompt(prompt, teacher))
            .map((prompt) => decoratePromptForTeacher(prompt, teacher));
        res.json(prompts);
    } catch (err) {
        console.error("❌ Failed to load prompt library:", err);
        res.status(500).json({ error: "Failed to load prompt library" });
    }
});

router.get("/prompts", async (req, res) => {
    try {
        const teacher = await requireTeacher(req, res);
        if (!teacher) return;

        const prompts = (await listAllPrompts())
            .filter((prompt) => canTeacherViewPrompt(prompt, teacher));
        const filteredPrompts = filterPrompts(prompts, {
            search: req.query.search,
            category: req.query.category,
            mode: req.query.mode
        });

        const limit = Math.max(Math.min(Number(req.query.limit) || 20, 100), 1);
        const offset = Math.max(Number(req.query.offset) || 0, 0);
        const page = filteredPrompts
            .slice(offset, offset + limit)
            .map((prompt) => decoratePromptForTeacher(prompt, teacher));
        const categories = [...new Set(prompts.map((prompt) => prompt.category).filter(Boolean))]
            .sort((left, right) => left.localeCompare(right));

        res.json({
            prompts: page,
            pagination: {
                total: filteredPrompts.length,
                offset,
                limit,
                hasMore: offset + page.length < filteredPrompts.length
            },
            filters: {
                categories
            }
        });
    } catch (err) {
        console.error("❌ Failed to list prompts:", err);
        res.status(500).json({ error: "Failed to list prompts" });
    }
});

router.post("/prompts", express.json(), async (req, res) => {
    try {
        const teacher = await requireTeacher(req, res);
        if (!teacher) return;
        if (!canTeacherCreatePrompt(teacher)) {
            return res.status(403).json({ error: "Guests cannot create prompts" });
        }

        const now = Date.now();
        const payload = {
            _id: uuid(),
            title: sanitizeShortText(req.body?.title, "", 160),
            description: sanitizeLongText(req.body?.description, "", 1000),
            content: sanitizeLongText(req.body?.content, "", 12_000),
            category: sanitizeShortText(req.body?.category, "General", 80),
            mode: req.body?.mode === "checkbox" ? "checkbox" : "summary",
            tags: Array.isArray(req.body?.tags)
                ? req.body.tags.slice(0, 20).map((tag) => sanitizeShortText(tag, "", 40)).filter(Boolean)
                : [],
            isPublic: req.body?.isPublic !== false,
            authorName: teacher.email,
            createdByUserId: teacher.id,
            createdByEmail: teacher.email,
            created_at: now,
            updated_at: now
        };

        if (!payload.title || !payload.content) {
            return res.status(400).json({ error: "Title and content are required" });
        }

        const created = await insertTeacherPrompt(payload);
        res.status(201).json(decoratePromptForTeacher(created.inserted, teacher));
    } catch (err) {
        console.error("❌ Failed to create prompt:", err);
        res.status(500).json({ error: "Failed to create prompt" });
    }
});

router.put("/prompts/:id", express.json(), async (req, res) => {
    try {
        const teacher = await requireTeacher(req, res);
        if (!teacher) return;

        const existingPrompt = normalizePromptRecord(await db.collection("teacher_prompts").findOne({ _id: req.params.id }));
        if (!existingPrompt) {
            return res.status(404).json({ error: "Prompt not found" });
        }
        if (!canTeacherManagePrompt(existingPrompt, teacher)) {
            return res.status(403).json({ error: "Forbidden" });
        }

        const updated = await db.collection("teacher_prompts").findOneAndUpdate(
            { _id: req.params.id },
            {
                $set: {
                    title: sanitizeShortText(req.body?.title, existingPrompt.title || "", 160),
                    description: sanitizeLongText(req.body?.description, existingPrompt.description || "", 1000),
                    content: sanitizeLongText(req.body?.content, existingPrompt.content || "", 12_000),
                    category: sanitizeShortText(req.body?.category, existingPrompt.category || "General", 80),
                    mode: req.body?.mode === "checkbox" || req.body?.mode === "summary"
                        ? req.body.mode
                        : existingPrompt.mode,
                    tags: Array.isArray(req.body?.tags)
                        ? req.body.tags.slice(0, 20).map((tag) => sanitizeShortText(tag, "", 40)).filter(Boolean)
                        : (existingPrompt.tags || []),
                    isPublic: typeof req.body?.isPublic === "boolean"
                        ? req.body.isPublic
                        : existingPrompt.isPublic,
                    authorName: String(existingPrompt.authorName || existingPrompt.createdByEmail || teacher.email || "Anonymous Teacher").trim(),
                    updated_at: Date.now()
                }
            },
            { upsert: false }
        );

        res.json(decoratePromptForTeacher(updated, teacher));
    } catch (err) {
        console.error("❌ Failed to update prompt:", err);
        res.status(500).json({ error: "Failed to update prompt" });
    }
});

router.delete("/prompts/:id", async (req, res) => {
    try {
        const teacher = await requireTeacher(req, res);
        if (!teacher) return;

        const existingPrompt = normalizePromptRecord(await db.collection("teacher_prompts").findOne({ _id: req.params.id }));
        if (!existingPrompt) {
            return res.status(404).json({ error: "Prompt not found" });
        }
        if (!canTeacherManagePrompt(existingPrompt, teacher)) {
            return res.status(403).json({ error: "Forbidden" });
        }

        const result = await db.collection("teacher_prompts").deleteOne({ _id: req.params.id });
        if (!result.deletedCount) {
            return res.status(404).json({ error: "Prompt not found" });
        }

        res.json({ success: true });
    } catch (err) {
        console.error("❌ Failed to delete prompt:", err);
        res.status(500).json({ error: "Failed to delete prompt" });
    }
});

router.post("/transcribe-chunk", aiUploadLimiter, upload.single('file'), async (req, res) => {
    try {
        const file = req.file;
        const joinToken = String(req.body?.joinToken || "").trim();
        const sessionCode = String(req.body?.sessionCode || "").trim().toUpperCase();
        const groupNumber = Number(req.body?.groupNumber);
        const requestedChunkId = String(req.body?.chunkId || "").trim();
        const chunkId = /^[a-zA-Z0-9_-]{16,100}$/.test(requestedChunkId) ? requestedChunkId : null;

        validateStudentUploadRequest({ file, joinToken, sessionCode, groupNumber });
        validateAudioUploadPayload(file);

        let authorizedSessionCode = sessionCode;
        if (joinToken) {
            authorizedSessionCode = verifyJoinToken(joinToken, {
                expectedSessionCode: sessionCode || undefined
            }).sessionCode;
        }
        await authorizeStudentGroupRequest(req, authorizedSessionCode, groupNumber);

        let session;
        let memory;
        let resolvedSessionCode;

        if (joinToken) {
            try {
                const resolved = await resolveJoinableSession(joinToken, {
                    allowUploadGrace: true
                });
                session = resolved.sessionRecord;
                memory = resolved.sessionState;
                resolvedSessionCode = resolved.sessionCode;
                if (!session) {
                    return res.status(404).json({ error: "Active session not found" });
                }
            } catch (error) {
                if (error?.status === 404 && /session not active/i.test(error.message || "")) {
                    return res.json({
                        success: true,
                        skipped: true,
                        reason: "Session not active"
                    });
                }
                throw error;
            }
        } else {
            session = await db.collection("sessions").findOne({ code: sessionCode });
            memory = activeSessions.get(sessionCode);
            resolvedSessionCode = sessionCode;

            if (!session && !memory) {
                return res.status(404).json({ error: "Active session not found" });
            }

            const canAcceptUpload = Boolean(
                session?.active ||
                memory?.active ||
                (Number.isFinite(Number(session?.accept_uploads_until)) && Number(session.accept_uploads_until) >= Date.now()) ||
                (Number.isFinite(Number(memory?.acceptUploadsUntil)) && Number(memory.acceptUploadsUntil) >= Date.now())
            );

            if (!canAcceptUpload) {
                return res.json({
                    success: true,
                    skipped: true,
                    reason: "Session not active"
                });
            }
        }

        const sessionMode = session.mode || memory?.mode || "summary";
        const group = await ensureGroupRecord(session._id, groupNumber);
        const existingTranscriptBundle = await getTranscriptBundle(session._id, group._id);
        if (chunkId && hasTranscriptSegment(existingTranscriptBundle.segments, chunkId)) {
            return res.json({ success: true, duplicate: true, chunkId });
        }
        const transcription = await transcribe(file.buffer, file.mimetype);
        const { text, duration } = extractTranscriptMetrics(transcription);

        if (!text || isIgnorableTranscriptionText(text)) {
            return res.json({ success: true, skipped: true, reason: "No speech detected", chunkId });
        }

        const cleanedText = await cleanTranscriptChunk(text, {
            previousSegments: existingTranscriptBundle.segments
        });
        const finalTranscriptText = cleanedText || text;
        const wordCount = countTranscriptWords(finalTranscriptText);

        const now = Date.now();
        const transcriptRecord = createTranscriptRecord({
            id: chunkId || uuid(),
            sessionId: session._id,
            groupId: group._id,
            text: finalTranscriptText,
            wordCount,
            durationSeconds: duration,
            createdAt: now,
            segmentNumber: Math.floor(now / 30000),
            isNoise: false
        });

        const { segments, stats } = await appendTranscriptSegment({
            sessionId: session._id,
            groupId: group._id,
            segment: transcriptRecord.segment
        });


        if (sessionMode === "checkbox") {
            const checkboxSession = await db.collection("checkbox_sessions").findOne({ session_id: session._id });
            let criteriaRecords = normalizeCriteriaRecords(memory?.checkbox?.criteria || []);

            if (criteriaRecords.length === 0) {
                const dbCriteria = await db.collection("checkbox_criteria")
                    .find({ session_id: session._id })
                    .sort({ order_index: 1, created_at: 1 })
                    .toArray();
                criteriaRecords = normalizeCriteriaRecords(dbCriteria);
            }

            if (criteriaRecords.length === 0) {
                const checkboxUpdate = {
                    group: groupNumber,
                    latestTranscript: finalTranscriptText,
                    checkboxes: [],
                    stats: {
                        totalSegments: stats.total_segments,
                        totalWords: stats.total_words,
                        totalDuration: stats.total_duration,
                        lastUpdate: stats.last_update || new Date(now).toISOString()
                    },
                    isActive: true,
                    isReleased: false
                };
                await publishRealtimeEvent({
                    sessionCode: resolvedSessionCode,
                    groupNumber,
                    event: REALTIME_EVENTS.CHECKBOX_UPDATE,
                    audience: "session",
                    payload: checkboxUpdate
                });

                return res.json({
                    success: true,
                    mode: sessionMode,
                    transcript: finalTranscriptText,
                    skipped: true,
                    reason: "No checkbox criteria configured yet"
                });
            }

            const strictness = session.strictness || memory?.checkbox?.strictness || 2;
            const progressDoc = await ensureGroupProgressDoc(session._id, groupNumber, criteriaRecords);
            const progressMap = progressDoc?.progress || {};
            const existingProgress = extractExistingProgress(criteriaRecords, progressMap);
            const aiCriteria = criteriaRecords.map((criterion, index) => ({
                originalIndex: typeof criterion.originalIndex === "number" ? criterion.originalIndex : index,
                description: criterion.description,
                rubric: criterion.rubric
            }));

            const result = await processCheckboxTranscript(
                finalTranscriptText,
                aiCriteria,
                checkboxSession?.scenario || memory?.checkbox?.scenario || "",
                strictness,
                existingProgress
            );

            await db.collection("session_logs").insertOne({
                _id: uuid(),
                session_id: session._id,
                type: "checkbox_analysis",
                content: finalTranscriptText,
                ai_response: result,
                created_at: now
            });

            const progressUpdates = [];
            let progressChanged = false;

            for (const match of result.matches) {
                const criterion = criteriaRecords[match.criteria_index];
                if (!criterion) continue;

                const criterionKey = String(criterion._id);
                const currentEntry = progressMap[criterionKey];
                const { updated, entry } = applyMatchToProgressEntry(currentEntry, match.status, match.quote, now);

                if (updated) {
                    progressMap[criterionKey] = entry;
                    progressChanged = true;
                    progressUpdates.push({
                        criteriaId: match.criteria_index,
                        criteriaDbId: criterion._id,
                        description: criterion.description,
                        completed: entry.completed,
                        quote: entry.quote,
                        status: entry.status
                    });
                }
            }

            if (progressChanged) {
                await db.collection("checkbox_progress").findOneAndUpdate(
                    { session_id: session._id, group_number: groupNumber },
                    {
                        $set: {
                            session_id: session._id,
                            group_number: groupNumber,
                            progress: progressMap,
                            created_at: progressDoc?.created_at ?? now,
                            updated_at: now
                        }
                    },
                    { upsert: true }
                );
            }

            const isReleased = Boolean(checkboxSession?.released_groups?.[groupNumber]);
            const checkboxes = buildChecklistCriteria(criteriaRecords, progressMap);
            const checklistData = {
                groupNumber,
                criteria: checkboxes,
                scenario: checkboxSession?.scenario || memory?.checkbox?.scenario || "",
                timestamp: now,
                isReleased,
                sessionCode: resolvedSessionCode
            };

            const checkboxUpdate = {
                group: groupNumber,
                latestTranscript: finalTranscriptText,
                checkboxUpdates: progressUpdates,
                checkboxes,
                stats: {
                    totalSegments: stats.total_segments,
                    totalWords: stats.total_words,
                    totalDuration: stats.total_duration,
                    lastUpdate: stats.last_update || new Date(now).toISOString()
                },
                isActive: true,
                isReleased
            };
            await publishRealtimeEvent({
                sessionCode: resolvedSessionCode,
                groupNumber,
                event: REALTIME_EVENTS.CHECKBOX_UPDATE,
                audience: "session",
                payload: checkboxUpdate
            });
            await publishRealtimeEvent({
                sessionCode: resolvedSessionCode,
                groupNumber,
                event: REALTIME_EVENTS.CHECKLIST_STATE,
                audience: "both",
                payload: checklistData
            });
            return res.json({
                success: true,
                mode: sessionMode,
                transcript: finalTranscriptText,
                matches: result.matches.length
            });
        }

        const fullText = segments.map((segment) => segment.text).join(" ");
        let customPrompt = memory?.customPrompt || null;
        if (!customPrompt) {
            const promptData = await db.collection("session_prompts").findOne({ session_id: session._id });
            customPrompt = promptData?.prompt || null;
        }

        const summary = await summarise(fullText, customPrompt);
        await db.collection("summaries").findOneAndUpdate(
            { group_id: group._id },
            { $set: createSummaryUpdateFields({ sessionId: session._id, text: summary, timestamp: now }) },
            { upsert: true }
        );
        await persistSummarySnapshot({
            sessionId: session._id,
            groupId: group._id,
            segments,
            summaryText: summary,
            timestamp: now
        });

        const summaryReleased = await isSummaryReleased({
            sessionCode: resolvedSessionCode,
            sessionId: session._id,
            groupNumber
        });

        const transcriptionAndSummary = {
            transcription: {
                text: finalTranscriptText,
                words: transcription.words,
                duration,
                wordCount
            },
            summary: summaryReleased ? summary : null,
            isReleased: summaryReleased,
            isLatestSegment: true
        };
        await publishRealtimeEvent({
            sessionCode: resolvedSessionCode,
            groupNumber,
            event: REALTIME_EVENTS.TRANSCRIPTION_AND_SUMMARY,
            audience: "group",
            payload: transcriptionAndSummary
        });
        const adminUpdate = {
            group: groupNumber,
            isActive: true,
            latestTranscript: finalTranscriptText,
            cumulativeTranscript: fullText,
            transcriptDuration: duration,
            transcriptWordCount: wordCount,
            summary,
            summaryReleased,
            stats: {
                totalSegments: stats.total_segments,
                totalWords: stats.total_words,
                totalDuration: stats.total_duration,
                lastUpdate: stats.last_update || new Date(now).toISOString()
            }
        };
        await publishRealtimeEvent({
            sessionCode: resolvedSessionCode,
            groupNumber,
            event: REALTIME_EVENTS.ADMIN_UPDATE,
            audience: "session",
            payload: adminUpdate
        });

        res.json({
            success: true,
            mode: sessionMode,
            transcript: finalTranscriptText,
            summary
        });
    } catch (err) {
        console.error("❌ Failed to transcribe uploaded chunk:", err);
        sendRouteError(res, err, "Failed to transcribe chunk");
    }
});

/* Cleanup session data */
router.post("/cleanup/:sessionCode", async (req, res) => {
    try {
        const teacher = await requireTeacher(req, res);
        if (!teacher) return;
        const { sessionCode } = req.params;
        const { session } = await getOwnedSessionContext(sessionCode, teacher.id);

        if (!session) {
            return res.json({
                success: true,
                message: `No persisted session data found for ${sessionCode}`
            });
        }

        await cleanupOldSessionData(sessionCode);
        res.json({ success: true, message: `Session ${sessionCode} cleaned up` });
    } catch (err) {
        console.error(`❌ Cleanup API error:`, err);
        sendRouteError(res, err, "Cleanup failed");
    }
});

/* Create checkbox session */
router.post("/checkbox/session", express.json(), async (req, res) => {
    try {
        const teacher = await requireTeacher(req, res);
        if (!teacher) return;
        const sessionCode = String(req.body?.sessionCode || "").trim().toUpperCase();
        const criteria = Array.isArray(req.body?.criteria) ? req.body.criteria : [];
        const scenario = String(req.body?.scenario || "").trim();
        const interval = normalizeIntervalMs(req.body?.interval);
        const strictness = Number(req.body?.strictness) || 2;

        const invalidCriteria = criteria.length === 0 || criteria.length > 50 || criteria.some((criterion) => {
            const description = String(criterion?.description || "").trim();
            const rubric = String(criterion?.rubric || "").trim();
            const weight = criterion?.weight == null ? 1 : Number(criterion.weight);
            return !description || description.length > 500 || rubric.length > 1000
                || !Number.isFinite(weight) || weight <= 0 || weight > 100;
        });
        if (!/^[A-Z0-9]{6}$/.test(sessionCode) || invalidCriteria || scenario.length > 4000 || strictness < 1 || strictness > 3) {
            return res.status(400).json({ error: "Session code and criteria required" });
        }

        // Check if session already exists
        let session = await db.collection("sessions").findOne({ code: sessionCode });

        // Clean up any old data for this session to ensure fresh start
        if (session) {
            await getOwnedSessionContext(sessionCode, teacher.id);
            await cleanupOldSessionData(sessionCode);
        }

        // Create or update session
        if (!session) {
            session = {
                _id: uuid(),
                owner_id: teacher.id,
                code: sessionCode,
                mode: "checkbox",
                active: false,
                interval_ms: interval || 30000,
                strictness: strictness,
                created_at: Date.now()
            };
            await db.collection("sessions").insertOne(session);
        } else {
            await db.collection("sessions").updateOne(
                { _id: session._id },
                {
                    $set: {
                        owner_id: teacher.id,
                        mode: "checkbox",
                        active: false,
                        interval_ms: interval || 30000,
                        strictness: strictness,
                        updated_at: Date.now()
                    }
                }
            );
        }

        // Create checkbox session record with scenario
        await db.collection("checkbox_sessions").findOneAndUpdate(
            { session_id: session._id },
            {
                $set: {
                    scenario: scenario,
                    created_at: Date.now()
                }
            },
            { upsert: true }
        );

        // Add criteria
        await db.collection("checkbox_criteria").deleteMany({ session_id: session._id });
        await db.collection("checkbox_progress").deleteMany({ session_id: session._id });

        const criteriaIds = [];
        const memCriteria = [];
        for (let index = 0; index < criteria.length; index++) {
            const criterion = criteria[index];
            const criterionId = uuid();
            const description = String(criterion.description).trim();
            const rubric = String(criterion.rubric || '').trim();
            const weight = Number.isFinite(Number(criterion.weight)) ? Number(criterion.weight) : 1;
            await db.collection("checkbox_criteria").insertOne({
                _id: criterionId,
                session_id: session._id,
                description,
                rubric,
                weight,
                order_index: index,
                created_at: Date.now()
            });
            criteriaIds.push(criterionId);
            memCriteria.push({
                _id: criterionId,
                description,
                rubric,
                order_index: index
            });
        }

        // Add to/update active sessions
        const existingMem = activeSessions.get(sessionCode) || {};
        activeSessions.set(sessionCode, {
            id: session._id,
            code: sessionCode,
            mode: "checkbox",
            ownerId: teacher.id,
            active: false,
            interval: interval,
            startTime: null,
            created_at: existingMem.created_at || Date.now(),
            persisted: true,
            checkbox: {
                scenario: scenario || "",
                criteria: memCriteria,
                strictness
            }
        });

        res.json({
            success: true,
            sessionId: session._id,
            criteriaIds,
            message: "Checkbox session created successfully"
        });

    } catch (err) {
        console.error("❌ Failed to create checkbox session:", err);
        sendRouteError(res, err, "Failed to create checkbox session");
    }
});

/* Get checkbox data */
router.get("/checkbox/:sessionCode", async (req, res) => {
    try {
        const teacher = await requireTeacher(req, res);
        if (!teacher) return;
        const { sessionCode } = req.params;

        // Get session info
        const session = await db.collection("sessions").findOne({ code: sessionCode, mode: "checkbox" });
        if (!session) {
            const pendingSession = activeSessions.get(sessionCode);
            if (pendingSession && pendingSession.ownerId === teacher.id) {
                return res.json({
                    success: false,
                    sessionCode,
                    scenario: "",
                    criteriaWithProgress: [],
                    releasedGroups: {},
                    message: "Checkbox session exists in memory but has not been configured yet."
                });
            }
            return res.status(404).json({ error: "Checkbox session not found" });
        }
        if (session.owner_id !== teacher.id) {
            return res.status(403).json({ error: "Forbidden" });
        }

        // Get checkbox session data
        const checkboxSession = await db.collection("checkbox_sessions").findOne({ session_id: session._id });

        // Get criteria
        const criteria = await db.collection("checkbox_criteria")
            .find({ session_id: session._id })
            .sort({ order_index: 1, created_at: 1 })
            .toArray();

        const normalizedCriteria = normalizeCriteriaRecords(criteria);
        const originalCriteriaById = new Map(criteria.map((item) => [item._id, item]));

        // Get aggregated progress per group
        const progressDocs = await db.collection("checkbox_progress")
            .find({ session_id: session._id })
            .toArray();

        const criteriaWithProgress = normalizedCriteria.map((criterion, index) => {
            const groupProgress = {};
            progressDocs.forEach(doc => {
                const groupNum = doc.group_number;
                const entry = doc.progress?.[String(criterion._id)];
                if (entry) {
                    groupProgress[groupNum] = {
                        status: entry.status || 'grey',
                        completed: entry.completed === true || entry.status === 'green',
                        quote: entry.quote || null,
                        history: entry.history || []
                    };
                }
            });

            return {
                id: index,
                dbId: criterion._id,
                description: criterion.description,
                rubric: criterion.rubric || '',
                weight: criterion.weight || 1,
                groupProgress
            };
        });

        res.json({
            success: true,
            sessionCode,
            scenario: checkboxSession?.scenario || "",
            criteriaWithProgress,
            releasedGroups: checkboxSession?.released_groups || {}
        });

    } catch (err) {
        console.error("❌ Failed to fetch checkbox data:", err);
        res.status(500).json({ error: "Failed to fetch checkbox data" });
    }
});

router.get("/history/sessions", async (req, res) => {
    try {
        const teacher = await requireTeacher(req, res);
        if (!teacher) return;

        const result = await listHistorySessions({
            teacher,
            mode: typeof req.query.mode === "string" ? req.query.mode : "",
            owner: typeof req.query.owner === "string" ? req.query.owner : "",
            offset: req.query.offset,
            limit: req.query.limit
        });

        res.json(result);
    } catch (err) {
        console.error("❌ Failed to list history sessions:", err);
        res.status(err.status || 500).json({ error: err.status === 403 ? "Forbidden" : "Failed to load history sessions" });
    }
});

router.get("/history/sessions/:code", async (req, res) => {
    try {
        const teacher = await requireTeacher(req, res);
        if (!teacher) return;

        const session = await getHistorySessionOrThrow(teacher, req.params.code);
        const detail = await buildHistorySessionDetail(session);
        res.json(detail);
    } catch (err) {
        console.error("❌ Failed to load history session detail:", err);
        res.status(err.status || 500).json({ error: err.status === 403 ? "Forbidden" : err.message || "Failed to load session detail" });
    }
});

router.get("/history/sessions/:code/export/combined", async (req, res) => {
    try {
        const teacher = await requireTeacher(req, res);
        if (!teacher) return;

        const session = await getHistorySessionOrThrow(teacher, req.params.code);
        const payload = await buildCombinedHistoryExport(session);
        sendJsonDownload(res, `session-${session.code}-combined.json`, payload);
    } catch (err) {
        console.error("❌ Failed to export combined history:", err);
        res.status(err.status || 500).json({ error: err.status === 403 ? "Forbidden" : err.message || "Failed to export history" });
    }
});

router.get("/history/sessions/:code/export/segments", async (req, res) => {
    try {
        const teacher = await requireTeacher(req, res);
        if (!teacher) return;

        const session = await getHistorySessionOrThrow(teacher, req.params.code);
        const payload = await buildSegmentsHistoryExport(session);
        sendJsonDownload(res, `session-${session.code}-segments.json`, payload);
    } catch (err) {
        console.error("❌ Failed to export segment history:", err);
        res.status(err.status || 500).json({ error: err.status === 403 ? "Forbidden" : err.message || "Failed to export segments" });
    }
});

export default router;
