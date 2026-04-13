import { db } from "../db/db.js";
import {
    findAuthUserByEmail,
    isAdminUser,
    lookupTeacherAccessRecordByEmail,
    lookupTeacherAccessRecordsByUserIds,
    normalizeEmail,
    listAuthUsersByIds
} from "../middleware/auth.js";
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

function buildOwnerMetadata(ownerId, accessRecord, authUser) {
    if (!ownerId) {
        return null;
    }

    const email = normalizeEmail(accessRecord?.email || authUser?.email);
    const role = accessRecord?.role || (authUser?.email ? "teacher" : null);

    if (!email && !role) {
        return {
            id: ownerId,
            email: null,
            role: null
        };
    }

    return {
        id: ownerId,
        email: email || null,
        role
    };
}

async function buildOwnerMetadataMap(ownerIds = []) {
    const ids = [...new Set((ownerIds || []).filter(Boolean))];
    const owners = new Map();
    if (!ids.length) {
        return owners;
    }

    let accessRecordsById = new Map();
    try {
        const accessRecords = await lookupTeacherAccessRecordsByUserIds(ids);
        accessRecordsById = new Map(accessRecords.map((record) => [record.user_id, record]));
    } catch (error) {
        console.warn("⚠️ Failed to load teacher_access owner metadata:", error.message);
    }

    let authUsersById = new Map();
    try {
        authUsersById = await listAuthUsersByIds(ids);
    } catch (error) {
        console.warn("⚠️ Failed to load auth owner metadata:", error.message);
    }

    ids.forEach((ownerId) => {
        owners.set(
            ownerId,
            buildOwnerMetadata(ownerId, accessRecordsById.get(ownerId), authUsersById.get(ownerId))
        );
    });

    return owners;
}

async function resolveOwnerIdsForEmail(email) {
    const normalizedOwnerEmail = normalizeEmail(email);
    if (!normalizedOwnerEmail) {
        return [];
    }

    const ownerIds = new Set();

    try {
        const accessRecord = await lookupTeacherAccessRecordByEmail(normalizedOwnerEmail);
        if (accessRecord?.user_id) {
            ownerIds.add(accessRecord.user_id);
        }
    } catch (error) {
        console.warn("⚠️ Failed to resolve teacher_access owner filter:", error.message);
    }

    try {
        const authUser = await findAuthUserByEmail(normalizedOwnerEmail);
        if (authUser?.id) {
            ownerIds.add(authUser.id);
        }
    } catch (error) {
        console.warn("⚠️ Failed to resolve auth owner filter:", error.message);
    }

    return [...ownerIds];
}

async function buildSessionListItem(session, ownerMetadata = null) {
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
        totalTranscripts,
        owner: ownerMetadata
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

function buildSessionEnvelope(session, groups, modeSpecificData = null, ownerMetadata = null) {
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
        modeSpecificData,
        owner: ownerMetadata
    };
}

export function canAccessHistorySession(teacher, session) {
    if (!teacher || !session) {
        return false;
    }

    return isAdminUser(teacher) || session.owner_id === teacher.id;
}

function normalizePaginationValue(value, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
        return fallback;
    }
    return Math.min(Math.max(parsed, min), max);
}

export async function getHistorySessionOrThrow(teacher, sessionCode) {
    const session = await db.collection("sessions").findOne({ code: sessionCode });
    if (!session) {
        throw createHttpError("Session not found", 404);
    }
    if (!canAccessHistorySession(teacher, session)) {
        throw createHttpError("Forbidden", 403);
    }
    return session;
}

export async function listHistorySessions({ teacher, mode = "", owner = "", offset = 0, limit = 20 }) {
    const normalizedOffset = normalizePaginationValue(offset, 0);
    const normalizedLimit = normalizePaginationValue(limit, 20, { min: 1, max: 100 });
    const filter = {};

    if (mode) {
        filter.mode = mode;
    }

    if (isAdminUser(teacher)) {
        const normalizedOwner = normalizeEmail(owner);
        if (normalizedOwner) {
            const ownerIds = await resolveOwnerIdsForEmail(normalizedOwner);
            if (!ownerIds.length) {
                return {
                    sessions: [],
                    pagination: buildPagination(0, normalizedOffset, normalizedLimit, 0)
                };
            }
            filter.owner_id = ownerIds.length === 1 ? ownerIds[0] : { $in: ownerIds };
        }
    } else {
        if (normalizeEmail(owner)) {
            throw createHttpError("Forbidden", 403);
        }
        filter.owner_id = teacher.id;
    }

    const total = await db.collection("sessions").countDocuments(filter);
    const sessions = await db.collection("sessions")
        .find(filter)
        .sort({ created_at: -1 })
        .skip(normalizedOffset)
        .limit(normalizedLimit)
        .toArray();

    const ownerMap = await buildOwnerMetadataMap(sessions.map((session) => session.owner_id));
    const items = await Promise.all(
        sessions.map((session) => buildSessionListItem(session, ownerMap.get(session.owner_id) || null))
    );

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
    const ownerMap = await buildOwnerMetadataMap([session.owner_id]);

    return {
        session: buildSessionEnvelope(
            session,
            historyGroups,
            sessionModeSpecificData,
            ownerMap.get(session.owner_id) || null
        ),
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

export async function getOwnedSessionOrThrow(teacherId, sessionCode) {
    return getHistorySessionOrThrow({ id: teacherId, role: "teacher" }, sessionCode);
}

export async function listOwnedHistorySessions({ teacherId, mode = "", offset = 0, limit = 20 }) {
    return listHistorySessions({
        teacher: { id: teacherId, role: "teacher" },
        mode,
        offset,
        limit
    });
}
