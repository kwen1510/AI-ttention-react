import { v4 as uuid } from "uuid";
import { db } from "../db/db.js";
import {
    authenticateTeacherFromToken,
    createStagingBypassTeacherPrincipal,
    isStagingAuthBypassEnabled
} from "../middleware/auth.js";
import { verifyJoinToken } from "./joinTokens.js";
import { activeSessions, latestChecklistState } from "./state.js";
import { transcribe, extractMime, isIgnorableTranscriptionText } from "./elevenlabs.js";
import { cleanTranscriptChunk, summarise } from "./openai.js";
import {
    countTranscriptWords,
    createTranscriptRecord,
    appendTranscriptSegment,
    createSummaryUpdateFields,
    getTranscriptBundle,
    persistSummarySnapshot
} from "./transcript.js";

// Auto-summary management
export const activeSummaryTimers = new Map();
const processingGroups = new Set();

function isUniqueViolation(error) {
    return String(error?.code || "") === "23505" || /duplicate key/i.test(String(error?.message || ""));
}

function createSocketPrincipalError(message, status = 401) {
    const error = new Error(message);
    error.status = status;
    return error;
}

export async function authenticateSocketPrincipal(auth = {}) {
    const socketType =
        auth.type ||
        (auth.joinToken ? "student" : null) ||
        (auth.token || auth.accessToken ? "teacher" : "student");

    if (socketType === "student") {
        if (!auth.joinToken) {
            return {
                kind: "student",
                sessionCode: null,
                tokenPayload: null
            };
        }

        const payload = verifyJoinToken(auth.joinToken);
        return {
            kind: "student",
            sessionCode: payload.sessionCode,
            tokenPayload: payload
        };
    }

    const teacherToken = auth.token || auth.accessToken;
    if (auth.stagingBypass && isStagingAuthBypassEnabled()) {
        return {
            kind: "teacher",
            user: await createStagingBypassTeacherPrincipal()
        };
    }

    if (!teacherToken) {
        throw createSocketPrincipalError("Unauthorized", 401);
    }

    const teacher = await authenticateTeacherFromToken(teacherToken);
    return {
        kind: "teacher",
        user: teacher
    };
}

export function requireTeacherPrincipal(principal) {
    if (principal?.kind !== "teacher") {
        throw createSocketPrincipalError("Forbidden", 403);
    }

    return principal.user;
}

export function requireStudentPrincipal(principal) {
    if (principal?.kind !== "student") {
        throw createSocketPrincipalError("Forbidden", 403);
    }

    return principal;
}

export function ensureTeacherOwnsSessionPrincipal(principal, code, sessionState, sessionRecord = null) {
    const teacher = requireTeacherPrincipal(principal);
    const normalizedCode = String(code || "").trim().toUpperCase();

    if (!normalizedCode) {
        throw createSocketPrincipalError("Session not found", 404);
    }

    if (sessionState?.ownerId === teacher.id) {
        return { teacher, session: null, sessionState, code: normalizedCode };
    }

    if (!sessionRecord) {
        throw createSocketPrincipalError("Session not found", 404);
    }

    if (sessionRecord.owner_id !== teacher.id) {
        throw createSocketPrincipalError("Forbidden", 403);
    }

    return {
        teacher,
        session: sessionRecord,
        sessionState: sessionState || null,
        code: normalizedCode
    };
}

export function startAutoSummary(sessionCode, intervalMs) {
    // Clear any existing timer for this session
    stopAutoSummary(sessionCode);

    const timer = setInterval(async () => {
        // console.log(`⏰ Auto-generating summaries for session ${sessionCode}`);

        // Check if session is still active (both in memory and database)
        const sessionState = activeSessions.get(sessionCode);
        const session = await db.collection("sessions").findOne({ code: sessionCode, active: true });

        if (!session || !sessionState?.active) {
            // console.log(`⚠️  Session ${sessionCode} no longer active, stopping auto-summary`);
            stopAutoSummary(sessionCode);
            return;
        }

        const groups = await db.collection("groups").find({ session_id: session._id }).sort({ number: 1 }).toArray();
        // console.log(`🔄 Processing summaries for ${groups.length} groups in session ${sessionCode}`);

        for (const group of groups) {
            await generateSummaryForGroup(sessionCode, group.number);
        }
    }, intervalMs); // Use the same interval as recording instead of fixed 10 seconds

    activeSummaryTimers.set(sessionCode, timer);
    // console.log(`⏰ Started auto-summary timer for session ${sessionCode} (every ${intervalMs}ms)`);
}

export function stopAutoSummary(sessionCode) {
    const timer = activeSummaryTimers.get(sessionCode);
    if (timer) {
        clearInterval(timer);
        activeSummaryTimers.delete(sessionCode);
        // console.log(`⏰ Stopped auto-summary timer for session ${sessionCode}`);
    }
}

// We need a reference to 'io' for generateSummaryForGroup. 
// We'll store it when initSocket is called.
let ioInstance = null;

async function generateSummaryForGroup(sessionCode, groupNumber) {
    if (!ioInstance) return;

    const groupKey = `${sessionCode}-${groupNumber}`;

    // Prevent overlapping processing for the same group
    if (processingGroups.has(groupKey)) {
        // console.log(`⏳ Group ${groupNumber} already being processed, skipping`);
        return;
    }

    processingGroups.add(groupKey);

    try {
        // console.log(`📋 Processing group ${groupNumber} in session ${sessionCode}`);

        // Find sockets in this group and get their audio data
        const roomName = `${sessionCode}-${groupNumber}`;
        const socketsInRoom = await ioInstance.in(roomName).fetchSockets();

        if (socketsInRoom.length === 0) {
            // console.log(`ℹ️  No active sockets in group ${groupNumber}, skipping`);
            return;
        }

        // Collect audio from all sockets in this group
        let hasAudio = false;
        let combinedAudio = [];

        for (const socket of socketsInRoom) {
            if (socket.localBuf && socket.localBuf.length > 0) {
                // For WebM containers, we should have at most one complete container per socket
                // For other formats, we might have multiple chunks
                const audioChunks = socket.localBuf.filter(chunk => chunk.data.length > 20000); // Guardrail: only process substantial chunks

                if (audioChunks.length > 0) {
                    // For WebM, we need to handle both complete containers and partial chunks
                    const baseMime = extractMime(audioChunks[0].format);
                    if (baseMime === 'audio/webm') {
                        // First, look for a complete WebM container
                        const completeContainer = audioChunks.find(chunk => {
                            const header = chunk.data.slice(0, 4).toString('hex');
                            return header === '1a45dfa3' && !chunk.isPartial;
                        });

                        if (completeContainer) {
                            // console.log(`✅ Found complete WebM container (${completeContainer.data.length} bytes) from socket ${socket.id}`);
                            combinedAudio.push(completeContainer);
                            hasAudio = true;
                        } else {
                            // Don't try to combine partial chunks - they create corrupted WebM data
                            // Instead, just skip this processing cycle and wait for a complete container
                            // console.log(`⏭️  No complete WebM container found, skipping processing (${audioChunks.length} partial chunks available)`);
                            // console.log(`💡 Waiting for complete WebM container with header 1a45dfa3...`);
                        }
                    } else {
                        // For other formats, add all substantial chunks
                        combinedAudio.push(...audioChunks);
                        hasAudio = true;
                    }
                }

                socket.localBuf.length = 0; // Clear buffer after processing
            }
        }

        if (!hasAudio) {
            // console.log(`ℹ️  No substantial audio data available for group ${groupNumber}, skipping`);
            return;
        }

        // Process each blob individually instead of concatenating
        for (const audioChunk of combinedAudio) {
            // console.log(`🔄 Processing ${audioChunk.data.length} bytes of audio data for group ${groupNumber}`);

            // Validate audio before sending to API
            if (audioChunk.data.length < 1000) {
                // console.log(`⚠️  Audio too small (${audioChunk.data.length} bytes), skipping`);
                continue;
            }

            // Check if audio has valid headers for common formats
            const header = audioChunk.data.slice(0, 4).toString('hex');
            const validHeaders = {
                '1a45dfa3': 'WebM',
                '52494646': 'WAV/RIFF',
                '00000020': 'MP4',
                '4f676753': 'OGG'
            };

            if (validHeaders[header]) {
                // console.log(`✅ Valid ${validHeaders[header]} header detected: ${header}`);
            } else {
                // console.log(`⚠️  Unknown audio header: ${header}, proceeding anyway`);
                // Log the first few bytes for debugging
                const firstBytes = audioChunk.data.slice(0, 8).toString('hex');
                // console.log(`🔍 First 8 bytes: ${firstBytes}`);
            }

            // Get transcription for this individual audio chunk
            // console.log("🗣️  Starting transcription for current chunk...");
            // console.log(`🎵 Audio format: ${audioChunk.format}`);

            const transcription = await transcribe(audioChunk.data, audioChunk.format);

            // Only proceed if we have valid transcription
            let cleanedText = transcription.text;
            if (transcription.text && !isIgnorableTranscriptionText(transcription.text)) {
                // Save this individual transcription segment
                const session = await db.collection("sessions").findOne({ code: sessionCode });
                const group = await db.collection("groups").findOne({ session_id: session._id, number: parseInt(groupNumber) });

                if (group) {
                    const existingTranscriptBundle = await getTranscriptBundle(session._id, group._id);
                    cleanedText = await cleanTranscriptChunk(transcription.text, {
                        previousSegments: existingTranscriptBundle.segments
                    });

                    // Save the transcription segment
                    const now = Date.now();
                    const transcriptId = uuid();

                    // Calculate word count and duration with fallbacks
                    const wordCount = countTranscriptWords(cleanedText);

                    const duration = transcription.words && transcription.words.length > 0 ?
                        transcription.words[transcription.words.length - 1].end :
                        Math.max(10, Math.min(30, cleanedText.length * 0.05)); // Estimate 0.05 seconds per character

                    const transcriptRecord = createTranscriptRecord({
                        id: transcriptId,
                        sessionId: session._id,
                        groupId: group._id,
                        text: cleanedText,
                        wordCount,
                        durationSeconds: duration,
                        createdAt: now,
                        segmentNumber: Math.floor(now / 30000),
                        isNoise: false
                    });

                    const { segments, stats } = await appendTranscriptSegment({
                        sessionId: transcriptRecord.sessionId,
                        groupId: transcriptRecord.groupId,
                        segment: transcriptRecord.segment
                    });

                    // Combine all transcripts for summary (but only transcribe current chunk)
                    const fullText = segments.map(t => t.text).join(' ');

                    // Generate summary of the entire conversation so far
                    // console.log("🤖 Generating summary of full conversation...");

                    // Get custom prompt for this session
                    // Resolve the latest prompt: prefer memory cache (if admin changed it mid-session), fall back to DB
                    let customPrompt = activeSessions.get(sessionCode)?.customPrompt || null;
                    if (!customPrompt && session) {
                        const promptData = await db.collection("session_prompts").findOne({ session_id: session._id });
                        customPrompt = promptData?.prompt || null;
                    }

                    const summary = await summarise(fullText, customPrompt);

                    // Save/update the summary
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

                    // Send both new transcription and updated summary to clients
                    ioInstance.to(roomName).emit("transcription_and_summary", {
                        transcription: {
                            text: cleanedText,
                            words: transcription.words,
                            duration: duration,
                            wordCount: wordCount
                        },
                        summary,
                        isLatestSegment: true
                    });

                    // Send update to admin console
                    ioInstance.to(sessionCode).emit("admin_update", {
                        group: groupNumber,
                        isActive: true,
                        latestTranscript: cleanedText,
                        cumulativeTranscript: fullText, // Add full conversation for admin
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

                    // console.log(`✅ Results saved and sent for session ${sessionCode}, group ${groupNumber}`);
                }
            } else {
                // console.log(`⚠️  No valid transcription for group ${groupNumber}`);
            }
        }

    } catch (err) {
        console.error(`❌ Error processing group ${groupNumber}:`, err);
    } finally {
        processingGroups.delete(groupKey);
    }
}

function createSocketConnectError(message, status = 401) {
    const error = new Error(message);
    error.data = { status };
    return error;
}

export function initSocket(io) {
    ioInstance = io;

    io.use(async (socket, next) => {
        try {
            socket.data.principal = await authenticateSocketPrincipal(socket.handshake?.auth || {});
            next();
        } catch (error) {
            const status = Number.isInteger(error?.status) ? error.status : 401;
            next(createSocketConnectError(status === 403 ? "Forbidden" : error.message || "Unauthorized", status));
        }
    });

    io.on("connection", socket => {
        console.log(`🔌 New socket connection: ${socket.id}`);
        let groupId;
        let localBuf = [];
        let sessionCode;
        let groupNumber;

        socket.localBuf = localBuf;

        function ts() {
            return new Date().toISOString();
        }

        function getTeacherPrincipal() {
            try {
                return requireTeacherPrincipal(socket.data?.principal);
            } catch (error) {
                socket.emit("error", "Forbidden");
                return null;
            }
        }

        function getStudentPrincipal() {
            try {
                return requireStudentPrincipal(socket.data?.principal);
            } catch (error) {
                socket.emit("error", "Forbidden");
                return null;
            }
        }

        async function ensureTeacherOwnsSession(code) {
            const normalizedCode = String(code || "").trim().toUpperCase();
            if (!normalizedCode) {
                socket.emit("error", "Session not found");
                return null;
            }

            const sessionState = activeSessions.get(normalizedCode);
            try {
                return ensureTeacherOwnsSessionPrincipal(socket.data?.principal, normalizedCode, sessionState, null);
            } catch (error) {
                if (error?.status && error.status !== 404) {
                    socket.emit("error", error.message);
                    return null;
                }
            }

            try {
                const session = await db.collection("sessions").findOne({ code: normalizedCode });
                return ensureTeacherOwnsSessionPrincipal(socket.data?.principal, normalizedCode, sessionState, session);
            } catch (error) {
                socket.emit("error", error.message);
                return null;
            }
        }

        async function resolveStudentJoinContext(requestedCode) {
            const principal = getStudentPrincipal();
            if (!principal) {
                return null;
            }

            const normalizedCode = String(principal.sessionCode || requestedCode || "").trim().toUpperCase();
            if (!normalizedCode) {
                socket.emit("error", "Session not found");
                return null;
            }

            let sessionState = activeSessions.get(normalizedCode);
            let session = null;

            if (!sessionState || sessionState.persisted) {
                session = await db.collection("sessions").findOne({ code: normalizedCode });
            }

            if (!sessionState && !session) {
                socket.emit("error", "Session not found");
                return null;
            }

            if (!sessionState && session) {
                sessionState = {
                    id: session._id,
                    code: normalizedCode,
                    ownerId: session.owner_id,
                    active: Boolean(session.active),
                    interval: session.interval_ms || 30000,
                    startTime: session.start_time || null,
                    created_at: session.created_at || Date.now(),
                    persisted: true,
                    mode: session.mode || "summary",
                    groups: new Map()
                };
                activeSessions.set(normalizedCode, sessionState);
            }

            return {
                principal,
                code: normalizedCode,
                session,
                sessionState
            };
        }

        socket.on("prompt_update", async data => {
            try {
                const { sessionCode: code, prompt } = data || {};
                if (!code || typeof prompt !== "string") return;
                const access = await ensureTeacherOwnsSession(code);
                if (!access) return;
                const mem = activeSessions.get(access.code);
                if (mem) {
                    activeSessions.set(access.code, { ...mem, customPrompt: prompt });
                }
            } catch (error) {
                console.warn("⚠️ prompt_update handling error:", error.message);
            }
        });

        socket.on("admin_join", async ({ code }) => {
            try {
                const access = await ensureTeacherOwnsSession(code);
                if (!access) return;
                socket.join(access.code);
            } catch (error) {
                console.error("❌ Error admin joining session room:", error);
            }
        });

        socket.on("join", async ({ code: requestedCode, group }) => {
            try {
                const parsedGroup = Number.parseInt(group, 10);
                if (!Number.isFinite(parsedGroup) || parsedGroup <= 0) {
                    socket.emit("error", "Invalid group number");
                    return;
                }

                const joinContext = await resolveStudentJoinContext(requestedCode);
                if (!joinContext) {
                    return;
                }

                const { code: resolvedCode, session, sessionState } = joinContext;
                sessionCode = resolvedCode;
                groupNumber = parsedGroup;

                if (sessionState?.persisted || session) {
                    const sessionRecord = session || await db.collection("sessions").findOne({ code: resolvedCode });
                    if (!sessionRecord) {
                        socket.emit("error", "Session data inconsistent");
                        return;
                    }

                    let existing = await db.collection("groups").findOne({
                        session_id: sessionRecord._id,
                        number: parsedGroup
                    });
                    groupId = existing?._id ?? uuid();

                    if (!existing) {
                        try {
                            await db.collection("groups").insertOne({
                                _id: groupId,
                                session_id: sessionRecord._id,
                                number: parsedGroup
                            });
                        } catch (error) {
                            if (!isUniqueViolation(error)) {
                                throw error;
                            }

                            existing = await db.collection("groups").findOne({
                                session_id: sessionRecord._id,
                                number: parsedGroup
                            });

                            if (!existing) {
                                throw error;
                            }

                            groupId = existing._id;
                        }
                    }
                } else {
                    groupId = uuid();
                }

                socket.join(resolvedCode);
                socket.join(`${resolvedCode}-${parsedGroup}`);

                const mem = activeSessions.get(resolvedCode) || {
                    code: resolvedCode,
                    active: Boolean(sessionState?.active),
                    interval: sessionState?.interval || 30000,
                    mode: sessionState?.mode || "summary",
                    groups: new Map()
                };
                if (!mem.groups) mem.groups = new Map();
                mem.groups.set(parsedGroup, {
                    joined: true,
                    recording: false,
                    lastAck: Date.now()
                });
                activeSessions.set(resolvedCode, mem);

                if (mem.active) {
                    socket.emit("joined", {
                        code: resolvedCode,
                        group: parsedGroup,
                        status: "recording",
                        interval: mem.interval || 30000,
                        mode: mem.mode || "summary"
                    });
                    io.to(`${resolvedCode}-${parsedGroup}`).emit("record_now", mem.interval || 30000);
                } else {
                    socket.emit("joined", {
                        code: resolvedCode,
                        group: parsedGroup,
                        status: "waiting",
                        interval: mem.interval || 30000,
                        mode: mem.mode || "summary"
                    });
                }
                socket.to(resolvedCode).emit("student_joined", { group: parsedGroup, socketId: socket.id });
                console.log(`[${ts()}] 📢 Notified admin about student joining group ${parsedGroup}`);
            } catch (error) {
                console.error("❌ Error joining session:", error);
                socket.emit("error", `Failed to join session: ${error.message}`);
            }
        });

        socket.on("student:chunk", () => {
            getStudentPrincipal();
        });

        socket.on("heartbeat", ({ session, group }) => {
            const principal = getStudentPrincipal();
            if (!principal) return;
            const sessionKey = String(principal.sessionCode || session || sessionCode || "").trim().toUpperCase();
            if (!sessionKey) return;
            const parsedGroup = Number.parseInt(group, 10);
            if (!Number.isFinite(parsedGroup) || parsedGroup <= 0) return;

            console.log(`[${ts()}] 💓 Heartbeat from session ${sessionKey}, group ${parsedGroup} (socket: ${socket.id})`);
            socket.emit("heartbeat_ack");

            const mem = activeSessions.get(sessionKey);
            if (!mem) return;

            if (!mem.groups) mem.groups = new Map();
            const state = mem.groups.get(parsedGroup) || {};
            state.joined = true;
            state.lastAck = Date.now();
            if (mem.active) state.recording = true;
            mem.groups.set(parsedGroup, state);
            activeSessions.set(sessionKey, mem);
        });

        socket.on("recording_started", ({ session, group }) => {
            try {
                const principal = getStudentPrincipal();
                if (!principal) return;
                const sessionKey = String(principal.sessionCode || session || sessionCode || "").trim().toUpperCase();
                if (!sessionKey) return;

                const parsedGroup = Number.parseInt(group, 10);
                if (!Number.isFinite(parsedGroup) || parsedGroup <= 0) return;

                const mem = activeSessions.get(sessionKey);
                if (!mem) return;

                if (!mem.groups) mem.groups = new Map();
                const state = mem.groups.get(parsedGroup) || {};
                state.joined = true;
                state.recording = true;
                state.lastAck = Date.now();
                mem.groups.set(parsedGroup, state);
                activeSessions.set(sessionKey, mem);
                console.log(`✅ recording_started ack from group ${parsedGroup} (session ${sessionKey})`);
            } catch (error) {
                console.warn("⚠️ recording_started handler error:", error.message);
            }
        });

        socket.on("admin_heartbeat", async ({ sessionCode: code }) => {
            const access = await ensureTeacherOwnsSession(code);
            if (!access) return;
            console.log(`[${ts()}] 💓 Admin heartbeat from session ${access.code} (socket: ${socket.id})`);
            socket.emit("admin_heartbeat_ack");
        });

        socket.on("dev_simulate_disconnect", async ({ sessionCode: code, target = "all", group = 1, durationMs = 5000 }) => {
            if (process.env.NODE_ENV === "production" || !process.env.ALLOW_DEV_TEST) {
                return;
            }

            const access = await ensureTeacherOwnsSession(code);
            if (!access) return;

            try {
                const payload = { durationMs: Number(durationMs) || 5000 };
                if (target === "all") {
                    io.to(access.code).emit("dev_simulate_disconnect", payload);
                } else {
                    io.to(`${access.code}-${Number.parseInt(group, 10)}`).emit("dev_simulate_disconnect", payload);
                }
            } catch (error) {
                console.warn("⚠️ dev_simulate_disconnect error:", error.message);
            }
        });

        socket.on("upload_error", ({ session, group, error, chunkSize, timestamp }) => {
            const principal = getStudentPrincipal();
            if (!principal) return;
            const sessionKey = String(principal.sessionCode || session || sessionCode || "").trim().toUpperCase();
            if (!sessionKey) return;

            const parsedGroup = Number.parseInt(group, 10);
            if (!Number.isFinite(parsedGroup) || parsedGroup <= 0) return;

            socket.to(sessionKey).emit("upload_error", {
                group: parsedGroup,
                error,
                chunkSize,
                timestamp,
                socketId: socket.id
            });
        });

        socket.on("upload_status", ({ session, group, phase, pendingUploads = 0, chunkSize = 0, lastUploadedAt = null, lastError = null, timestamp }) => {
            const principal = getStudentPrincipal();
            if (!principal) return;
            const sessionKey = String(principal.sessionCode || session || sessionCode || "").trim().toUpperCase();
            if (!sessionKey) return;

            const parsedGroup = Number.parseInt(group, 10);
            if (!Number.isFinite(parsedGroup) || parsedGroup <= 0) return;

            const sessionState = activeSessions.get(sessionKey);
            if (sessionState?.groups) {
                const groupState = sessionState.groups.get(parsedGroup) || {};
                groupState.joined = true;
                groupState.lastAck = Date.now();
                groupState.uploadStatus = {
                    phase: String(phase || "idle"),
                    pendingUploads: Number(pendingUploads) || 0,
                    chunkSize: Number(chunkSize) || 0,
                    lastUploadedAt: lastUploadedAt || null,
                    lastError: lastError || null
                };
                sessionState.groups.set(parsedGroup, groupState);
                activeSessions.set(sessionKey, sessionState);
            }

            socket.to(sessionKey).emit("upload_status", {
                group: parsedGroup,
                phase: String(phase || "idle"),
                pendingUploads: Number(pendingUploads) || 0,
                chunkSize: Number(chunkSize) || 0,
                lastUploadedAt: lastUploadedAt || null,
                lastError: lastError || null,
                timestamp: timestamp || Date.now(),
                socketId: socket.id
            });
        });

        socket.on("disconnect", () => {
            if (sessionCode && groupNumber) {
                console.log(`[${ts()}] 🔌 Socket ${socket.id} disconnected from session ${sessionCode}, group ${groupNumber}`);
                socket.to(sessionCode).emit("student_left", { group: groupNumber, socketId: socket.id });

                const sessionState = activeSessions.get(sessionCode);
                if (sessionState?.groups) {
                    sessionState.groups.delete(Number.parseInt(groupNumber, 10));
                    if (sessionState.groups.size === 0 && !sessionState.active && !sessionState.persisted) {
                        activeSessions.delete(sessionCode);
                    }
                }

                processingGroups.delete(`${sessionCode}-${groupNumber}`);
            }

            if (socket.localBuf) {
                socket.localBuf.length = 0;
                socket.localBuf = null;
            }
        });

        socket.on("get_my_rooms", async () => {
            if (process.env.NODE_ENV === "production" || !process.env.ALLOW_DEV_TEST) {
                return;
            }

            const teacher = getTeacherPrincipal();
            if (!teacher) return;

            socket.emit("room_info", {
                socketId: socket.id,
                teacherId: teacher.id,
                rooms: Array.from(socket.rooms)
            });
        });

        socket.on("release_checklist", async (data) => {
            try {
                const access = await ensureTeacherOwnsSession(data?.sessionCode);
                if (!access) return;

                const normalizedCode = access.code;
                const parsedGroupNumber = Number(data.groupNumber ?? data.group);
                if (!Number.isFinite(parsedGroupNumber) || parsedGroupNumber <= 0) {
                    console.error(`❌ Invalid group number received for release_checklist: ${data.groupNumber ?? data.group}`);
                    return;
                }

                const cacheKey = `${normalizedCode}-${parsedGroupNumber}`;
                const cached = latestChecklistState.get(cacheKey);
                const session = access.session || await db.collection("sessions").findOne({ code: normalizedCode });
                if (!session) {
                    console.error(`❌ Session ${normalizedCode} not found in database`);
                    return;
                }

                const existingCheckboxSession = await db.collection("checkbox_sessions").findOne({ session_id: session._id });
                const nowTs = Date.now();
                const updatedCheckboxSession = {
                    ...(existingCheckboxSession || {}),
                    session_id: session._id,
                    scenario: existingCheckboxSession?.scenario ?? data.scenario ?? "",
                    released_groups: {
                        ...(existingCheckboxSession?.released_groups || {}),
                        [parsedGroupNumber]: true
                    },
                    release_timestamps: {
                        ...(existingCheckboxSession?.release_timestamps || {}),
                        [parsedGroupNumber]: nowTs
                    },
                    updated_at: nowTs
                };

                await db.collection("checkbox_sessions").findOneAndUpdate(
                    { session_id: session._id },
                    { $set: updatedCheckboxSession },
                    { upsert: true }
                );

                const checkboxSession = updatedCheckboxSession;
                const dbCriteria = await db.collection("checkbox_criteria")
                    .find({ session_id: session._id })
                    .sort({ order_index: 1, created_at: 1 })
                    .toArray();
                const progressDoc = await db.collection("checkbox_progress").findOne({
                    session_id: session._id,
                    group_number: parsedGroupNumber
                });
                const progressMap = progressDoc?.progress || {};

                const incomingCriteria = Array.isArray(data.criteria) ? data.criteria : [];
                let finalCriteria;
                if (!dbCriteria || dbCriteria.length === 0) {
                    console.warn(`⚠️ No DB criteria found for session ${normalizedCode}. Falling back to teacher payload with ${incomingCriteria.length} items.`);
                    finalCriteria = incomingCriteria.map((criterion, index) => ({
                        id: Number(criterion.id ?? index),
                        dbId: criterion.dbId,
                        description: criterion.description,
                        rubric: criterion.rubric || "",
                        status: criterion.status || "grey",
                        completed: criterion.status === "green" ? true : Boolean(criterion.completed),
                        quote: criterion.quote ?? null
                    }));
                } else {
                    finalCriteria = dbCriteria.map((criterion, index) => {
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

                    if (incomingCriteria.length > 0) {
                        const byDbId = new Map(incomingCriteria.filter((item) => item.dbId).map((item) => [item.dbId, item]));
                        const byIdx = new Map(incomingCriteria.map((item) => [Number(item.id), item]));
                        finalCriteria = finalCriteria.map((item) => {
                            const fromTeacher = (item.dbId && byDbId.get(item.dbId)) || byIdx.get(Number(item.id));
                            if (!fromTeacher) return item;
                            const teacherStatus = fromTeacher.status || "grey";
                            const preferTeacher = teacherStatus === "green" || (item.status === "grey" && teacherStatus !== "grey");
                            if (!preferTeacher) return item;
                            return {
                                ...item,
                                status: teacherStatus,
                                completed: teacherStatus === "green" ? true : item.completed,
                                quote: fromTeacher.quote && fromTeacher.quote !== "null" ? fromTeacher.quote : item.quote
                            };
                        });
                    }

                    if (cached && Array.isArray(cached.criteria) && cached.criteria.length > 0) {
                        const cacheByIdx = new Map(cached.criteria.map((item) => [Number(item.id), item]));
                        finalCriteria = finalCriteria.map((item) => {
                            const fromCache = cacheByIdx.get(Number(item.id));
                            if (!fromCache) return item;
                            const cacheStatus = fromCache.status || "grey";
                            const preferCache = cacheStatus === "green" || (item.status === "grey" && cacheStatus !== "grey");
                            if (!preferCache) return item;
                            return {
                                ...item,
                                status: cacheStatus,
                                completed: cacheStatus === "green" ? true : item.completed,
                                quote: fromCache.quote && fromCache.quote !== "null" ? fromCache.quote : item.quote
                            };
                        });
                    }
                }

                finalCriteria = (finalCriteria || []).slice().sort((a, b) => Number(a.id) - Number(b.id));
                if ((!finalCriteria || finalCriteria.length === 0) && cached && Array.isArray(cached.criteria) && cached.criteria.length > 0) {
                    console.warn("⚠️ DB and teacher payload empty, falling back to cached checklist state entirely");
                    finalCriteria = cached.criteria.map((criterion) => ({
                        id: Number(criterion.id),
                        dbId: criterion.dbId,
                        description: criterion.description,
                        rubric: criterion.rubric || "",
                        status: criterion.status || "grey",
                        completed: Boolean(criterion.completed),
                        quote: criterion.quote ?? null
                    }));
                }

                const checklistData = {
                    sessionCode: normalizedCode,
                    groupNumber: parsedGroupNumber,
                    criteria: finalCriteria,
                    scenario: checkboxSession?.scenario || data.scenario || "",
                    timestamp: Date.now(),
                    isReleased: true
                };

                io.to(normalizedCode).emit("checklist_state", checklistData);
                io.to(`${normalizedCode}-${parsedGroupNumber}`).emit("checklist_state", checklistData);
                latestChecklistState.set(cacheKey, checklistData);
            } catch (error) {
                console.error("❌ Error handling checklist release:", error);
            }
        });
    });

    return io;
}
