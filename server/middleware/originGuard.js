function parseCsvList(...values) {
    return values
        .filter(Boolean)
        .flatMap((value) => String(value).split(","))
        .map((value) => value.trim())
        .filter(Boolean);
}

function normalizeHostValue(value) {
    return String(value || "").trim().toLowerCase();
}

function extractOriginHost(origin) {
    if (!origin) {
        return null;
    }

    try {
        return normalizeHostValue(new URL(origin).host);
    } catch {
        return null;
    }
}

function buildAllowedHosts(allowedOrigins = new Set()) {
    return new Set(
        [...allowedOrigins]
            .map(extractOriginHost)
            .filter(Boolean)
    );
}

function extractEffectiveRequestHost({ host, forwardedHost } = {}) {
    const forwarded = parseCsvList(forwardedHost)[0];
    return normalizeHostValue(forwarded || host);
}

export function isUnsafeHttpMethod(method = "") {
    return !["GET", "HEAD", "OPTIONS"].includes(String(method || "").toUpperCase());
}

export function assertProductionRequestBoundary({ nodeEnv, allowedOrigins = new Set() } = {}) {
    if (nodeEnv !== "production") {
        return;
    }

    if (!allowedOrigins.size) {
        throw new Error("APP_PUBLIC_ORIGIN or APP_ORIGINS is required in production");
    }

    for (const value of allowedOrigins) {
        let parsed;
        try {
            parsed = new URL(value);
        } catch {
            throw new Error("Production application origins must be valid HTTPS origins");
        }

        if (parsed.protocol !== "https:" || parsed.origin !== value) {
            throw new Error("Production application origins must be exact HTTPS origins");
        }
    }
}

export function isRequestOriginAllowed({ origin, host, forwardedHost, allowedOrigins = new Set() } = {}) {
    if (!origin) {
        return true;
    }

    if (allowedOrigins.has(origin)) {
        return true;
    }

    const originHost = extractOriginHost(origin);
    if (!originHost) {
        return false;
    }

    const requestHost = extractEffectiveRequestHost({ host, forwardedHost });

    return requestHost === originHost;
}

export function isRequestHostAllowed({ host, forwardedHost, allowedOrigins = new Set() } = {}) {
    const allowedHosts = buildAllowedHosts(allowedOrigins);
    if (!allowedHosts.size) {
        return true;
    }

    return allowedHosts.has(extractEffectiveRequestHost({ host, forwardedHost }));
}

export function createUnsafeRequestOriginGuard(allowedOrigins = new Set(), { enforceHost = true } = {}) {
    return (req, res, next) => {
        if (!isUnsafeHttpMethod(req.method)) {
            next();
            return;
        }

        const fetchSite = String(req.get("sec-fetch-site") || "").toLowerCase();
        if (fetchSite === "cross-site") {
            res.status(403).json({ error: "Cross-site request blocked" });
            return;
        }

        if (enforceHost && !isRequestHostAllowed({
            host: req.get("host"),
            forwardedHost: req.get("x-forwarded-host"),
            allowedOrigins
        })) {
            res.status(403).json({ error: "Request host not allowed" });
            return;
        }

        const allowed = isRequestOriginAllowed({
            origin: req.get("origin"),
            host: req.get("host"),
            forwardedHost: req.get("x-forwarded-host"),
            allowedOrigins
        });

        if (!allowed) {
            res.status(403).json({ error: "Request origin not allowed" });
            return;
        }

        next();
    };
}
