import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

export const TEACHER_SESSION_COOKIE_NAME = "ai_tt_teacher";
export const DEFAULT_TEACHER_SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

function resolveCookieSecret() {
    const secret = String(process.env.AUTH_COOKIE_SECRET || "");

    if (process.env.NODE_ENV === "production") {
        if (secret.length < 32) {
            throw new Error("AUTH_COOKIE_SECRET must be at least 32 characters in production");
        }
        if (secret === String(process.env.SESSION_JOIN_SECRET || "")) {
            throw new Error("AUTH_COOKIE_SECRET and SESSION_JOIN_SECRET must be independent values");
        }
    }

    return secret || "development-only-auth-cookie-secret-change-me";
}

export function assertTeacherSessionCookieConfigured() {
    resolveCookieSecret();
    return true;
}

function cookieEncryptionKey() {
    return createHash("sha256").update(resolveCookieSecret()).digest();
}

function parseCookieHeader(header = "") {
    const cookies = new Map();
    for (const part of String(header || "").split(";")) {
        const separator = part.indexOf("=");
        if (separator < 1) continue;
        const name = part.slice(0, separator).trim();
        const value = part.slice(separator + 1).trim();
        if (name) cookies.set(name, value);
    }
    return cookies;
}

export function getTeacherSessionTtlSeconds() {
    const configured = Number(process.env.AUTH_COOKIE_TTL_SECONDS);
    if (!Number.isFinite(configured) || configured < 300) {
        return DEFAULT_TEACHER_SESSION_TTL_SECONDS;
    }
    return Math.min(Math.floor(configured), 90 * 24 * 60 * 60);
}

export function createTeacherSessionToken(user, { now = Date.now(), ttlSeconds = getTeacherSessionTtlSeconds(), session = null } = {}) {
    if (!user?.id || !user?.email) {
        throw new Error("Teacher identity is required");
    }

    const issuedAt = Math.floor(now / 1000);
    const payload = {
        sub: String(user.id),
        email: String(user.email).trim().toLowerCase(),
        iat: issuedAt,
        exp: issuedAt + ttlSeconds,
        jti: randomBytes(16).toString("base64url"),
        access_token: session?.access_token || null,
        refresh_token: session?.refresh_token || null
    };
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", cookieEncryptionKey(), iv, { authTagLength: 16 });
    const ciphertext = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()]);
    return `v2.${iv.toString("base64url")}.${ciphertext.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}`;
}

export function verifyTeacherSessionToken(token, { now = Date.now() } = {}) {
    try {
        const [version, encodedIv, encodedCiphertext, encodedTag, extra] = String(token || "").split(".");
        if (version !== "v2" || !encodedIv || !encodedCiphertext || !encodedTag || extra) return null;
        const iv = Buffer.from(encodedIv, "base64url");
        const tag = Buffer.from(encodedTag, "base64url");
        if (iv.length !== 12 || tag.length !== 16) return null;
        const decipher = createDecipheriv("aes-256-gcm", cookieEncryptionKey(), iv, { authTagLength: 16 });
        decipher.setAuthTag(tag);
        const plaintext = Buffer.concat([
            decipher.update(Buffer.from(encodedCiphertext, "base64url")),
            decipher.final()
        ]).toString("utf8");
        const payload = JSON.parse(plaintext);
        const nowSeconds = Math.floor(now / 1000);
        if (!payload?.sub || !payload?.email || !Number.isFinite(payload.exp) || payload.exp <= nowSeconds) {
            return null;
        }
        return payload;
    } catch {
        return null;
    }
}

export function readTeacherSessionCookie(req) {
    const cookies = parseCookieHeader(req?.headers?.cookie || "");
    return cookies.get(TEACHER_SESSION_COOKIE_NAME) || null;
}

function serializeCookie(value, { maxAge = null } = {}) {
    const secure = process.env.NODE_ENV === "production";
    const parts = [
        `${TEACHER_SESSION_COOKIE_NAME}=${value}`,
        "Path=/",
        "HttpOnly",
        "SameSite=Strict"
    ];
    if (secure) parts.push("Secure");
    if (Number.isFinite(maxAge)) parts.push(`Max-Age=${Math.max(0, Math.floor(maxAge))}`);
    return parts.join("; ");
}

export function setTeacherSessionCookie(res, user, session = null) {
    const ttlSeconds = getTeacherSessionTtlSeconds();
    const token = createTeacherSessionToken(user, { ttlSeconds, session });
    res.setHeader("Set-Cookie", serializeCookie(token, { maxAge: ttlSeconds }));
    return { token, expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString() };
}

export function clearTeacherSessionCookie(res) {
    res.setHeader("Set-Cookie", `${serializeCookie("", { maxAge: 0 })}; Expires=Thu, 01 Jan 1970 00:00:00 GMT`);
}
