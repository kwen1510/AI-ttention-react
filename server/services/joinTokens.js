import crypto from "crypto";

const JOIN_TOKEN_VERSION = 1;
const DEV_JOIN_SECRET = "dev-only-session-join-secret";

function createJoinTokenError(message, status = 401) {
    const error = new Error(message);
    error.status = status;
    return error;
}

function toBase64Url(input) {
    return Buffer.from(input)
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/g, "");
}

function fromBase64Url(input) {
    const normalized = String(input || "")
        .replace(/-/g, "+")
        .replace(/_/g, "/");
    const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
    return Buffer.from(`${normalized}${padding}`, "base64");
}

export function getJoinTokenSecret() {
    if (process.env.SESSION_JOIN_SECRET) {
        return process.env.SESSION_JOIN_SECRET;
    }

    if (process.env.NODE_ENV === "production") {
        throw createJoinTokenError("SESSION_JOIN_SECRET is not configured", 500);
    }

    return DEV_JOIN_SECRET;
}

export function getJoinTokenTtlSeconds() {
    const parsed = Number(process.env.JOIN_TOKEN_TTL_SECONDS);
    if (Number.isFinite(parsed) && parsed > 0) {
        return Math.floor(parsed);
    }

    return 12 * 60 * 60;
}

function signPayload(encodedPayload, secret = getJoinTokenSecret()) {
    return crypto
        .createHmac("sha256", secret)
        .update(encodedPayload)
        .digest("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/g, "");
}

export function createJoinToken({ sessionCode, expiresInSeconds = getJoinTokenTtlSeconds(), now = Date.now() }) {
    const normalizedSessionCode = String(sessionCode || "").trim().toUpperCase();
    if (!normalizedSessionCode) {
        throw createJoinTokenError("Session code is required", 400);
    }

    const payload = {
        type: "student",
        sessionCode: normalizedSessionCode,
        exp: Math.floor(now / 1000) + Number(expiresInSeconds),
        version: JOIN_TOKEN_VERSION
    };

    const encodedPayload = toBase64Url(JSON.stringify(payload));
    const signature = signPayload(encodedPayload);
    return `${encodedPayload}.${signature}`;
}

export function verifyJoinToken(token, { now = Date.now(), expectedSessionCode } = {}) {
    const [encodedPayload, signature] = String(token || "").split(".");
    if (!encodedPayload || !signature) {
        throw createJoinTokenError("Invalid join token", 401);
    }

    const expectedSignature = signPayload(encodedPayload);
    const provided = Buffer.from(signature);
    const expected = Buffer.from(expectedSignature);

    if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
        throw createJoinTokenError("Invalid join token", 401);
    }

    let payload;
    try {
        payload = JSON.parse(fromBase64Url(encodedPayload).toString("utf8"));
    } catch {
        throw createJoinTokenError("Invalid join token", 401);
    }

    if (payload?.type !== "student" || payload?.version !== JOIN_TOKEN_VERSION) {
        throw createJoinTokenError("Invalid join token", 401);
    }

    if (!payload?.sessionCode) {
        throw createJoinTokenError("Invalid join token", 401);
    }

    if (!Number.isFinite(payload?.exp) || payload.exp <= Math.floor(now / 1000)) {
        throw createJoinTokenError("Join token expired", 401);
    }

    if (expectedSessionCode && String(expectedSessionCode).trim().toUpperCase() !== payload.sessionCode) {
        throw createJoinTokenError("Join token does not match the requested session", 401);
    }

    return {
        ...payload,
        sessionCode: String(payload.sessionCode).trim().toUpperCase()
    };
}

export function buildJoinUrl(origin, token) {
    const url = new URL("/student", origin);
    url.searchParams.set("token", token);
    return url.toString();
}

export function assertJoinableSessionState(sessionCode, sessionState, sessionRecord = null) {
    const normalizedCode = String(sessionCode || "").trim().toUpperCase();
    if (!normalizedCode) {
        throw createJoinTokenError("Session not found", 404);
    }

    const isActive = Boolean(sessionRecord?.active || sessionState?.active);
    if (!isActive) {
        throw createJoinTokenError("Session not active", 404);
    }

    return {
        sessionCode: normalizedCode,
        sessionState,
        sessionRecord
    };
}
