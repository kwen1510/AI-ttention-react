import express from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "../../");

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
    router.use(express.static(staticDir));
}

const sendIndexHtml = (_req, res) => {
    if (staticDir) {
        res.sendFile(path.join(staticDir, 'index.html'));
    } else {
        res.status(404).send("Frontend not built");
    }
};

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

    if (!isGetMethod || isApiRequest || isSocketRequest || isHealthCheck || hasFileExtension) {
        return next();
    }

    return sendIndexHtml(req, res);
});

export default router;
