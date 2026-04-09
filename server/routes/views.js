import express from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "../../");
const INDEX_CACHE_CONTROL = "no-store, max-age=0";
const ASSET_CACHE_CONTROL = "public, max-age=31536000, immutable";
const DEFAULT_STATIC_CACHE_CONTROL = "public, max-age=3600";
const NOT_FOUND_CONTENT_TYPES = new Map([
    [".css", "text/css; charset=utf-8"],
    [".js", "text/javascript; charset=utf-8"],
    [".mjs", "text/javascript; charset=utf-8"],
    [".json", "application/json; charset=utf-8"],
    [".map", "application/json; charset=utf-8"],
    [".svg", "image/svg+xml; charset=utf-8"],
    [".png", "image/png"],
    [".jpg", "image/jpeg"],
    [".jpeg", "image/jpeg"],
    [".gif", "image/gif"],
    [".webp", "image/webp"],
    [".ico", "image/x-icon"],
]);

const router = express.Router();

const frontendCandidates = [
    path.join(rootDir, "dist"),
    path.join(rootDir, "client", "dist"),
];

const staticDir = frontendCandidates.find((dir) => {
    try {
        return fs.existsSync(path.join(dir, "index.html"));
    } catch (error) {
        console.error(`⚠️ Unable to stat potential frontend directory ${dir}:`, error);
        return false;
    }
}) ?? null;

if (!staticDir) {
    console.warn("⚠️ No compiled frontend bundle found. The dashboard routes will return 404 until the client is built.");
} else {
    router.use(express.static(staticDir, {
        index: false,
        setHeaders(res, filePath) {
            const relativePath = path.relative(staticDir, filePath);
            const isIndexFile = path.basename(filePath) === "index.html";
            const topLevelDir = relativePath.split(path.sep)[0];

            if (isIndexFile) {
                res.setHeader("Cache-Control", INDEX_CACHE_CONTROL);
                return;
            }

            if (topLevelDir === "assets") {
                res.setHeader("Cache-Control", ASSET_CACHE_CONTROL);
                return;
            }

            res.setHeader("Cache-Control", DEFAULT_STATIC_CACHE_CONTROL);
        }
    }));
}

const sendIndexHtml = (_req, res) => {
    if (staticDir) {
        res.setHeader("Cache-Control", INDEX_CACHE_CONTROL);
        res.sendFile(path.join(staticDir, 'index.html'));
    } else {
        res.status(404).send("Frontend not built");
    }
};

function sendTypedNotFound(res, requestPath) {
    const extension = path.extname(requestPath).toLowerCase();
    const contentType = NOT_FOUND_CONTENT_TYPES.get(extension) || "text/plain; charset=utf-8";
    res.status(404);
    res.setHeader("Content-Type", contentType);
    res.send("");
}

const spaRoutes = [
    '/',
    '/admin',
    '/checkbox',
    '/data',
    '/history',
    '/login',
    '/mindmap',
    '/mindmap-playground',
    '/prompts',
    '/student',
];

spaRoutes.forEach((route) => {
    router.get(route, sendIndexHtml);
    if (route !== '/') {
        router.get(`${route}.html`, sendIndexHtml);
        router.get(`${route}/*splat`, sendIndexHtml);
    }
});

/* Fallback handler to support client-side routing */
router.get('/{*path}', (req, res, next) => {
    const requestPath = req.path;

    const isApiRequest = requestPath.startsWith('/api/');
    const isSocketRequest = requestPath.startsWith('/socket.io');
    const isHealthCheck = requestPath === '/health';
    const hasFileExtension = path.extname(requestPath) !== '';
    const isGetMethod = req.method === 'GET';

    if (!isGetMethod || isApiRequest || isSocketRequest || isHealthCheck) {
        return next();
    }

    if (hasFileExtension) {
        return sendTypedNotFound(res, requestPath);
    }

    return sendIndexHtml(req, res);
});

export default router;
