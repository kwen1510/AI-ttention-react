import { v4 as uuid } from "uuid";
import { db } from "../db/db.js";
import { activeSessions } from "./state.js";

function normalizeGroupNumber(groupNumber) {
    const parsed = Number(groupNumber);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function getMemoryReleaseMap(sessionCode) {
    const normalizedCode = String(sessionCode || "").trim().toUpperCase();
    if (!normalizedCode) {
        return {};
    }

    const sessionState = activeSessions.get(normalizedCode);
    const releaseMap = sessionState?.summaryReleasedGroups;
    return releaseMap && typeof releaseMap === "object" ? { ...releaseMap } : {};
}

function setMemoryReleaseMap(sessionCode, nextMap) {
    const normalizedCode = String(sessionCode || "").trim().toUpperCase();
    if (!normalizedCode) {
        return;
    }

    const sessionState = activeSessions.get(normalizedCode);
    if (!sessionState) {
        return;
    }

    activeSessions.set(normalizedCode, {
        ...sessionState,
        summaryReleasedGroups: { ...nextMap }
    });
}

async function loadPersistedReleaseMap(sessionId) {
    if (!sessionId) {
        return {};
    }

    const logs = await db.collection("session_logs")
        .find({ session_id: sessionId, type: "summary_release" })
        .sort({ created_at: 1 })
        .toArray();

    const releaseMap = {};
    for (const log of logs) {
        const groupNumber = normalizeGroupNumber(log?.ai_response?.groupNumber ?? log?.ai_response?.group);
        if (!groupNumber) {
            continue;
        }

        releaseMap[groupNumber] = Boolean(log?.ai_response?.isReleased);
    }

    return releaseMap;
}

export async function getSummaryReleaseMap({ sessionCode = "", sessionId = null } = {}) {
    const memoryMap = getMemoryReleaseMap(sessionCode);
    const normalizedCode = String(sessionCode || "").trim().toUpperCase();
    if (activeSessions.has(normalizedCode) && Object.prototype.hasOwnProperty.call(activeSessions.get(normalizedCode) || {}, "summaryReleasedGroups")) {
        return memoryMap;
    }

    if (!sessionId) {
        return memoryMap;
    }

    const persistedMap = await loadPersistedReleaseMap(sessionId);
    if (normalizedCode) {
        setMemoryReleaseMap(normalizedCode, persistedMap);
    }

    return persistedMap;
}

export async function isSummaryReleased({ sessionCode = "", sessionId = null, groupNumber } = {}) {
    const normalizedGroup = normalizeGroupNumber(groupNumber);
    if (!normalizedGroup) {
        return false;
    }

    const releaseMap = await getSummaryReleaseMap({ sessionCode, sessionId });
    return Boolean(releaseMap[normalizedGroup]);
}

export async function recordSummaryRelease({ sessionCode = "", sessionId = null, groupNumber, isReleased = true } = {}) {
    const normalizedGroup = normalizeGroupNumber(groupNumber);
    if (!normalizedGroup) {
        throw new Error("Invalid group number");
    }

    const normalizedCode = String(sessionCode || "").trim().toUpperCase();
    const nextReleased = Boolean(isReleased);
    const timestamp = Date.now();

    const nextMap = {
        ...getMemoryReleaseMap(normalizedCode),
        [normalizedGroup]: nextReleased
    };

    if (normalizedCode) {
        setMemoryReleaseMap(normalizedCode, nextMap);
    }

    if (sessionId) {
        await db.collection("session_logs").insertOne({
            _id: uuid(),
            session_id: sessionId,
            type: "summary_release",
            content: nextReleased
                ? `Released summary for group ${normalizedGroup}`
                : `Unreleased summary for group ${normalizedGroup}`,
            ai_response: {
                groupNumber: normalizedGroup,
                isReleased: nextReleased
            },
            created_at: timestamp
        });
    }

    return {
        groupNumber: normalizedGroup,
        isReleased: nextReleased,
        timestamp
    };
}
