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

export const aiLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    limit: 20,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    keyGenerator: (req) => req.teacher?.id ? `teacher:${req.teacher.id}` : ipKeyGenerator(req.ip),
    handler: createJsonRateLimitHandler("Too many AI requests")
});
