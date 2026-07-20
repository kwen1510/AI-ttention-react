import { createSupabaseAuthClient, supabase } from "../db/supabaseClient.js";
import { clearTeacherSessionCookie, readTeacherSessionCookie, setTeacherSessionCookie, verifyTeacherSessionToken } from "../services/teacherSessionCookie.js";

let authTestOverrides = null;
let stagingBypassTeacherPromise = null;
const STAGING_BYPASS_HEADER = "x-staging-auth-bypass";
const TEACHER_ACCESS_COLUMNS = "user_id,email,role,active,created_at,updated_at";

function createAuthError(message, status = 401) {
    const error = new Error(message);
    error.status = status;
    return error;
}

export function normalizeEmail(value) {
    return String(value || "").trim().toLowerCase();
}

export function isAdminRole(role) {
    return normalizeEmail(role) === "admin";
}

export function isAdminUser(user) {
    return isAdminRole(user?.role || user?.teacherAccess?.role);
}

export function isGuestUser(user) {
    return normalizeEmail(user?.role || user?.teacherAccess?.role) === "guest";
}

function parseCsvValues(...sources) {
    return sources
        .filter(Boolean)
        .flatMap((source) => String(source).split(","))
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean);
}

function normalizeTeacherAccessRecord(record) {
    if (!record) {
        return null;
    }

    return {
        ...record,
        email: normalizeEmail(record.email),
        role: normalizeEmail(record.role) || "teacher"
    };
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
        allowedDomains: allowedDomains.length ? allowedDomains : ["ri.edu.sg"],
        allowedEmails
    };
}

export function isLegacyTeacherAllowlistEnabled() {
    if (typeof process.env.ALLOW_LEGACY_TEACHER_ALLOWLIST === "string") {
        return process.env.ALLOW_LEGACY_TEACHER_ALLOWLIST === "true";
    }

    return process.env.NODE_ENV !== "production";
}

export function isTeacherUser(user, config = getTeacherAccessConfig()) {
    const email = normalizeEmail(user?.email);
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
        throw createAuthError("Missing bearer token", 401);
    }

    const { data, error } = await supabase.auth.getUser(token);
    if (error) {
        throw createAuthError(error.message || "Invalid token", 401);
    }
    if (!data?.user) {
        throw createAuthError("User not found for token", 401);
    }
    return data.user;
}

export async function lookupTeacherAccessRecordByUserId(userId) {
    if (authTestOverrides?.lookupTeacherAccessRecordByUserId) {
        return normalizeTeacherAccessRecord(await authTestOverrides.lookupTeacherAccessRecordByUserId(userId));
    }

    if (!userId) {
        return null;
    }

    const { data, error } = await supabase
        .from("teacher_access")
        .select(TEACHER_ACCESS_COLUMNS)
        .eq("user_id", userId)
        .maybeSingle();

    if (error) {
        throw error;
    }

    return normalizeTeacherAccessRecord(data);
}

export async function lookupTeacherAccessRecordByEmail(email) {
    if (authTestOverrides?.lookupTeacherAccessRecordByEmail) {
        return normalizeTeacherAccessRecord(await authTestOverrides.lookupTeacherAccessRecordByEmail(email));
    }

    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) {
        return null;
    }

    const { data, error } = await supabase
        .from("teacher_access")
        .select(TEACHER_ACCESS_COLUMNS)
        .ilike("email", normalizedEmail)
        .maybeSingle();

    if (error) {
        throw error;
    }

    return normalizeTeacherAccessRecord(data);
}

export async function lookupTeacherAccessRecord(user) {
    if (authTestOverrides?.lookupTeacherAccessRecord) {
        return normalizeTeacherAccessRecord(await authTestOverrides.lookupTeacherAccessRecord(user));
    }

    return lookupTeacherAccessRecordByUserId(user?.id);
}

export async function lookupTeacherAccessRecordsByUserIds(userIds = []) {
    if (authTestOverrides?.lookupTeacherAccessRecordsByUserIds) {
        const records = await authTestOverrides.lookupTeacherAccessRecordsByUserIds(userIds);
        return Array.isArray(records) ? records.map(normalizeTeacherAccessRecord).filter(Boolean) : [];
    }

    const ids = [...new Set((userIds || []).filter(Boolean))];
    if (!ids.length) {
        return [];
    }

    const { data, error } = await supabase
        .from("teacher_access")
        .select(TEACHER_ACCESS_COLUMNS)
        .in("user_id", ids);

    if (error) {
        throw error;
    }

    return (data || []).map(normalizeTeacherAccessRecord).filter(Boolean);
}

export async function syncTeacherAccessRecord(record, user, matchField = "email") {
    if (authTestOverrides?.syncTeacherAccessRecord) {
        return normalizeTeacherAccessRecord(await authTestOverrides.syncTeacherAccessRecord(record, user, matchField));
    }

    if (!record) {
        return null;
    }

    const normalizedRecord = normalizeTeacherAccessRecord(record);
    const normalizedEmail = normalizeEmail(user?.email || normalizedRecord.email);
    const nextUserId = user?.id || normalizedRecord.user_id || null;
    const patch = {};

    if (normalizedEmail && normalizedRecord.email !== normalizedEmail) {
        patch.email = normalizedEmail;
    }

    if (nextUserId && normalizedRecord.user_id !== nextUserId) {
        patch.user_id = nextUserId;
    }

    if (!Object.keys(patch).length) {
        return normalizedRecord;
    }

    const { data, error } = await supabase
        .from("teacher_access")
        .update({
            ...patch,
            updated_at: new Date().toISOString()
        })
        .eq(matchField, matchField === "email" ? normalizedRecord.email : normalizedRecord.user_id)
        .select(TEACHER_ACCESS_COLUMNS)
        .maybeSingle();

    if (error) {
        throw error;
    }

    return normalizeTeacherAccessRecord(data || { ...normalizedRecord, ...patch });
}

export async function findAuthUserByEmail(email) {
    if (authTestOverrides?.findAuthUserByEmail) {
        return authTestOverrides.findAuthUserByEmail(email);
    }

    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) {
        return null;
    }

    let page = 1;
    while (page <= 10) {
        const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
        if (error) {
            throw error;
        }

        const match = data?.users?.find((user) => normalizeEmail(user.email) === normalizedEmail);
        if (match) {
            return match;
        }

        if (!data?.nextPage || page >= Number(data.lastPage || 0)) {
            break;
        }

        page = data.nextPage;
    }

    return null;
}

export async function listAuthUsersByIds(userIds = []) {
    if (authTestOverrides?.listAuthUsersByIds) {
        return authTestOverrides.listAuthUsersByIds(userIds);
    }

    const remainingIds = new Set((userIds || []).filter(Boolean));
    const usersById = new Map();
    if (!remainingIds.size) {
        return usersById;
    }

    let page = 1;
    while (page <= 10 && remainingIds.size > 0) {
        const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
        if (error) {
            throw error;
        }

        for (const user of data?.users || []) {
            if (remainingIds.has(user.id)) {
                usersById.set(user.id, user);
                remainingIds.delete(user.id);
            }
        }

        if (!data?.nextPage || page >= Number(data.lastPage || 0)) {
            break;
        }

        page = data.nextPage;
    }

    return usersById;
}

function buildTeacherPrincipal(user, accessRecord, source = "legacy") {
    const record = normalizeTeacherAccessRecord(accessRecord);
    const role = record?.role || "teacher";
    const email = normalizeEmail(record?.email || user?.email);

    return {
        ...user,
        email,
        role,
        isAdmin: isAdminRole(role),
        teacherAccess: record
            ? {
                user_id: record.user_id || user.id,
                email,
                role,
                active: record.active,
                created_at: record.created_at,
                updated_at: record.updated_at,
                source
            }
            : {
                user_id: user.id,
                email,
                role: "teacher",
                active: true,
                source
            }
    };
}

function canUseLegacyTeacherFallback(user) {
    return isLegacyTeacherAllowlistEnabled() && isTeacherUser(user);
}

async function safelySyncTeacherAccessRecord(record, user, matchField) {
    try {
        return await syncTeacherAccessRecord(record, user, matchField);
    } catch (error) {
        console.warn("⚠️ Failed to sync teacher_access identity:", error.message);
        return normalizeTeacherAccessRecord(record);
    }
}

export async function authorizeTeacherUser(user) {
    try {
        const accessByUserId = await lookupTeacherAccessRecordByUserId(user?.id);
        if (accessByUserId) {
            if (accessByUserId.active === false) {
                throw createAuthError("Teacher access required", 403);
            }

            const syncedRecord = await safelySyncTeacherAccessRecord(accessByUserId, user, "user_id");
            return buildTeacherPrincipal(user, syncedRecord, "table-user");
        }

        const accessByEmail = await lookupTeacherAccessRecordByEmail(user?.email);
        if (accessByEmail) {
            if (accessByEmail.active === false) {
                throw createAuthError("Teacher access required", 403);
            }

            const syncedRecord = await safelySyncTeacherAccessRecord(accessByEmail, user, "email");
            return buildTeacherPrincipal(user, syncedRecord, "table-email");
        }
    } catch (error) {
        if (error?.status === 403) {
            throw error;
        }

        if (canUseLegacyTeacherFallback(user)) {
            console.warn("⚠️ Falling back to legacy teacher allowlist:", error.message);
            return buildTeacherPrincipal(user, null, "legacy");
        }

        console.error("❌ Failed to resolve teacher_access record:", error);
        throw createAuthError("Teacher access unavailable", 503);
    }

    if (canUseLegacyTeacherFallback(user)) {
        return buildTeacherPrincipal(user, null, "legacy");
    }

    throw createAuthError("Teacher access required", 403);
}

export async function isTeacherEmailAllowedForLogin(email) {
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) return false;

    try {
        const record = await lookupTeacherAccessRecordByEmail(normalizedEmail);
        if (record) return record.active !== false;
    } catch (error) {
        console.warn("⚠️ Unable to check teacher_access before OTP send:", error.message);
    }

    return isLegacyTeacherAllowlistEnabled() && isTeacherUser({ email: normalizedEmail });
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

export function isStagingAuthBypassEnabled() {
    if (process.env.NODE_ENV === "production") {
        return false;
    }

    return process.env.STAGING_AUTH_BYPASS === "true";
}

function readHeaderValue(headers, name) {
    const value = headers?.[name];
    if (Array.isArray(value)) {
        return value[0] || "";
    }
    return String(value || "");
}

async function resolveStagingBypassTeacherIdentity() {
    const email = process.env.STAGING_BYPASS_TEACHER_EMAIL || "staging-teacher@example.com";
    const configuredUserId = String(process.env.STAGING_BYPASS_TEACHER_ID || "").trim();

    if (process.env.NODE_ENV === "test" || authTestOverrides) {
        return {
            id: configuredUserId || "00000000-0000-4000-8000-000000000001",
            email
        };
    }

    if (configuredUserId) {
        return {
            id: configuredUserId,
            email
        };
    }

    if (!stagingBypassTeacherPromise) {
        stagingBypassTeacherPromise = (async () => {
            const existingUser = await findAuthUserByEmail(email);
            if (existingUser?.id) {
                return {
                    id: existingUser.id,
                    email: existingUser.email || email
                };
            }

            const { data, error } = await supabase.auth.admin.createUser({
                email,
                email_confirm: true,
                user_metadata: {
                    stagingBypass: true
                },
                app_metadata: {
                    role: "teacher",
                    stagingBypass: true
                }
            });

            if (error) {
                const existingAfterError = await findAuthUserByEmail(email);
                if (existingAfterError?.id) {
                    return {
                        id: existingAfterError.id,
                        email: existingAfterError.email || email
                    };
                }

                throw error;
            }

            return {
                id: data.user.id,
                email: data.user.email || email
            };
        })().catch((error) => {
            stagingBypassTeacherPromise = null;
            throw error;
        });
    }

    return stagingBypassTeacherPromise;
}

export async function createStagingBypassTeacherPrincipal() {
    const identity = await resolveStagingBypassTeacherIdentity();

    return {
        id: identity.id,
        email: identity.email,
        role: "teacher",
        isAdmin: false,
        teacherAccess: {
            user_id: identity.id,
            email: normalizeEmail(identity.email),
            role: "teacher",
            active: true,
            source: "staging-bypass"
        }
    };
}

export async function authenticateStagingBypassRequest(req) {
    if (!isStagingAuthBypassEnabled()) {
        return null;
    }

    const bypassRole = readHeaderValue(req?.headers, STAGING_BYPASS_HEADER).trim().toLowerCase();
    if (bypassRole !== "teacher") {
        return null;
    }

    return createStagingBypassTeacherPrincipal();
}

function jwtExpiresSoon(token, leewaySeconds = 60) {
    try {
        const payload = JSON.parse(Buffer.from(String(token).split(".")[1], "base64url").toString("utf8"));
        return !Number.isFinite(payload.exp) || payload.exp <= Math.floor(Date.now() / 1000) + leewaySeconds;
    } catch {
        return true;
    }
}

async function authenticateTeacherFromCookie(cookieClaims, res) {
    let accessToken = cookieClaims?.access_token;
    let session = null;

    if (accessToken && jwtExpiresSoon(accessToken) && cookieClaims.refresh_token) {
        const { data, error } = await createSupabaseAuthClient().auth.refreshSession({
            refresh_token: cookieClaims.refresh_token
        });
        if (error || !data?.session) {
            if (res) clearTeacherSessionCookie(res);
            throw createAuthError("Teacher session expired", 401);
        }
        session = data.session;
        accessToken = session.access_token;
    }

    // Tests and local staging may use identity-only cookies. Production must
    // always be backed by a refreshable Supabase Auth session.
    const teacher = accessToken
        ? await authenticateTeacherFromToken(accessToken)
        : process.env.NODE_ENV !== "production"
            ? await authorizeTeacherUser({ id: cookieClaims.sub, email: cookieClaims.email })
            : (() => { throw createAuthError("Teacher session expired", 401); })();

    if (session && res) setTeacherSessionCookie(res, teacher, session);
    return { teacher, accessToken };
}

export async function authenticateTeacher(req, res = null) {
    if (req.teacher) {
        return req.teacher;
    }

    if (req.teacherAuthError) {
        throw req.teacherAuthError;
    }

    const bypassTeacher = await authenticateStagingBypassRequest(req);
    if (bypassTeacher) {
        req.teacher = bypassTeacher;
        req.authToken = null;
        req.teacherAuthError = null;
        return bypassTeacher;
    }

    const token = req.authToken || extractBearerToken(req.headers.authorization || "");
    const cookieClaims = req.teacherSessionClaims || verifyTeacherSessionToken(readTeacherSessionCookie(req));
    if (!token && !cookieClaims) {
        throw createAuthError("Authentication required", 401);
    }

    const cookieResult = token ? null : await authenticateTeacherFromCookie(cookieClaims, res);
    const teacher = token ? await authenticateTeacherFromToken(token) : cookieResult.teacher;
    req.teacher = teacher;
    req.authToken = token || cookieResult?.accessToken || null;
    req.teacherSupabaseAccessToken = req.authToken;
    req.teacherSessionClaims = cookieClaims;
    req.teacherAuthError = null;
    return teacher;
}

export async function optionalTeacherContext(req, _res, next) {
    if (req.teacher || req.teacherAuthError) {
        if (next) next();
        return;
    }

    const bypassTeacher = await authenticateStagingBypassRequest(req);
    if (bypassTeacher) {
        req.authToken = null;
        req.teacher = bypassTeacher;
        req.teacherAuthError = null;
        if (next) next();
        return;
    }

    const token = extractBearerToken(req.headers.authorization || "");
    const cookieClaims = verifyTeacherSessionToken(readTeacherSessionCookie(req));
    req.authToken = token;
    req.teacherSessionClaims = cookieClaims;
    req.teacher = null;
    req.teacherAuthError = null;

    if (!token && !cookieClaims) {
        if (next) next();
        return;
    }

    try {
        const cookieResult = token ? null : await authenticateTeacherFromCookie(cookieClaims, _res);
        req.teacher = token ? await authenticateTeacherFromToken(token) : cookieResult.teacher;
        req.authToken = token || cookieResult?.accessToken || null;
        req.teacherSupabaseAccessToken = req.authToken;
    } catch (error) {
        req.teacherAuthError = error;
    }

    if (next) next();
}

export async function requireTeacher(req, res, next) {
    try {
        const user = await authenticateTeacher(req, res);
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
