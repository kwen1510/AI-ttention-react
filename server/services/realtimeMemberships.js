import { supabase } from "../db/supabaseClient.js";

let membershipTestOverride = null;

function membershipError(message, status = 403) {
    const error = new Error(message);
    error.status = status;
    return error;
}

function normalizeExpiry(value) {
    const parsed = new Date(value || Date.now() + 60 * 60 * 1000);
    if (Number.isNaN(parsed.getTime())) throw new Error("A valid Realtime membership expiry is required");
    return parsed.toISOString();
}

export async function grantRealtimeTopics({ userId, sessionCode, topics, audience, groupNumber, expiresAt }) {
    const uniqueTopics = [...new Set((topics || []).filter(Boolean))];
    if (!userId || !sessionCode || !uniqueTopics.length) {
        throw new Error("Realtime user, session, and topics are required");
    }

    if (audience === "student") {
        await assertStudentGroupMayBeGranted({ userId, sessionCode, groupNumber });
    }

    const rows = uniqueTopics.map((topic) => ({
        user_id: userId,
        session_code: String(sessionCode).trim().toUpperCase(),
        topic,
        audience,
        group_number: groupNumber || null,
        expires_at: normalizeExpiry(expiresAt),
        revoked_at: null
    }));

    if (membershipTestOverride) return membershipTestOverride.grant?.(rows) ?? rows;
    if (process.env.NODE_ENV === "test") return rows;

    const { error } = await supabase
        .from("classroom_realtime_memberships")
        .upsert(rows, { onConflict: "user_id,session_code,topic" });
    if (error) throw error;
    return rows;
}

export async function assertStudentGroupMayBeGranted({ userId, sessionCode, groupNumber }) {
    const normalizedCode = String(sessionCode || "").trim().toUpperCase();
    const parsedGroup = Number(groupNumber);
    if (!userId || !normalizedCode || !Number.isInteger(parsedGroup) || parsedGroup < 1) {
        throw membershipError("A valid student membership is required", 400);
    }
    if (membershipTestOverride?.assertGrant) {
        return membershipTestOverride.assertGrant({ userId, sessionCode: normalizedCode, groupNumber: parsedGroup });
    }
    if (process.env.NODE_ENV === "test") return true;

    const { data, error } = await supabase
        .from("classroom_realtime_memberships")
        .select("group_number")
        .eq("user_id", userId)
        .eq("session_code", normalizedCode)
        .eq("audience", "student")
        .is("revoked_at", null)
        .gt("expires_at", new Date().toISOString())
        .limit(1);
    if (error) throw error;
    const existingGroup = Number(data?.[0]?.group_number);
    if (Number.isInteger(existingGroup) && existingGroup !== parsedGroup) {
        throw membershipError("This student identity is already assigned to another group");
    }
    return true;
}

export async function assertStudentRealtimeMembership({ userId, sessionCode, groupNumber }) {
    const normalizedCode = String(sessionCode || "").trim().toUpperCase();
    const parsedGroup = Number(groupNumber);
    if (!userId || !normalizedCode || !Number.isInteger(parsedGroup) || parsedGroup < 1) {
        throw membershipError("A valid student membership is required", 400);
    }
    if (membershipTestOverride?.assertMembership) {
        return membershipTestOverride.assertMembership({ userId, sessionCode: normalizedCode, groupNumber: parsedGroup });
    }
    if (process.env.NODE_ENV === "test") return true;

    const { data, error } = await supabase
        .from("classroom_realtime_memberships")
        .select("id")
        .eq("user_id", userId)
        .eq("session_code", normalizedCode)
        .eq("audience", "student")
        .eq("group_number", parsedGroup)
        .is("revoked_at", null)
        .gt("expires_at", new Date().toISOString())
        .limit(1)
        .maybeSingle();
    if (error) throw error;
    if (!data) throw membershipError("Student group access denied");
    return true;
}

export async function revokeSessionRealtimeMemberships(sessionCode, revokedAt = new Date().toISOString()) {
    const normalizedCode = String(sessionCode || "").trim().toUpperCase();
    if (!normalizedCode) return;
    if (membershipTestOverride) return membershipTestOverride.revoke?.(normalizedCode, revokedAt);
    if (process.env.NODE_ENV === "test") return;

    const { error } = await supabase
        .from("classroom_realtime_memberships")
        .update({ revoked_at: revokedAt })
        .eq("session_code", normalizedCode)
        .is("revoked_at", null);
    if (error) throw error;
}

export async function extendSessionRealtimeMemberships(sessionCode, expiresAt) {
    const normalizedCode = String(sessionCode || "").trim().toUpperCase();
    if (!normalizedCode) return;
    const normalizedExpiry = normalizeExpiry(expiresAt);
    if (membershipTestOverride) return membershipTestOverride.extend?.(normalizedCode, normalizedExpiry);
    if (process.env.NODE_ENV === "test") return;

    const { error } = await supabase
        .from("classroom_realtime_memberships")
        .update({ expires_at: normalizedExpiry })
        .eq("session_code", normalizedCode)
        .is("revoked_at", null);
    if (error) throw error;
}

export async function deleteSessionRealtimeMemberships(sessionCode) {
    const normalizedCode = String(sessionCode || "").trim().toUpperCase();
    if (!normalizedCode) return;
    if (membershipTestOverride) return membershipTestOverride.delete?.(normalizedCode);
    if (process.env.NODE_ENV === "test") return;

    const { error } = await supabase
        .from("classroom_realtime_memberships")
        .delete()
        .eq("session_code", normalizedCode);
    if (error) throw error;
}

export function __setRealtimeMembershipTestOverride(override) {
    membershipTestOverride = override || null;
}
