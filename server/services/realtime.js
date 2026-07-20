import { supabase } from "../db/supabaseClient.js";
import { createHmac } from "crypto";

export const REALTIME_EVENTS = Object.freeze({
    ADMIN_UPDATE: "admin_update",
    CHECKBOX_UPDATE: "checkbox_update",
    CHECKLIST_STATE: "checklist_state",
    RECORD_NOW: "record_now",
    SESSION_ENDED: "session_ended",
    STOP_RECORDING: "stop_recording",
    STUDENT_JOINED: "student_joined",
    STUDENT_LEFT: "student_left",
    SUMMARY_STATE: "summary_state",
    TRANSCRIPTION_AND_SUMMARY: "transcription_and_summary",
    UPLOAD_ERROR: "upload_error",
    UPLOAD_STATUS: "upload_status"
});

const TOPIC_PREFIX = "classroom";
const DEFAULT_BROADCAST_TIMEOUT_MS = 5_000;
let realtimeTestPublisher = null;

export function normalizeSessionCode(value) {
    return String(value || "").trim().toUpperCase();
}

export function normalizeGroupNumber(value) {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 && parsed <= 99 ? parsed : null;
}

export function buildSessionRealtimeTopic(sessionCode) {
    const normalizedCode = normalizeSessionCode(sessionCode);
    if (!normalizedCode) {
        throw new Error("Session code is required");
    }

    const secret = String(process.env.SESSION_JOIN_SECRET || "");
    if (process.env.NODE_ENV === "production" && secret.length < 32) {
        throw new Error("SESSION_JOIN_SECRET must be at least 32 characters for realtime topics");
    }
    const capability = createHmac("sha256", secret || "development-realtime-topic-secret")
        .update(normalizedCode)
        .digest("base64url")
        .slice(0, 32);
    return `${TOPIC_PREFIX}:${capability}:teacher`;
}

export function buildStudentRealtimeTopic(sessionCode) {
    return buildSessionRealtimeTopic(sessionCode).replace(/:teacher$/, ":students");
}

export function buildGroupRealtimeTopic(sessionCode, groupNumber) {
    const parsedGroup = normalizeGroupNumber(groupNumber);
    if (!parsedGroup) {
        throw new Error("Group number is required");
    }

  return buildSessionRealtimeTopic(sessionCode).replace(/:teacher$/, `:group:${parsedGroup}`);
}

export function buildRealtimeTopics({ sessionCode, groupNumber, audience = "session" } = {}) {
    if (audience === "students") {
        return [buildStudentRealtimeTopic(sessionCode)];
    }

    if (audience === "all") {
        return [buildSessionRealtimeTopic(sessionCode), buildStudentRealtimeTopic(sessionCode)];
    }
    if (audience === "group") {
        return [buildGroupRealtimeTopic(sessionCode, groupNumber)];
    }

    if (audience === "both") {
        return [
            buildSessionRealtimeTopic(sessionCode),
            buildGroupRealtimeTopic(sessionCode, groupNumber)
        ];
    }

    return [buildSessionRealtimeTopic(sessionCode)];
}

function shouldSkipRealtimePublish() {
    if (process.env.SUPABASE_REALTIME_DISABLED === "true") {
        return true;
    }

    return process.env.NODE_ENV === "test" && !realtimeTestPublisher;
}

async function sendBroadcast(topic, event, envelope) {
    if (realtimeTestPublisher) {
        return realtimeTestPublisher({ topic, event, payload: envelope });
    }

    if (shouldSkipRealtimePublish()) {
        return { skipped: true };
    }

    const channel = supabase.channel(topic, {
        config: {
            broadcast: { ack: false, self: false },
            private: true
        }
    });

    try {
        if (typeof channel.httpSend === "function") {
            return channel.httpSend(event, envelope, {
                timeout: Number(process.env.SUPABASE_REALTIME_TIMEOUT_MS) || DEFAULT_BROADCAST_TIMEOUT_MS
            });
        }

        return channel.send({
            type: "broadcast",
            event,
            payload: envelope
        }, {
            timeout: Number(process.env.SUPABASE_REALTIME_TIMEOUT_MS) || DEFAULT_BROADCAST_TIMEOUT_MS
        });
    } finally {
        await supabase.removeChannel(channel);
    }
}

export async function publishRealtimeEvent({
    sessionCode,
    groupNumber,
    event,
    payload = {},
    audience = "session",
    timestamp = Date.now()
} = {}) {
    if (!event) {
        throw new Error("Realtime event is required");
    }

    const normalizedCode = normalizeSessionCode(sessionCode);
    const parsedGroup = normalizeGroupNumber(groupNumber);
    const topics = buildRealtimeTopics({
        sessionCode: normalizedCode,
        groupNumber: parsedGroup,
        audience
    });
    const envelope = {
        type: event,
        sessionCode: normalizedCode,
        groupNumber: parsedGroup,
        timestamp,
        payload
    };

    const results = await Promise.allSettled(
        topics.map((topic) => sendBroadcast(topic, event, envelope))
    );

    results.forEach((result) => {
        if (result.status === "rejected") {
            console.warn("⚠️ Supabase Realtime publish failed:", result.reason?.message || result.reason);
        }
    });

    return {
        envelope,
        topics,
        results
    };
}

export function __setRealtimeTestPublisher(publisher) {
    realtimeTestPublisher = typeof publisher === "function" ? publisher : null;
}
