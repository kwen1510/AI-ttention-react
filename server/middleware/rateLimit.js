import rateLimit, { ipKeyGenerator } from "express-rate-limit";

function createJsonRateLimitHandler(message = "Too many requests") {
    return (_req, res) => {
        res.status(429).json({ error: message });
    };
}

export const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 100,
    skip(req) {
        // High-frequency recording endpoints have their own session/group-aware limits.
        return req.path === "/transcribe-chunk" || /\/async\/join\/[^/]+\/upload$/.test(req.path);
    },
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: createJsonRateLimitHandler("Too many API requests")
});

export const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 12,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: createJsonRateLimitHandler("Too many login attempts. Please wait and try again.")
});

function buildAiRequesterKey(req) {
    if (req.teacher?.id) {
        return `teacher:${req.teacher.id}`;
    }

    const sessionCode = String(
        req.get?.("x-session-code") ||
        req.body?.sessionCode ||
        ""
    ).trim().toUpperCase();
    const groupNumber = String(
        req.get?.("x-group-number") ||
        req.body?.groupNumber ||
        ""
    ).trim();
    const joinToken = String(
        req.get?.("x-join-token") ||
        req.body?.joinToken ||
        ""
    ).trim();

    if (sessionCode && groupNumber) {
        return `session:${sessionCode}:group:${groupNumber}`;
    }

    if (sessionCode) {
        return `session:${sessionCode}`;
    }

    if (joinToken) {
        return `join:${joinToken}`;
    }

    return ipKeyGenerator(req.ip);
}

function buildAsyncShareKey(req) {
    const shareId = String(req.params?.shareId || "").trim();
    return shareId ? `async:${shareId}:ip:${ipKeyGenerator(req.ip)}` : ipKeyGenerator(req.ip);
}

export const aiLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    limit: 20,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    keyGenerator: buildAiRequesterKey,
    handler: createJsonRateLimitHandler("Too many AI requests")
});

export const aiUploadLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    limit: 180,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    keyGenerator: buildAiRequesterKey,
    handler: createJsonRateLimitHandler("Too many AI requests")
});

export const asyncJoinLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    limit: 80,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    keyGenerator: buildAsyncShareKey,
    handler: createJsonRateLimitHandler("Too many async activity requests")
});

export const asyncUploadLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    limit: 20,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    keyGenerator: buildAsyncShareKey,
    handler: createJsonRateLimitHandler("Too many async recording uploads")
});
