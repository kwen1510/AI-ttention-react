import rateLimit, { ipKeyGenerator } from "express-rate-limit";

function createJsonRateLimitHandler(message = "Too many requests") {
    return (_req, res) => {
        res.status(429).json({ error: message });
    };
}

export const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 100,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: createJsonRateLimitHandler("Too many API requests")
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
