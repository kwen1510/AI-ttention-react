import { v4 as uuid } from "uuid";
import { db } from "../db/db.js";
import {
    emitSocketAuthError,
    getSocketTeacher,
    primeSocketTeacher
} from "../middleware/auth.js";
import { activeSessions, latestChecklistState } from "./state.js";
import { transcribe, extractMime } from "./elevenlabs.js";
import { summarise } from "./openai.js";
import {
    createTranscriptRecord,
    appendTranscriptSegment,
    createSummaryUpdateFields,
    persistSummarySnapshot
} from "./transcript.js";

// Auto-summary management
export const activeSummaryTimers = new Map();
const processingGroups = new Set();

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
            if (transcription.text && transcription.text !== "No transcription available" && transcription.text !== "Transcription failed") {
                // Save this individual transcription segment
                const session = await db.collection("sessions").findOne({ code: sessionCode });
                const group = await db.collection("groups").findOne({ session_id: session._id, number: parseInt(groupNumber) });

                if (group) {
                    // Save the transcription segment
                    const now = Date.now();
                    const transcriptId = uuid();

                    // Calculate word count and duration with fallbacks
                    const wordCount = transcription.words && transcription.words.length > 0 ?
                        transcription.words.length :
                        transcription.text.split(' ').filter(w => w.trim().length > 0).length;

                    const duration = transcription.words && transcription.words.length > 0 ?
                        transcription.words[transcription.words.length - 1].end :
                        Math.max(10, Math.min(30, transcription.text.length * 0.05)); // Estimate 0.05 seconds per character

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

export function initSocket(io) {
    ioInstance = io;

    io.on("connection", socket => {
        const teacherReady = primeSocketTeacher(socket);
        console.log(`🔌 New socket connection: ${socket.id}`);
        let groupId, localBuf = [], sessionCode, groupNumber;

        async function ensureTeacherOwnsSession(code) {
            await teacherReady;

            if (socket.data.teacherAuthError) {
                emitSocketAuthError(socket);
                return null;
            }

            const teacher = getSocketTeacher(socket);
            if (!teacher) {
                socket.emit("error", "Unauthorized");
                return null;
            }

            const session = code
                ? await db.collection("sessions").findOne({ code })
                : null;

            if (session) {
                if (session.owner_id !== teacher.id) {
                    socket.emit("error", "Forbidden");
                    return null;
                }

                return { teacher, session };
            }

            const sessionState = activeSessions.get(code);
            if (sessionState?.ownerId === teacher.id) {
                return { teacher, session: null, sessionState };
            }

            socket.emit("error", "Session not found");
            return null;
        }

        // Live prompt updates from admin: keep latest prompt in memory to avoid DB reads
        socket.on('prompt_update', async data => {
            try {
                const { sessionCode: code, prompt } = data || {};
                if (!code || typeof prompt !== 'string') return;
                const access = await ensureTeacherOwnsSession(code);
                if (!access) return;
                const mem = activeSessions.get(code);
                if (mem) {
                    activeSessions.set(code, { ...mem, customPrompt: prompt });
                }
            } catch (e) {
                console.warn('⚠️ prompt_update handling error:', e.message);
            }
        });

        // Attach buffer to socket for auto-summary access
        socket.localBuf = localBuf;

        // Timestamp helper for logs
        function ts() { return new Date().toISOString(); }

        // Admin joins session room
        socket.on("admin_join", async ({ code }) => {
            try {
                const access = await ensureTeacherOwnsSession(code);
                if (!access) return;
                // console.log(`👨‍🏫 Admin socket ${socket.id} joining session room: ${code}`);
                socket.join(code);
                // console.log(`✅ Admin joined session room: ${code}`);
            } catch (err) {
                console.error("❌ Error admin joining session room:", err);
            }
        });

        socket.on("join", async ({ code, group }) => {
            try {
                // console.log(`[${ts()}] 👋 Socket ${socket.id} attempting to join session ${code}, group ${group}`);

                // Check memory only - no database lookup
                const sessionState = activeSessions.get(code);

                if (!sessionState) {
                    // console.log(`❌ Session ${code} not found`);
                    return socket.emit("error", "Session not found");
                }

                sessionCode = code;
                groupNumber = group;

                // Only create database entries if session has been persisted (i.e., recording started)
                if (sessionState.persisted) {
                    // Session exists in database, handle group creation normally
                    const sess = await db.collection("sessions").findOne({ code: code });
                    if (!sess) {
                        // console.log(`❌ Session ${code} not found in database despite being marked as persisted`);
                        return socket.emit("error", "Session data inconsistent");
                    }

                    const existing = await db.collection("groups").findOne({ session_id: sess._id, number: parseInt(group) });
                    groupId = existing?._id ?? uuid();

                    if (!existing) {
                        await db.collection("groups").insertOne({
                            _id: groupId,
                            session_id: sess._id,
                            number: parseInt(group)
                        });
                        // console.log(`📝 Created new group: Session ${code}, Group ${group}, ID: ${groupId}`);
                    } else {
                        // console.log(`🔄 Rejoined existing group: Session ${code}, Group ${group}, ID: ${groupId}`);
                    }
                } else {
                    // Session not yet persisted, just create a temporary group ID
                    groupId = uuid();
                    // console.log(`📝 Created temporary group ID for unpersisted session: ${groupId}`);
                }

                socket.join(code);
                socket.join(`${code}-${group}`);

                // Send different status based on session state
                if (sessionState.active) {
                    socket.emit("joined", { code, group, status: "recording", interval: sessionState.interval || 30000, mode: sessionState.mode || "summary" });
                    // console.log(`✅ Socket ${socket.id} joined ACTIVE session ${code}, group ${group}`);
                    // Track joined group for reliability retries
                    const mem = activeSessions.get(code) || {};
                    if (!mem.groups) mem.groups = new Map();
                    mem.groups.set(parseInt(group), { joined: true, recording: false, lastAck: Date.now() });
                    activeSessions.set(code, mem);
                    // Immediate emit to this group if server is active and not yet recording
                    io.to(`${code}-${parseInt(group)}`).emit("record_now", sessionState.interval || 30000);
                } else {
                    socket.emit("joined", { code, group, status: "waiting", interval: sessionState.interval || 30000, mode: sessionState.mode || "summary" });
                    // console.log(`✅ Socket ${socket.id} joined INACTIVE session ${code}, group ${group} - waiting for start`);
                    const mem = activeSessions.get(code) || {};
                    if (!mem.groups) mem.groups = new Map();
                    mem.groups.set(parseInt(group), { joined: true, recording: false, lastAck: Date.now() });
                    activeSessions.set(code, mem);
                }

                // Notify admin about student joining
                socket.to(code).emit("student_joined", { group, socketId: socket.id });
                console.log(`[${ts()}] 📢 Notified admin about student joining group ${group}`);

            } catch (err) {
                console.error("❌ Error joining session:", err);
                console.error("Error details:", {
                    message: err.message,
                    stack: err.stack,
                    sessionCode: code,
                    group: group
                });
                socket.emit("error", `Failed to join session: ${err.message}`);
            }
        });

        socket.on("student:chunk", ({ data, format }) => {
            // Note: This event is no longer used. Students now upload chunks directly via /api/transcribe-chunk
            // console.log(`⚠️  Received old-style chunk from ${sessionCode}, group ${groupNumber} - ignoring (use /api/transcribe-chunk instead)`);
        });

        // Handle heartbeat to keep connection alive (especially for background recording)
        socket.on("heartbeat", ({ session, group }) => {
            console.log(`[${ts()}] 💓 Heartbeat from session ${session}, group ${group} (socket: ${socket.id})`);
            socket.emit("heartbeat_ack");
            // Mark group alive; if session active, also flag as recording
            const mem = activeSessions.get(session);
            if (mem) {
                if (!mem.groups) mem.groups = new Map();
                const st = mem.groups.get(parseInt(group)) || {};
                st.joined = true;
                st.lastAck = Date.now();
                if (mem.active) st.recording = true;
                mem.groups.set(parseInt(group), st);
                activeSessions.set(session, mem);
            }
        });

        // Explicit client acknowledgement when recording actually starts
        socket.on('recording_started', ({ session, group, interval }) => {
            try {
                const mem = activeSessions.get(session);
                if (!mem) return;
                if (!mem.groups) mem.groups = new Map();
                const st = mem.groups.get(parseInt(group)) || {};
                st.joined = true;
                st.recording = true;
                st.lastAck = Date.now();
                mem.groups.set(parseInt(group), st);
                activeSessions.set(session, mem);
                console.log(`✅ recording_started ack from group ${group} (session ${session})`);
            } catch (e) {
                console.warn('⚠️ recording_started handler error:', e.message);
            }
        });

        // Handle admin heartbeat
        socket.on("admin_heartbeat", async ({ sessionCode }) => {
            const access = await ensureTeacherOwnsSession(sessionCode);
            if (!access) return;
            console.log(`[${ts()}] 💓 Admin heartbeat from session ${sessionCode} (socket: ${socket.id})`);
            socket.emit("admin_heartbeat_ack");
        });

        /* ===== DEV ONLY: Simulate disconnect test (guarded by env) ===== */
        socket.on('dev_simulate_disconnect', ({ sessionCode: code, target = 'all', group = 1, durationMs = 5000 }) => {
            if (!process.env.ALLOW_DEV_TEST) {
                // console.log('🚫 dev_simulate_disconnect ignored (ALLOW_DEV_TEST not set)');
                return;
            }
            try {
                // console.log(`🧪 DEV: simulate disconnect → session ${code}, target=${target}, group=${group}, duration=${durationMs}ms`);
                const payload = { durationMs: Number(durationMs) || 5000 };
                if (target === 'all') {
                    io.to(code).emit('dev_simulate_disconnect', payload);
                } else {
                    io.to(`${code}-${parseInt(group)}`).emit('dev_simulate_disconnect', payload);
                }
            } catch (e) {
                console.warn('⚠️ dev_simulate_disconnect error:', e.message);
            }
        });
        /* ===== END DEV ONLY ===== */

        // Handle upload errors from students
        socket.on("upload_error", ({ session, group, error, chunkSize, timestamp }) => {
            // console.log(`❌ Upload error from session ${session}, group ${group}: ${error}`);

            // Notify admin about the upload error
            socket.to(session).emit("upload_error", {
                group: group,
                error: error,
                chunkSize: chunkSize,
                timestamp: timestamp,
                socketId: socket.id
            });

            // Log error for debugging
            // console.log(`📊 Upload error details: ${chunkSize} bytes, ${error}`);
        });

        // Handle student disconnection
        socket.on("disconnect", () => {
            if (sessionCode && groupNumber) {
                console.log(`[${ts()}] 🔌 Socket ${socket.id} disconnected from session ${sessionCode}, group ${groupNumber}`);

                // Notify admin about student leaving
                socket.to(sessionCode).emit("student_left", { group: groupNumber, socketId: socket.id });

                // Clean up activeSessions group tracking to prevent memory leak
                const sessionState = activeSessions.get(sessionCode);
                if (sessionState && sessionState.groups) {
                    sessionState.groups.delete(parseInt(groupNumber));
                    console.log(`🧹 Cleaned up group ${groupNumber} from activeSessions for session ${sessionCode}`);

                    // If no groups remain and session is not active, consider cleaning up the session
                    if (sessionState.groups.size === 0 && !sessionState.active && !sessionState.persisted) {
                        activeSessions.delete(sessionCode);
                        // console.log(`🧹 Cleaned up empty unpersisted session ${sessionCode} from memory`);
                    }
                }

                // Remove from processing groups if it was being processed
                const groupKey = `${sessionCode}-${groupNumber}`;
                processingGroups.delete(groupKey);
            } else {
                // console.log(`🔌 Socket ${socket.id} disconnected (no session/group)`);
            }

            // Clean up socket buffer to prevent memory leaks
            if (socket.localBuf) {
                socket.localBuf.length = 0;
                socket.localBuf = null;
            }

            // Socket.IO automatically handles room cleanup when sockets disconnect
        });

        // Debug helper - tell client what rooms they're in
        socket.on('get_my_rooms', () => {
            // console.log(`🔍 Socket ${socket.id} requested room info`);
            // console.log(`🔍 Socket ${socket.id} is in rooms:`, Array.from(socket.rooms));
            socket.emit('room_info', {
                socketId: socket.id,
                rooms: Array.from(socket.rooms)
            });
        });

        // Handle checklist release to students
        socket.on('release_checklist', async (data) => {
            try {
                const access = await ensureTeacherOwnsSession(data?.sessionCode);
                if (!access) return;
                // console.log(`📤 Teacher releasing checklist to Group ${data.groupNumber} in session ${data.sessionCode}`);
                const groupNumber = Number(data.groupNumber ?? data.group);
                if (!Number.isFinite(groupNumber)) {
                    console.error(`❌ Invalid group number received for release_checklist: ${data.groupNumber ?? data.group}`);
                    return;
                }
                const cacheKey = `${data.sessionCode}-${groupNumber}`;
                const cached = latestChecklistState.get(cacheKey);
                if (cached) {
                    // console.log(`🗄️ Using cached checklist_state as merge source (cached ${cached.criteria?.length || 0} items)`);
                }

                // Get the session from database to get its _id
                const session = await db.collection("sessions").findOne({ code: data.sessionCode });
                if (!session) {
                    console.error(`❌ Session ${data.sessionCode} not found in database`);
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
                        [groupNumber]: true
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

                // console.log(`✅ Release flag set for group ${groupNumber} in session ${data.sessionCode}`);

                const checkboxSession = updatedCheckboxSession;

                // Build authoritative checklist state from DB progress for this group
                const dbCriteria = await db.collection("checkbox_criteria")
                    .find({ session_id: session._id })
                    .sort({ order_index: 1, created_at: 1 })
                    .toArray();
                const progressDoc = await db.collection("checkbox_progress").findOne({
                    session_id: session._id,
                    group_number: groupNumber
                });
                const progressMap = progressDoc?.progress || {};

                // Fallback: if DB has no criteria yet (race on first start), use teacher-provided payload
                const incomingCriteria = Array.isArray(data.criteria) ? data.criteria : [];
                let finalCriteria;
                if (!dbCriteria || dbCriteria.length === 0) {
                    console.warn(`⚠️ No DB criteria found for session ${data.sessionCode}. Falling back to teacher payload with ${incomingCriteria.length} items.`);
                    finalCriteria = incomingCriteria.map((c, idx) => ({
                        id: Number(c.id ?? idx),
                        dbId: c.dbId,
                        description: c.description,
                        rubric: c.rubric || '',
                        status: c.status || 'grey',
                        completed: c.status === 'green' ? true : Boolean(c.completed),
                        quote: c.quote ?? null
                    }));
                } else {
                    // Build from DB first
                    finalCriteria = dbCriteria.map((c, idx) => {
                        const prog = progressMap[String(c._id)];
                        return {
                            id: idx,
                            dbId: c._id,
                            description: c.description,
                            rubric: c.rubric || '',
                            status: prog?.status || 'grey',
                            completed: prog?.completed || (prog?.status === 'green') || false,
                            quote: prog?.quote || null
                        };
                    });
                    // Merge in teacher payload to avoid initial all-grey if DB progress isn't there yet
                    if (incomingCriteria.length > 0) {
                        const byDbId = new Map(incomingCriteria.filter(x => x.dbId).map(x => [x.dbId, x]));
                        const byIdx = new Map(incomingCriteria.map(x => [Number(x.id), x]));
                        finalCriteria = finalCriteria.map(item => {
                            const fromTeacher = (item.dbId && byDbId.get(item.dbId)) || byIdx.get(Number(item.id));
                            if (!fromTeacher) return item;
                            const teacherStatus = fromTeacher.status || 'grey';
                            const preferTeacher = (teacherStatus === 'green') || (item.status === 'grey' && teacherStatus !== 'grey');
                            if (preferTeacher) {
                                return {
                                    ...item,
                                    status: teacherStatus,
                                    completed: teacherStatus === 'green' ? true : item.completed,
                                    quote: (fromTeacher.quote && fromTeacher.quote !== 'null') ? fromTeacher.quote : item.quote
                                };
                            }
                            return item;
                        });
                    }
                    // Merge in cached latest state to avoid blanks on first release
                    if (cached && Array.isArray(cached.criteria) && cached.criteria.length > 0) {
                        const cacheByIdx = new Map(cached.criteria.map(x => [Number(x.id), x]));
                        finalCriteria = finalCriteria.map(item => {
                            const fromCache = cacheByIdx.get(Number(item.id));
                            if (!fromCache) return item;
                            const cacheStatus = fromCache.status || 'grey';
                            const preferCache = (cacheStatus === 'green') || (item.status === 'grey' && cacheStatus !== 'grey');
                            if (preferCache) {
                                return {
                                    ...item,
                                    status: cacheStatus,
                                    completed: cacheStatus === 'green' ? true : item.completed,
                                    quote: (fromCache.quote && fromCache.quote !== 'null') ? fromCache.quote : item.quote
                                };
                            }
                            return item;
                        });
                    }
                }

                // Ensure stable ordering by numeric id
                finalCriteria = (finalCriteria || []).slice().sort((a, b) => Number(a.id) - Number(b.id));
                if (!finalCriteria || finalCriteria.length === 0) {
                    // Last resort: if everything failed, use cached criteria entirely
                    if (cached && Array.isArray(cached.criteria) && cached.criteria.length > 0) {
                        console.warn('⚠️ DB and teacher payload empty, falling back to cached checklist state entirely');
                        finalCriteria = cached.criteria.map(c => ({
                            id: Number(c.id),
                            dbId: c.dbId,
                            description: c.description,
                            rubric: c.rubric || '',
                            status: c.status || 'grey',
                            completed: Boolean(c.completed),
                            quote: c.quote ?? null
                        }));
                    }
                }

                const checklistData = {
                    sessionCode: data.sessionCode,
                    groupNumber,
                    criteria: finalCriteria,
                    scenario: checkboxSession?.scenario || data.scenario || "",
                    timestamp: Date.now(),
                    isReleased: true
                };

                // Emit to everyone - students will now see it because isReleased is true
                io.to(data.sessionCode).emit('checklist_state', checklistData);
                io.to(`${data.sessionCode}-${groupNumber}`).emit('checklist_state', checklistData);
                latestChecklistState.set(cacheKey, checklistData);

                // console.log(`✅ Checklist released to session ${data.sessionCode} for Group ${groupNumber}`);
            } catch (error) {
                console.error('❌ Error handling checklist release:', error);
            }
        });
    });

    return io;
}
