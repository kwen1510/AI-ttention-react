import { db } from "../db/db.js";
import {
    buildFullTranscript,
    getSummarySnapshots,
    getTranscriptBundle,
    segmentToTranscript
} from "./transcript.js";

function createHttpError(message, status) {
    const error = new Error(message);
    error.status = status;
    return error;
}

function toTimestamp(value) {
    if (value === null || value === undefined) return null;
    if (typeof value === "number") return value;
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
}

function computeSessionDuration(session) {
    const totalDurationSeconds = Number(session?.total_duration_seconds);
    if (Number.isFinite(totalDurationSeconds) && totalDurationSeconds > 0) {
        return Math.round(totalDurationSeconds * 1000);
    }

    const start = toTimestamp(session?.start_time);
    const end = toTimestamp(session?.end_time);
    if (start && end && end >= start) {
        return end - start;
    }

    return null;
}

function computeSessionUpdatedAt(session) {
    return (
        toTimestamp(session?.updated_at) ||
        toTimestamp(session?.last_updated) ||
        toTimestamp(session?.end_time) ||
        toTimestamp(session?.start_time) ||
        toTimestamp(session?.created_at) ||
        Date.now()
    );
}

function normalizeSegmentCursor(value, fallback) {
    const cursor = Number(value);
    if (!Number.isFinite(cursor) || cursor < 0) {
        return fallback;
    }
    return Math.min(cursor, fallback);
}

function buildPagination(total, offset, limit, resultCount) {
    return {
        total,
        offset,
        limit,
        hasMore: offset + resultCount < total
    };
}

async function getSortedGroups(sessionId) {
    return db.collection("groups")
        .find({ session_id: sessionId })
        .sort({ number: 1 })
        .toArray();
}

async function getCheckboxSessionBundle(sessionId) {
    const [checkboxSession, criteria, progressDocs] = await Promise.all([
        db.collection("checkbox_sessions").findOne({ session_id: sessionId }),
        db.collection("checkbox_criteria")
            .find({ session_id: sessionId })
            .sort({ order_index: 1, created_at: 1 })
            .toArray(),
        db.collection("checkbox_progress")
            .find({ session_id: sessionId })
            .toArray()
    ]);

    return { checkboxSession, criteria, progressDocs };
}

function buildCheckboxProgressMaps(progressDocs = []) {
    return new Map(
        (progressDocs || []).map((doc) => [Number(doc.group_number), doc.progress || {}])
    );
}

function buildCheckboxCriteria(criteria = [], progressMap = {}) {
    return (criteria || []).map((criterion) => {
        const entry = progressMap[String(criterion._id)] || {};
        return {
            id: criterion._id,
            description: criterion.description,
            rubric: criterion.rubric || "",
            weight: criterion.weight || 1,
            status: entry.status || "grey",
            completed: entry.completed === true || entry.status === "green" || false,
            quote: entry.quote ?? null,
            history: Array.isArray(entry.history) ? entry.history : []
        };
    });
}

function buildCheckboxPreview(criteria = [], groups = [], checkboxSession = null, progressDocs = []) {
    const groupCount = groups.length;
    const criteriaCount = criteria.length;
    const progressEntries = progressDocs.flatMap((doc) => Object.values(doc.progress || {}));
    const completedCriteria = progressEntries.filter((entry) => entry?.status === "green").length;
    const totalCriteria = groupCount > 0 ? groupCount * criteriaCount : criteriaCount;
    const completionRate = totalCriteria > 0
        ? Math.round((completedCriteria / totalCriteria) * 100)
        : 0;

    return {
        scenario: checkboxSession?.scenario || "",
        releasedGroups: checkboxSession?.released_groups || {},
        completedCriteria,
        totalCriteria,
        completionRate
    };
}

async function buildSessionListItem(session) {
    const groups = await getSortedGroups(session._id);
    const transcriptBundles = await Promise.all(
        groups.map((group) => getTranscriptBundle(session._id, group._id))
    );

    const totalTranscripts = transcriptBundles.reduce(
        (sum, bundle) => sum + (bundle.stats?.total_segments || bundle.segments.length || 0),
        0
    );

    const item = {
        _id: session._id,
        code: session.code,
        mode: session.mode || "summary",
        active: Boolean(session.active),
        created_at: toTimestamp(session.created_at),
        updated_at: computeSessionUpdatedAt(session),
        start_time: toTimestamp(session.start_time),
        end_time: toTimestamp(session.end_time),
        duration: computeSessionDuration(session),
        totalStudents: groups.length,
        totalTranscripts
    };

    if ((session.mode || "summary") === "checkbox") {
        const { checkboxSession, criteria, progressDocs } = await getCheckboxSessionBundle(session._id);
        item.modeSpecificData = buildCheckboxPreview(criteria, groups, checkboxSession, progressDocs);
    }

    return item;
}

async function buildGroupHistory(session, group, checkboxBundle = null) {
    const [{ segments, stats }, latestSummary, snapshots] = await Promise.all([
        getTranscriptBundle(session._id, group._id),
        db.collection("summaries").findOne({ group_id: group._id }),
        getSummarySnapshots(session._id, group._id)
    ]);

    const transcriptSegments = segments.map(segmentToTranscript);
    const summaryTimeline = snapshots.map((snapshot) => {
        const cursor = normalizeSegmentCursor(snapshot.segment_cursor, transcriptSegments.length);
        const cumulativeSegments = transcriptSegments.slice(0, cursor);
        const latestSegment =
            cumulativeSegments[cumulativeSegments.length - 1] ||
            transcriptSegments.find((segment) => segment.id === snapshot.latest_segment_id) ||
            null;

        return {
            segment_cursor: cursor,
            created_at: toTimestamp(snapshot.created_at),
            summary_text: snapshot.summary_text,
            latest_segment: latestSegment,
            cumulative_transcript: buildFullTranscript(cumulativeSegments)
        };
    });

    let modeSpecificData = null;
    if (checkboxBundle) {
        const progressMap = checkboxBundle.progressByGroup.get(Number(group.number)) || {};
        modeSpecificData = {
            scenario: checkboxBundle.checkboxSession?.scenario || "",
            isReleased: Boolean(checkboxBundle.checkboxSession?.released_groups?.[group.number]),
            criteria: buildCheckboxCriteria(checkboxBundle.criteria, progressMap)
        };
    }

    return {
        _id: group._id,
        groupNumber: group.number,
        number: group.number,
        fullTranscript: buildFullTranscript(transcriptSegments),
        segments: transcriptSegments,
        latestSummary: latestSummary?.text || null,
        summaryTimeline,
        transcriptStats: stats,
        modeSpecificData
    };
}

function buildSessionEnvelope(session, groups, modeSpecificData = null) {
    return {
        _id: session._id,
        code: session.code,
        mode: session.mode || "summary",
        active: Boolean(session.active),
        created_at: toTimestamp(session.created_at),
        updated_at: computeSessionUpdatedAt(session),
        start_time: toTimestamp(session.start_time),
        end_time: toTimestamp(session.end_time),
        duration: computeSessionDuration(session),
        totalStudents: groups.length,
        totalTranscripts: groups.reduce((sum, group) => sum + group.segments.length, 0),
        modeSpecificData
    };
}

export async function getOwnedSessionOrThrow(teacherId, sessionCode) {
    const session = await db.collection("sessions").findOne({ code: sessionCode });
    if (!session) {
        throw createHttpError("Session not found", 404);
    }
    if (session.owner_id !== teacherId) {
        throw createHttpError("Forbidden", 403);
    }
    return session;
}

export async function listOwnedHistorySessions({ teacherId, mode = "", offset = 0, limit = 20 }) {
    const normalizedOffset = Math.max(Number(offset) || 0, 0);
    const normalizedLimit = Math.max(Math.min(Number(limit) || 20, 100), 1);
    const filter = { owner_id: teacherId };

    if (mode) {
        filter.mode = mode;
    }

    const total = await db.collection("sessions").countDocuments(filter);
    const sessions = await db.collection("sessions")
        .find(filter)
        .sort({ created_at: -1 })
        .skip(normalizedOffset)
        .limit(normalizedLimit)
        .toArray();

    const items = await Promise.all(sessions.map(buildSessionListItem));

    return {
        sessions: items,
        pagination: buildPagination(total, normalizedOffset, normalizedLimit, items.length)
    };
}

export async function buildHistorySessionDetail(session) {
    const groups = await getSortedGroups(session._id);
    let checkboxBundle = null;
    let sessionModeSpecificData = null;

    if ((session.mode || "summary") === "checkbox") {
        const checkboxSessionBundle = await getCheckboxSessionBundle(session._id);
        checkboxBundle = {
            ...checkboxSessionBundle,
            progressByGroup: buildCheckboxProgressMaps(checkboxSessionBundle.progressDocs)
        };
        sessionModeSpecificData = buildCheckboxPreview(
            checkboxSessionBundle.criteria,
            groups,
            checkboxSessionBundle.checkboxSession,
            checkboxSessionBundle.progressDocs
        );
    }

    const historyGroups = await Promise.all(
        groups.map((group) => buildGroupHistory(session, group, checkboxBundle))
    );

    return {
        session: buildSessionEnvelope(session, historyGroups, sessionModeSpecificData),
        groups: historyGroups
    };
}

export async function buildCombinedHistoryExport(session) {
    const detail = await buildHistorySessionDetail(session);
    return {
        exported_at: new Date().toISOString(),
        export_type: "combined",
        session: detail.session,
        groups: detail.groups.map((group) => ({
            groupNumber: group.groupNumber,
            fullTranscript: group.fullTranscript,
            latestSummary: group.latestSummary,
            summaryTimeline: group.summaryTimeline,
            modeSpecificData: group.modeSpecificData
        }))
    };
}

export async function buildSegmentsHistoryExport(session) {
    const detail = await buildHistorySessionDetail(session);
    return {
        exported_at: new Date().toISOString(),
        export_type: "segments",
        session: detail.session,
        groups: detail.groups.map((group) => ({
            groupNumber: group.groupNumber,
            segments: group.segments,
            transcriptStats: group.transcriptStats
        }))
    };
}
