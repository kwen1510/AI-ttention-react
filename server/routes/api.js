import express from "express";
import { randomInt } from "crypto";
import { v4 as uuid } from "uuid";
import { upload } from "../middleware/upload.js";
import { optionalTeacherContext, requireTeacher } from "../middleware/auth.js";
import { aiLimiter } from "../middleware/rateLimit.js";
import { createSupabaseDb } from "../db/db.js";
import { transcribe } from "../services/elevenlabs.js";
import { summarise } from "../services/openai.js";
import {
    assertJoinableSessionState,
    buildJoinUrl,
    createJoinToken,
    getJoinTokenTtlSeconds,
    verifyJoinToken
} from "../services/joinTokens.js";
import { activeSessions, latestChecklistState } from "../services/state.js";
import {
    appendTranscriptSegment,
    createSummaryUpdateFields,
    createTranscriptRecord,
    persistSummarySnapshot
} from "../services/transcript.js";
import {
    processMindmapTranscript,
    generateMindmapExamples,
    updateMindmapManually,
    generatePlaygroundExamples,
    generatePlaygroundPoint,
    generateContextualPoint,
    askMindmapQuestion
} from "../services/mindmap.js";
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
    getOwnedSessionOrThrow,
    listOwnedHistorySessions
} from "../services/history.js";

const router = express.Router();
const db = createSupabaseDb();
const SESSION_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

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

function normalizeIntervalMs(value, fallback = 30000) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 5000) {
        return fallback;
    }
    return parsed;
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

function resolveAppOrigin(req) {
    return process.env.APP_PUBLIC_ORIGIN || `${req.protocol}://${req.get("host")}`;
}

export function validateStudentUploadRequest({ file, joinToken, sessionCode, groupNumber }) {
    const normalizedSessionCode = String(sessionCode || "").trim().toUpperCase();
    if (!file || (!joinToken && !normalizedSessionCode) || !Number.isFinite(groupNumber) || groupNumber <= 0) {
        throw createHttpError("Missing file, session code, or group number", 400);
    }
}

async function resolveJoinableSession(joinToken) {
    const payload = verifyJoinToken(joinToken);
    const sessionCode = payload.sessionCode;
    const session = await db.collection("sessions").findOne({ code: sessionCode });
    const sessionState = activeSessions.get(sessionCode);
    return {
        payload,
        ...assertJoinableSessionState(sessionCode, sessionState, session)
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

async function listAllPrompts() {
    const prompts = await db.collection("teacher_prompts")
        .find({})
        .sort({ updated_at: -1, created_at: -1 })
        .toArray();

    return prompts.map((prompt) => ({
        ...prompt,
        tags: Array.isArray(prompt.tags) ? prompt.tags : []
    }));
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
            ...(Array.isArray(prompt.tags) ? prompt.tags : [])
        ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();

        return haystack.includes(normalizedSearch);
    });
}

router.get("/auth/me", async (req, res) => {
    const teacher = await requireTeacher(req, res);
    if (!teacher) return;

    res.json({
        teacher: true,
        user: {
            id: teacher.id,
            email: teacher.email,
            role: teacher.role || teacher.teacherAccess?.role || "teacher"
        }
    });
});

/* Test transcription API endpoint */
router.post("/test-transcription", aiLimiter, upload.single('audio'), async (req, res) => {
    try {
        const teacher = await requireTeacher(req, res);
        if (!teacher) return;
        if (!req.file) {
            return res.status(400).json({ error: "No audio file provided" });
        }

        const audioBuffer = req.file.buffer;

        // Test the transcription function
        const startTime = Date.now();
        const transcription = await transcribe(audioBuffer);
        const endTime = Date.now();

        const debug = {
            fileSize: audioBuffer.length,
            mimeType: req.file.mimetype,
            processingTime: `${endTime - startTime}ms`,
            timestamp: new Date().toISOString()
        };

        res.json({
            success: true,
            transcription,
            debug
        });

    } catch (err) {
        console.error("❌ Test transcription error:", err);
        res.status(500).json({
            error: "Transcription failed",
            details: err.message,
            stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
        });
    }
});

/* Test summary API endpoint */
router.post("/test-summary", aiLimiter, express.json(), async (req, res) => {
    try {
        const teacher = await requireTeacher(req, res);
        if (!teacher) return;
        const { text, customPrompt } = req.body;
        if (!text) {
            return res.status(400).json({ error: "No text provided for summarization" });
        }

        // Test the summary function with custom prompt
        const startTime = Date.now();
        const summary = await summarise(text, customPrompt);
        const endTime = Date.now();

        const debug = {
            textLength: text.length,
            processingTime: `${endTime - startTime}ms`,
            timestamp: new Date().toISOString(),
            promptUsed: customPrompt || "default"
        };

        res.json({
            success: true,
            summary,
            debug
        });

    } catch (err) {
        console.error("❌ Test summary error:", err);
        res.status(500).json({
            error: "Summary failed",
            details: err.message,
            stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
        });
    }
});

router.get("/new-session", async (req, res) => {
    try {
        const teacher = await requireTeacher(req, res);
        if (!teacher) return;

        const mode = req.query.mode === "checkbox" ? "checkbox" : "summary";
        const code = await generateUniqueSessionCode();
        const createdAt = Date.now();

        activeSessions.set(code, {
            code,
            ownerId: teacher.id,
            active: false,
            interval: 30000,
            startTime: null,
            created_at: createdAt,
            persisted: false,
            mode,
            groups: new Map()
        });

        res.json({
            code,
            mode,
            interval: 30000
        });
    } catch (err) {
        console.error("❌ Failed to create session:", err);
        res.status(err.status || 500).json({ error: err.message || "Failed to create session" });
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
        res.status(err.status || 500).json({ error: err.message || "Failed to create join token" });
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

        let persistedSession = session;
        if (!persistedSession) {
            const inserted = await db.collection("sessions").insertOne({
                _id: uuid(),
                owner_id: teacher.id,
                code,
                mode: requestedMode,
                active: true,
                interval_ms: intervalMs,
                created_at: createdAt,
                start_time: startTime,
                end_time: null,
                total_duration_seconds: null
            });
            persistedSession = inserted.inserted;
        } else {
            await db.collection("sessions").updateOne(
                { _id: persistedSession._id },
                {
                    $set: {
                        owner_id: teacher.id,
                        mode: requestedMode,
                        active: true,
                        interval_ms: intervalMs,
                        start_time: persistedSession.start_time || startTime,
                        end_time: null
                    }
                }
            );
            persistedSession = await db.collection("sessions").findOne({ _id: persistedSession._id });
        }

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
            checkbox: memory?.checkbox
        });

        const io = req.app.get("io");
        io?.to(code).emit("record_now", intervalMs);

        res.json({
            success: true,
            code,
            mode: requestedMode,
            interval: intervalMs
        });
    } catch (err) {
        console.error("❌ Failed to start session:", err);
        res.status(err.status || 500).json({ error: err.message || "Failed to start session" });
    }
});

router.post("/session/:code/stop", async (req, res) => {
    try {
        const teacher = await requireTeacher(req, res);
        if (!teacher) return;

        const { code } = req.params;
        const { session, memory } = await getOwnedSessionContext(code, teacher.id);
        const endedAt = Date.now();

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
                        end_time: endedAt,
                        total_duration_seconds: totalDurationSeconds
                    }
                }
            );
        }

        if (memory) {
            activeSessions.set(code, {
                ...memory,
                active: false
            });
        }

        const io = req.app.get("io");
        io?.to(code).emit("stop_recording");

        res.json({ success: true, code });
    } catch (err) {
        console.error("❌ Failed to stop session:", err);
        res.status(err.status || 500).json({ error: err.message || "Failed to stop session" });
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

            const newId = uuid();
            await db.collection("sessions").insertOne({
                _id: newId,
                owner_id: teacher.id,
                code: code,
                mode: mem.mode || "summary",
                interval_ms: mem.interval || 30000,
                created_at: mem.created_at || Date.now(),
                active: mem.active || false,
                start_time: mem.startTime || null,
                end_time: null,
                total_duration_seconds: null
            });
            session = { _id: newId, owner_id: teacher.id };
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

        const prompts = await listAllPrompts();
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

        const prompts = await listAllPrompts();
        const filteredPrompts = filterPrompts(prompts, {
            search: req.query.search,
            category: req.query.category,
            mode: req.query.mode
        });

        const limit = Math.max(Math.min(Number(req.query.limit) || 20, 100), 1);
        const offset = Math.max(Number(req.query.offset) || 0, 0);
        const page = filteredPrompts.slice(offset, offset + limit);
        const categories = [...new Set(prompts.map((prompt) => prompt.category).filter(Boolean))].sort();

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

        const now = Date.now();
        const payload = {
            _id: uuid(),
            title: String(req.body?.title || "").trim(),
            description: String(req.body?.description || "").trim(),
            content: String(req.body?.content || "").trim(),
            category: String(req.body?.category || "General").trim() || "General",
            mode: req.body?.mode === "checkbox" ? "checkbox" : "summary",
            tags: Array.isArray(req.body?.tags) ? req.body.tags.filter(Boolean) : [],
            isPublic: req.body?.isPublic !== false,
            authorName: String(req.body?.authorName || teacher.email || "Anonymous Teacher").trim(),
            created_at: now,
            updated_at: now,
            views: 0,
            last_viewed: null,
            usage_count: 0,
            last_used: null
        };

        if (!payload.title || !payload.content) {
            return res.status(400).json({ error: "Title and content are required" });
        }

        const created = await db.collection("teacher_prompts").insertOne(payload);
        res.status(201).json(created.inserted);
    } catch (err) {
        console.error("❌ Failed to create prompt:", err);
        res.status(500).json({ error: "Failed to create prompt" });
    }
});

router.put("/prompts/:id", express.json(), async (req, res) => {
    try {
        const teacher = await requireTeacher(req, res);
        if (!teacher) return;

        const existing = await db.collection("teacher_prompts").findOne({ _id: req.params.id });
        if (!existing) {
            return res.status(404).json({ error: "Prompt not found" });
        }

        const updated = await db.collection("teacher_prompts").findOneAndUpdate(
            { _id: req.params.id },
            {
                $set: {
                    title: String(req.body?.title || existing.title || "").trim(),
                    description: String(req.body?.description || existing.description || "").trim(),
                    content: String(req.body?.content || existing.content || "").trim(),
                    category: String(req.body?.category || existing.category || "General").trim() || "General",
                    mode: req.body?.mode === "checkbox" ? "checkbox" : "summary",
                    tags: Array.isArray(req.body?.tags) ? req.body.tags.filter(Boolean) : (existing.tags || []),
                    isPublic: req.body?.isPublic !== false,
                    authorName: String(req.body?.authorName || existing.authorName || teacher.email || "Anonymous Teacher").trim(),
                    updated_at: Date.now()
                }
            },
            { upsert: false }
        );

        res.json(updated);
    } catch (err) {
        console.error("❌ Failed to update prompt:", err);
        res.status(500).json({ error: "Failed to update prompt" });
    }
});

router.delete("/prompts/:id", async (req, res) => {
    try {
        const teacher = await requireTeacher(req, res);
        if (!teacher) return;

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

router.post("/prompts/:id/clone", express.json(), async (req, res) => {
    try {
        const teacher = await requireTeacher(req, res);
        if (!teacher) return;

        const source = await db.collection("teacher_prompts").findOne({ _id: req.params.id });
        if (!source) {
            return res.status(404).json({ error: "Prompt not found" });
        }

        const now = Date.now();
        const cloned = {
            ...source,
            _id: uuid(),
            title: `${source.title} (Copy)`,
            authorName: String(req.body?.authorName || teacher.email || "Anonymous Teacher").trim(),
            created_at: now,
            updated_at: now,
            views: 0,
            last_viewed: null,
            usage_count: 0,
            last_used: null
        };

        const inserted = await db.collection("teacher_prompts").insertOne(cloned);
        res.status(201).json(inserted.inserted);
    } catch (err) {
        console.error("❌ Failed to clone prompt:", err);
        res.status(500).json({ error: "Failed to clone prompt" });
    }
});

router.post("/prompts/:id/use", express.json(), async (req, res) => {
    try {
        const teacher = await requireTeacher(req, res);
        if (!teacher) return;

        const prompt = await db.collection("teacher_prompts").findOne({ _id: req.params.id });
        if (!prompt) {
            return res.status(404).json({ error: "Prompt not found" });
        }

        const updated = await db.collection("teacher_prompts").findOneAndUpdate(
            { _id: req.params.id },
            {
                $set: {
                    usage_count: Number(prompt.usage_count || 0) + 1,
                    last_used: Date.now(),
                    updated_at: Date.now()
                }
            },
            { upsert: false }
        );

        res.json({ success: true, prompt: updated });
    } catch (err) {
        console.error("❌ Failed to record prompt usage:", err);
        res.status(500).json({ error: "Failed to record prompt usage" });
    }
});

router.post("/transcribe-chunk", aiLimiter, upload.single('file'), async (req, res) => {
    try {
        const file = req.file;
        const joinToken = String(req.body?.joinToken || "").trim();
        const sessionCode = String(req.body?.sessionCode || "").trim().toUpperCase();
        const groupNumber = Number(req.body?.groupNumber);

        validateStudentUploadRequest({ file, joinToken, sessionCode, groupNumber });

        let session;
        let memory;
        let resolvedSessionCode;

        if (joinToken) {
            try {
                const resolved = await resolveJoinableSession(joinToken);
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

            if (!(session?.active || memory?.active)) {
                return res.json({
                    success: true,
                    skipped: true,
                    reason: "Session not active"
                });
            }
        }

        const sessionMode = session.mode || memory?.mode || "summary";
        const group = await ensureGroupRecord(session._id, groupNumber);
        const transcription = await transcribe(file.buffer, file.mimetype);
        const { text, wordCount, duration } = extractTranscriptMetrics(transcription);

        const ignoredTranscriptions = new Set([
            "No audio data available",
            "Audio too short for transcription",
            "Invalid WebM container - only complete containers are supported",
            "Transcription temporarily unavailable",
            "No transcription available",
            "Transcription failed"
        ]);

        if (!text || ignoredTranscriptions.has(text)) {
            return res.json({ success: true, skipped: true });
        }

        const now = Date.now();
        const transcriptRecord = createTranscriptRecord({
            id: uuid(),
            sessionId: session._id,
            groupId: group._id,
            text,
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

        const io = req.app.get("io");

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
                io?.to(sessionCode).emit("checkbox_update", {
                    group: groupNumber,
                    latestTranscript: text,
                    checkboxes: [],
                    stats: {
                        totalSegments: stats.total_segments,
                        totalWords: stats.total_words,
                        totalDuration: stats.total_duration,
                        lastUpdate: stats.last_update || new Date(now).toISOString()
                    },
                    isActive: true,
                    isReleased: false
                });

                return res.json({
                    success: true,
                    mode: sessionMode,
                    transcript: text,
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
                text,
                aiCriteria,
                checkboxSession?.scenario || memory?.checkbox?.scenario || "",
                strictness,
                existingProgress
            );

            await db.collection("session_logs").insertOne({
                _id: uuid(),
                session_id: session._id,
                type: "checkbox_analysis",
                content: text,
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

            io?.to(resolvedSessionCode).emit("checkbox_update", {
                group: groupNumber,
                latestTranscript: text,
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
            });
            io?.to(resolvedSessionCode).emit("checklist_state", checklistData);
            io?.to(`${resolvedSessionCode}-${groupNumber}`).emit("checklist_state", checklistData);
            latestChecklistState.set(`${resolvedSessionCode}-${groupNumber}`, checklistData);

            return res.json({
                success: true,
                mode: sessionMode,
                transcript: text,
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

        io?.to(`${resolvedSessionCode}-${groupNumber}`).emit("transcription_and_summary", {
            transcription: {
                text,
                words: transcription.words,
                duration,
                wordCount
            },
            summary,
            isLatestSegment: true
        });
        io?.to(resolvedSessionCode).emit("admin_update", {
            group: groupNumber,
            latestTranscript: text,
            cumulativeTranscript: fullText,
            transcriptDuration: duration,
            transcriptWordCount: wordCount,
            summary,
            stats: {
                totalSegments: stats.total_segments,
                totalWords: stats.total_words,
                totalDuration: stats.total_duration,
                lastUpdate: stats.last_update || new Date(now).toISOString()
            }
        });

        res.json({
            success: true,
            mode: sessionMode,
            transcript: text,
            summary
        });
    } catch (err) {
        console.error("❌ Failed to transcribe uploaded chunk:", err);
        res.status(err.status || 500).json({ error: err.message || "Failed to transcribe chunk" });
    }
});

/* Mindmap transcription endpoint */
router.post("/transcribe-mindmap-chunk", aiLimiter, upload.single('file'), async (req, res) => {
    try {
        const teacher = await requireTeacher(req, res);
        if (!teacher) return;
        const { sessionCode } = req.body;
        const file = req.file;

        if (!file || !sessionCode) {
            return res.status(400).json({
                success: false,
                error: 'Missing file or session code'
            });
        }

        const session = await db.collection("sessions").findOne({ code: sessionCode });
        if (!session) {
            return res.status(404).json({ success: false, error: "Session not found" });
        }
        if (session.owner_id !== teacher.id) {
            return res.status(403).json({ success: false, error: "Forbidden" });
        }

        const result = await processMindmapTranscript(sessionCode, file.buffer, file.mimetype);
        res.json(result);

    } catch (err) {
        console.error("❌ Mindmap chunk transcription error:", err);
        res.status(500).json({
            error: "Internal server error during transcription",
            details: err.message,
            success: false
        });
    }
});

/* Mindmap manual update endpoint */
router.post("/mindmap/manual-update", aiLimiter, express.json(), async (req, res) => {
    try {
        const teacher = await requireTeacher(req, res);
        if (!teacher) return;
        const { sessionCode, reason, metadata } = req.body;
        if (!sessionCode) {
            return res.status(400).json({ error: "Session code is required" });
        }

        const session = await db.collection("sessions").findOne({ code: sessionCode });
        if (!session) {
            return res.status(404).json({ error: "Session not found" });
        }
        if (session.owner_id !== teacher.id) {
            return res.status(403).json({ error: "Forbidden" });
        }

        const updatedMindmap = await updateMindmapManually(sessionCode, reason, metadata);
        res.json({ success: true, data: updatedMindmap });

    } catch (err) {
        console.error("❌ Failed to sync manual mindmap update:", err);
        res.status(500).json({ error: err.message || "Failed to sync mindmap update" });
    }
});

/* Mindmap examples endpoint */
router.post("/mindmap/examples", aiLimiter, express.json(), async (req, res) => {
    try {
        const teacher = await requireTeacher(req, res);
        if (!teacher) return;
        const { topic, nodeLabel, siblingIdeas, childIdeas } = req.body || {};
        if (!nodeLabel) {
            return res.status(400).json({ error: 'nodeLabel is required' });
        }

        const result = await generateMindmapExamples(topic, nodeLabel, siblingIdeas, childIdeas);
        res.json(result);

    } catch (error) {
        console.error('❌ OpenAI mindmap example generation failed:', error);
        res.status(500).json({ error: 'Failed to generate examples' });
    }
});

/* Playground examples endpoint */
router.post("/generate-examples", aiLimiter, express.json(), async (req, res) => {
    try {
        const teacher = await requireTeacher(req, res);
        if (!teacher) return;
        const { topic, count, strand } = req.body || {};
        if (!topic) {
            return res.status(400).json({ error: 'Topic is required' });
        }

        const examples = await generatePlaygroundExamples(topic, count, strand);
        res.json(examples);

    } catch (error) {
        console.error('❌ OpenAI example generation failed:', error);
        res.status(500).json({ error: 'Failed to generate examples' });
    }
});

/* Playground point endpoint */
router.post("/generate-point", aiLimiter, express.json(), async (req, res) => {
    try {
        const teacher = await requireTeacher(req, res);
        if (!teacher) return;
        const { topic } = req.body;
        if (!topic) {
            return res.status(400).json({ error: 'Topic is required' });
        }

        const point = await generatePlaygroundPoint(topic);
        res.json(point);

    } catch (error) {
        console.error('❌ OpenAI point generation failed:', error);
        res.status(500).json({ error: 'Failed to generate point' });
    }
});

/* Contextual point endpoint */
router.post("/generate-contextual-point", aiLimiter, express.json(), async (req, res) => {
    try {
        const teacher = await requireTeacher(req, res);
        if (!teacher) return;
        const { graphData, selectedNode } = req.body;
        if (!graphData || !selectedNode) {
            return res.status(400).json({ error: 'Graph data and selected node are required' });
        }

        const point = await generateContextualPoint(graphData, selectedNode);
        res.json(point);

    } catch (error) {
        console.error('❌ OpenAI contextual point generation failed:', error);
        res.status(500).json({ error: 'Failed to generate contextual point' });
    }
});

/* Ask question endpoint */
router.post("/ask-question", aiLimiter, express.json(), async (req, res) => {
    try {
        const teacher = await requireTeacher(req, res);
        if (!teacher) return;
        const { question, graphData, selectedNode, strandPath } = req.body;
        if (!question || !graphData || !selectedNode) {
            return res.status(400).json({ error: 'Question, graph data, and selected node are required' });
        }

        const nodes = await askMindmapQuestion(question, graphData, selectedNode, strandPath);
        res.json({ nodes });

    } catch (error) {
        console.error('❌ OpenAI question answering failed:', error);
        res.status(500).json({ error: 'Failed to answer question' });
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
        res.status(err.status || 500).json({ error: err.message || "Cleanup failed" });
    }
});

/* Create checkbox session */
router.post("/checkbox/session", express.json(), async (req, res) => {
    try {
        const teacher = await requireTeacher(req, res);
        if (!teacher) return;
        const { sessionCode, criteria, scenario, interval, strictness = 2 } = req.body;

        if (!sessionCode || !criteria || criteria.length === 0) {
            return res.status(400).json({ error: "Session code and criteria required" });
        }

        // Check if session already exists
        let session = await db.collection("sessions").findOne({ code: sessionCode });

        // Clean up any old data for this session to ensure fresh start
        if (session) {
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
            await db.collection("checkbox_criteria").insertOne({
                _id: criterionId,
                session_id: session._id,
                description: criterion.description,
                rubric: criterion.rubric || '',
                weight: criterion.weight || 1,
                order_index: index,
                created_at: Date.now()
            });
            criteriaIds.push(criterionId);
            memCriteria.push({
                _id: criterionId,
                description: criterion.description,
                rubric: criterion.rubric || '',
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
        res.status(500).json({ error: "Failed to create checkbox session" });
    }
});

/* Process transcript for checkbox */
router.post("/checkbox/process", express.json(), async (req, res) => {
    try {
        const teacher = await requireTeacher(req, res);
        if (!teacher) return;
        const { sessionCode, transcript, groupNumber = 1, criteria: clientCriteria, scenario: clientScenario } = req.body;

        if (!sessionCode || !transcript) {
            return res.status(400).json({ error: "Session code and transcript required" });
        }

        // Get session info
        const session = await db.collection("sessions").findOne({ code: sessionCode, mode: "checkbox" });
        if (!session) {
            return res.status(404).json({ error: "Checkbox session not found" });
        }
        if (session.owner_id !== teacher.id) {
            return res.status(403).json({ error: "Forbidden" });
        }

        // Prefer client-provided or in-memory scenario/criteria for speed
        const mem = activeSessions.get(sessionCode);
        const strictness = session.strictness || 2;
        let scenario = clientScenario ?? mem?.checkbox?.scenario ?? "";
        const candidateCriteria = clientCriteria ?? mem?.checkbox?.criteria ?? [];
        let criteriaRecords = normalizeCriteriaRecords(candidateCriteria);

        if (criteriaRecords.length === 0) {
            const dbCriteria = await db.collection("checkbox_criteria")
                .find({ session_id: session._id })
                .sort({ order_index: 1, created_at: 1 })
                .toArray();
            criteriaRecords = normalizeCriteriaRecords(dbCriteria);
        }

        if (!scenario) {
            const checkboxSession = await db.collection("checkbox_sessions").findOne({ session_id: session._id });
            scenario = checkboxSession?.scenario || "";
        }

        if (criteriaRecords.length === 0) {
            return res.status(400).json({ error: "No criteria found for session" });
        }

        const aiCriteria = criteriaRecords.map((criterion, index) => ({
            originalIndex: typeof criterion.originalIndex === 'number' ? criterion.originalIndex : index,
            description: criterion.description,
            rubric: criterion.rubric
        }));

        const progressDoc = await ensureGroupProgressDoc(session._id, groupNumber, criteriaRecords);
        const progressMap = progressDoc?.progress || {};
        if (progressDoc && !progressDoc.progress) {
            progressDoc.progress = progressMap;
        }
        const existingProgress = extractExistingProgress(criteriaRecords, progressMap);

        // Process the transcript
        const result = await processCheckboxTranscript(transcript, aiCriteria, scenario, strictness, existingProgress);

        // Log the processing result
        await db.collection("session_logs").insertOne({
            _id: uuid(),
            session_id: session._id,
            type: "checkbox_analysis",
            content: transcript,
            ai_response: result,
            created_at: Date.now()
        });

        // Update progress for matched criteria
        const progressUpdates = [];
        const now = Date.now();
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
            if (progressDoc) {
                progressDoc.progress = progressMap;
                progressDoc.updated_at = now;
            }
        }

        // Send checkbox updates to admin via Socket.IO
        const io = req.app.get('io');
        if (io) {
            io.to(sessionCode).emit("admin_update", {
                group: groupNumber,
                latestTranscript: transcript,
                checkboxUpdates: progressUpdates,
                isActive: true
            });

            // Emit full checklist state
            const checkboxSessionData = await db.collection("checkbox_sessions").findOne({ session_id: session._id });
            const isReleased = checkboxSessionData?.released_groups?.[groupNumber] || false;

            const checklistData = {
                groupNumber: groupNumber,
                criteria: buildChecklistCriteria(criteriaRecords, progressMap),
                scenario: checkboxSessionData?.scenario ?? scenario ?? "",
                timestamp: Date.now(),
                isReleased: isReleased,
                sessionCode: sessionCode
            };

            io.to(sessionCode).emit('checklist_state', checklistData);
            io.to(`${sessionCode}-${groupNumber}`).emit('checklist_state', checklistData);
            latestChecklistState.set(`${sessionCode}-${groupNumber}`, checklistData);
        }

        res.json({
            success: true,
            matches: result.matches.length,
            reason: result.reason,
            progressUpdates: progressUpdates
        });

    } catch (err) {
        console.error("❌ Failed to process checkbox transcript:", err);
        res.status(500).json({ error: "Failed to process transcript" });
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

        const result = await listOwnedHistorySessions({
            teacherId: teacher.id,
            mode: typeof req.query.mode === "string" ? req.query.mode : "",
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

        const session = await getOwnedSessionOrThrow(teacher.id, req.params.code);
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

        const session = await getOwnedSessionOrThrow(teacher.id, req.params.code);
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

        const session = await getOwnedSessionOrThrow(teacher.id, req.params.code);
        const payload = await buildSegmentsHistoryExport(session);
        sendJsonDownload(res, `session-${session.code}-segments.json`, payload);
    } catch (err) {
        console.error("❌ Failed to export segment history:", err);
        res.status(err.status || 500).json({ error: err.status === 403 ? "Forbidden" : err.message || "Failed to export segments" });
    }
});

/* Test mode detection endpoint */
router.post("/checkbox/test", aiLimiter, express.json(), async (req, res) => {
    try {
        const teacher = await requireTeacher(req, res);
        if (!teacher) return;
        const { sessionCode, transcript } = req.body;

        // Get session info
        const session = await db.collection("sessions").findOne({ code: sessionCode });
        if (!session) {
            return res.status(404).json({ error: "Session not found" });
        }
        if (session.owner_id !== teacher.id) {
            return res.status(403).json({ error: "Forbidden" });
        }

        // Get criteria
        const criteria = await db.collection("checkbox_criteria")
            .find({ session_id: session._id })
            .sort({ order_index: 1, created_at: 1 })
            .toArray();

        if (criteria.length === 0) {
            return res.status(400).json({ error: "No criteria found for session" });
        }

        // Get scenario
        const checkboxSession = await db.collection("checkbox_sessions").findOne({ session_id: session._id });
        const scenario = checkboxSession?.scenario || "";

        // Process with AI
        const result = await processCheckboxTranscript(transcript, criteria, scenario);

        res.json(result);
    } catch (err) {
        console.error('🧪 TEST MODE ERROR:', err);
        res.status(500).json({ error: err.message, matches: [], reason: "Test mode error" });
    }
});

export default router;
