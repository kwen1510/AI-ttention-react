import { v4 as uuid } from "uuid";
import { createSupabaseDb } from "../db/db.js";

const db = createSupabaseDb();
let warnedAboutMissingSummarySnapshots = false;

function isMissingRelationError(error) {
    const code = String(error?.code || '');
    const message = String(error?.message || '');
    return code === '42P01'
        || code === 'PGRST205'
        || message.includes(`Could not find the table 'public.summary_snapshots'`)
        || message.includes('relation "summary_snapshots" does not exist');
}

// Global storage for session transcript history
const sessionTranscriptHistory = new Map();

export function addToTranscriptHistory(sessionCode, transcript) {
    if (!sessionTranscriptHistory.has(sessionCode)) {
        sessionTranscriptHistory.set(sessionCode, []);
    }

    const history = sessionTranscriptHistory.get(sessionCode);
    history.push({
        transcript: transcript,
        timestamp: new Date().toISOString()
    });

    // Keep only the last 3 chunks for context
    if (history.length > 3) {
        history.shift();
    }
}

export function getContextualTranscript(sessionCode) {
    const history = sessionTranscriptHistory.get(sessionCode) || [];
    if (history.length === 0) return '';

    // Return combined transcript with context markers
    const contextText = history.map((chunk, index) => {
        const isLatest = index === history.length - 1;
        const chunkLabel = isLatest ? 'CURRENT CHUNK' : `PREVIOUS CHUNK ${history.length - index - 1}`;
        return `[${chunkLabel}]: ${chunk.transcript}`;
    }).join('\n\n');

    return contextText;
}

export function clearTranscriptHistory(sessionCode) {
    sessionTranscriptHistory.delete(sessionCode);
}

export function computeTranscriptStats(segments = []) {
    const base = {
        total_segments: segments.length,
        total_words: 0,
        total_duration: 0,
        last_update: null
    };

    for (const segment of segments) {
        base.total_words += Number(segment?.word_count ?? 0);
        base.total_duration += Number(segment?.duration_seconds ?? 0);
        if (segment?.created_at) {
            base.last_update = segment.created_at;
        }
    }

    return base;
}

export function extractTranscriptSegments(record) {
    const payload = record?.payload;
    if (!payload) return [];
    const segments = Array.isArray(payload.segments) ? payload.segments : [];
    return segments;
}

export function segmentToTranscript(segment) {
    return {
        id: segment.id,
        text: segment.text,
        word_count: segment.word_count,
        duration_seconds: segment.duration_seconds,
        segment_number: segment.segment_number,
        is_noise: segment.is_noise,
        created_at: segment.created_at
    };
}

export function buildFullTranscript(segments = []) {
    return (segments || [])
        .map((segment) => String(segment?.text || '').trim())
        .filter(Boolean)
        .join('\n\n');
}

export async function getTranscriptBundle(sessionId, groupId) {
    if (!sessionId || !groupId) {
        return { record: null, segments: [], stats: computeTranscriptStats([]) };
    }

    const record = await db.collection("transcripts").findOne({
        session_id: sessionId,
        group_id: groupId
    });

    const segments = extractTranscriptSegments(record);
    const stats = record?.payload?.stats ?? computeTranscriptStats(segments);
    return { record, segments, stats };
}

export async function persistTranscriptBundle({ sessionId, groupId, segments, record }) {
    const stats = computeTranscriptStats(segments);
    const now = Date.now();
    const payload = {
        segments,
        stats
    };

    if (!record) {
        const result = await db.collection("transcripts").insertOne({
            _id: uuid(),
            session_id: sessionId,
            group_id: groupId,
            payload,
            segment_cursor: segments.length,
            created_at: now,
            updated_at: now
        });
        return {
            record: result.inserted,
            segments,
            stats
        };
    }

    const updated = await db.collection("transcripts").findOneAndUpdate(
        { _id: record._id },
        {
            $set: {
                payload,
                segment_cursor: segments.length,
                updated_at: now
            }
        },
        { upsert: false }
    );

    return {
        record: updated,
        segments,
        stats
    };
}

export async function appendTranscriptSegment({ sessionId, groupId, segment }) {
    const { record, segments } = await getTranscriptBundle(sessionId, groupId);
    const updatedSegments = [...segments, segment];
    return persistTranscriptBundle({
        sessionId,
        groupId,
        segments: updatedSegments,
        record
    });
}

export async function trimTranscriptSegments({ sessionId, groupId, record, segments, maxSegments = 100 }) {
    if (!Array.isArray(segments) || segments.length <= maxSegments) {
        return { record, segments };
    }

    const trimmed = segments.slice(-maxSegments);
    const result = await persistTranscriptBundle({
        sessionId,
        groupId,
        segments: trimmed,
        record
    });

    return result;
}

export function createTranscriptRecord({
    id,
    sessionId,
    groupId,
    text,
    wordCount,
    durationSeconds,
    segmentNumber,
    createdAt,
    isNoise = false
}) {
    if (!sessionId) {
        throw new Error("sessionId is required to create a transcript record");
    }
    if (!groupId) {
        throw new Error("groupId is required to create a transcript record");
    }
    if (!id) {
        throw new Error("id is required to create a transcript record");
    }

    const timestamp = createdAt ? new Date(createdAt).toISOString() : new Date().toISOString();

    return {
        sessionId,
        groupId,
        segment: {
            id,
            text,
            word_count: wordCount ?? 0,
            duration_seconds: durationSeconds ?? 0,
            segment_number: segmentNumber ?? 0,
            is_noise: Boolean(isNoise),
            created_at: timestamp
        }
    };
}

export function createSummaryUpdateFields({
    sessionId,
    text,
    timestamp = Date.now()
}) {
    if (!sessionId) {
        throw new Error("sessionId is required to update a summary record");
    }

    return {
        session_id: sessionId,
        text,
        updated_at: timestamp
    };
}

export async function persistSummarySnapshot({
    sessionId,
    groupId,
    segments,
    summaryText,
    timestamp = Date.now()
}) {
    if (!sessionId || !groupId || !Array.isArray(segments) || segments.length === 0 || !summaryText) {
        return null;
    }

    const segmentCursor = segments.length;
    const latestSegment = segments[segments.length - 1];
    const existing = await db.collection("summary_snapshots").findOne({
        group_id: groupId,
        segment_cursor: segmentCursor
    }).catch((error) => {
        if (isMissingRelationError(error)) {
            if (!warnedAboutMissingSummarySnapshots) {
                warnedAboutMissingSummarySnapshots = true;
                console.warn("⚠️ summary_snapshots table is missing; summary timelines will remain empty until the migration is applied.");
            }
            return null;
        }
        throw error;
    });

    if (existing) {
        return existing;
    }

    try {
        const result = await db.collection("summary_snapshots").insertOne({
            _id: uuid(),
            session_id: sessionId,
            group_id: groupId,
            segment_cursor: segmentCursor,
            latest_segment_id: latestSegment?.id || null,
            summary_text: summaryText,
            created_at: timestamp
        });
        return result.inserted;
    } catch (error) {
        if (isMissingRelationError(error)) {
            if (!warnedAboutMissingSummarySnapshots) {
                warnedAboutMissingSummarySnapshots = true;
                console.warn("⚠️ summary_snapshots table is missing; summary timelines will remain empty until the migration is applied.");
            }
            return null;
        }
        throw error;
    }
}

export async function getSummarySnapshots(sessionId, groupId) {
    if (!sessionId || !groupId) {
        return [];
    }

    try {
        return await db.collection("summary_snapshots")
            .find({ session_id: sessionId, group_id: groupId })
            .sort({ created_at: 1 })
            .toArray();
    } catch (error) {
        if (isMissingRelationError(error)) {
            if (!warnedAboutMissingSummarySnapshots) {
                warnedAboutMissingSummarySnapshots = true;
                console.warn("⚠️ summary_snapshots table is missing; summary timelines will remain empty until the migration is applied.");
            }
            return [];
        }
        throw error;
    }
}
