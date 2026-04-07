import { supabase } from "../db/supabaseClient.js";

let authTestOverrides = null;

function createAuthError(message, status = 401) {
    const error = new Error(message);
    error.status = status;
    return error;
}

function parseCsvValues(...sources) {
    return sources
        .filter(Boolean)
        .flatMap((source) => String(source).split(','))
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean);
}

export function getTeacherAccessConfig() {
    const allowedDomains = parseCsvValues(
        process.env.ADMIN_ALLOWED_DOMAINS,
        process.env.VITE_ADMIN_ALLOWED_DOMAINS
    );

    const allowedEmails = parseCsvValues(
        process.env.ADMIN_ALLOWED_EMAILS,
        process.env.VITE_ADMIN_ALLOWED_EMAILS
    );

    return {
        allowedDomains: allowedDomains.length ? allowedDomains : ['ri.edu.sg'],
        allowedEmails
    };
}

export function isLegacyTeacherAllowlistEnabled() {
    if (typeof process.env.ALLOW_LEGACY_TEACHER_ALLOWLIST === "string") {
        return process.env.ALLOW_LEGACY_TEACHER_ALLOWLIST === "true";
    }

    return true;
}

export function isTeacherUser(user, config = getTeacherAccessConfig()) {
    const email = user?.email ? String(user.email).trim().toLowerCase() : '';
    if (!email) {
        return false;
    }

    if (config.allowedEmails.includes(email)) {
        return true;
    }

    return config.allowedDomains.some((domain) => email.endsWith(`@${domain}`));
}

export async function authenticateUserFromToken(token) {
    if (authTestOverrides?.authenticateUserFromToken) {
        return authTestOverrides.authenticateUserFromToken(token);
    }

    if (!token) {
        throw createAuthError('Missing bearer token', 401);
    }

    const { data, error } = await supabase.auth.getUser(token);
    if (error) {
        throw createAuthError(error.message || 'Invalid token', 401);
    }
    if (!data?.user) {
        throw createAuthError('User not found for token', 401);
    }
    return data.user;
}

export async function lookupTeacherAccessRecord(user) {
    if (authTestOverrides?.lookupTeacherAccessRecord) {
        return authTestOverrides.lookupTeacherAccessRecord(user);
    }

    const { data, error } = await supabase
        .from("teacher_access")
        .select("user_id,email,role,active,created_at,updated_at")
        .eq("user_id", user.id)
        .maybeSingle();

    if (error) {
        throw error;
    }

    return data;
}

function buildTeacherPrincipal(user, accessRecord) {
    return {
        ...user,
        role: accessRecord?.role || "teacher",
        teacherAccess: accessRecord
            ? {
                user_id: accessRecord.user_id,
                email: accessRecord.email,
                role: accessRecord.role,
                active: accessRecord.active,
                created_at: accessRecord.created_at,
                updated_at: accessRecord.updated_at,
                source: "table"
            }
            : {
                user_id: user.id,
                email: user.email,
                role: "teacher",
                active: true,
                source: "legacy"
            }
    };
}

function canUseLegacyTeacherFallback(user) {
    return isLegacyTeacherAllowlistEnabled() && isTeacherUser(user);
}

export async function authorizeTeacherUser(user) {
    try {
        const accessRecord = await lookupTeacherAccessRecord(user);

        if (accessRecord?.active) {
            return buildTeacherPrincipal(user, accessRecord);
        }

        if (accessRecord && accessRecord.active === false) {
            throw createAuthError("Teacher access required", 403);
        }
    } catch (error) {
        if (canUseLegacyTeacherFallback(user)) {
            console.warn("⚠️ Falling back to legacy teacher allowlist:", error.message);
            return buildTeacherPrincipal(user, null);
        }

        if (error?.status) {
            throw error;
        }

        console.error("❌ Failed to resolve teacher_access record:", error);
        throw createAuthError("Teacher access unavailable", 503);
    }

    if (canUseLegacyTeacherFallback(user)) {
        return buildTeacherPrincipal(user, null);
    }

    throw createAuthError("Teacher access required", 403);
}

export async function authenticateTeacherFromToken(token) {
    const user = await authenticateUserFromToken(token);
    return authorizeTeacherUser(user);
}

export function extractBearerToken(authHeader = "") {
    if (!authHeader.startsWith("Bearer ")) {
        return null;
    }

    return authHeader.replace("Bearer", "").trim();
}

export async function authenticateTeacher(req) {
    if (req.teacher) {
        return req.teacher;
    }

    if (req.teacherAuthError) {
        throw req.teacherAuthError;
    }

    const token = req.authToken || extractBearerToken(req.headers.authorization || "");
    if (!token) {
        throw createAuthError("Missing bearer token", 401);
    }

    const teacher = await authenticateTeacherFromToken(token);
    req.teacher = teacher;
    req.authToken = token;
    req.teacherAuthError = null;
    return teacher;
}

export async function optionalTeacherContext(req, _res, next) {
    if (req.teacher || req.teacherAuthError) {
        if (next) next();
        return;
    }

    const token = extractBearerToken(req.headers.authorization || "");
    req.authToken = token;
    req.teacher = null;
    req.teacherAuthError = null;

    if (!token) {
        if (next) next();
        return;
    }

    try {
        req.teacher = await authenticateTeacherFromToken(token);
    } catch (error) {
        req.teacherAuthError = error;
    }

    if (next) next();
}

export async function requireTeacher(req, res, next) {
    try {
        const user = await authenticateTeacher(req);
        req.teacher = user;
        if (next) next();
        return user;
    } catch (err) {
        console.warn(`🔒 Teacher authentication failed: ${err.message}`);
        const status = Number.isInteger(err.status) ? err.status : 401;
        const message = status === 403
            ? "Forbidden"
            : status >= 500
                ? "Teacher access unavailable"
                : "Unauthorized";
        res.status(status).json({ error: message });
        return null;
    }
}

export function __setAuthTestOverrides(overrides) {
    authTestOverrides = overrides || null;
}
