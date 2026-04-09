import 'dotenv/config';
import express from "express";
import helmet from "helmet";
import { createServer } from "http";
import { Server } from "socket.io";
import path from "path";
import { fileURLToPath } from "url";
import { supabase } from "./server/db/supabaseClient.js";
import { seedDefaultPrompts } from "./server/db/db.js";
import { apiLimiter } from "./server/middleware/rateLimit.js";
import { initSocket } from "./server/services/socket.js";
import apiRouter from "./server/routes/api.js";
import viewsRouter from "./server/routes/views.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const shouldSkipBootstrap = process.env.SKIP_SUPABASE_BOOTSTRAP === "true";
const isDirectRun = process.argv[1] ? path.resolve(process.argv[1]) === __filename : false;

function parseCsvList(...values) {
  return values
    .filter(Boolean)
    .flatMap((value) => String(value).split(","))
    .map((value) => value.trim())
    .filter(Boolean);
}

function buildAllowedOrigins() {
  const configured = parseCsvList(
    process.env.APP_ORIGINS,
    process.env.APP_PUBLIC_ORIGIN,
    process.env.RENDER_EXTERNAL_URL
  );

  if (process.env.NODE_ENV !== "production") {
    const port = process.env.PORT || "10000";
    configured.push(
      `http://localhost:${port}`,
      `http://127.0.0.1:${port}`,
      "http://localhost:5173",
      "http://127.0.0.1:5173",
      "http://localhost:4173",
      "http://127.0.0.1:4173"
    );
  }

  return new Set(configured);
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

function extractRequestHosts(headers = {}) {
  return parseCsvList(headers["x-forwarded-host"], headers.host)
    .map(normalizeHostValue)
    .filter(Boolean);
}

export function isSocketOriginAllowed(origin, allowedOrigins, headers = {}) {
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

  const requestHosts = extractRequestHosts(headers);
  return requestHosts.includes(originHost);
}

function createSocketAllowRequestValidator(allowedOrigins) {
  return (req, callback) => {
    const allowed = isSocketOriginAllowed(req.headers.origin, allowedOrigins, req.headers);
    callback(null, allowed);
  };
}

// Initialize Express App
const app = express();
app.set("trust proxy", 1);
const http = createServer(app);
const allowedOrigins = buildAllowedOrigins();
const io = new Server(http, {
  cors: {
    origin: true,
    methods: ["GET", "POST"]
  },
  allowRequest: createSocketAllowRequestValidator(allowedOrigins)
});

// Make io available to routes
app.set('io', io);

// Initialize Socket.IO services
initSocket(io);

// Middleware
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true, limit: "2mb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

// API Routes
app.use('/api', apiLimiter, apiRouter);

// View Routes (Static & SPA)
app.use('/', viewsRouter);

app.use((err, _req, res, _next) => {
  const status = Number.isInteger(err?.status)
    ? err.status
    : err?.code === "LIMIT_FILE_SIZE"
      ? 413
      : err?.code === "UNSUPPORTED_MEDIA_TYPE"
        ? 400
        : 500;

  if (status >= 500) {
    console.error("❌ Unhandled server error:", err);
  }

  res.status(status).json({
    error: status >= 500
      ? "Internal server error"
      : err?.message || "Request failed"
  });
});

// Database Connection & Server Start
async function startServer({ exitOnFailure = isDirectRun } = {}) {
  try {
    if (shouldSkipBootstrap) {
      console.log('🧪 Skipping Supabase bootstrap checks');
    } else {
      console.log('📦 Connecting to Supabase...');
      const { error } = await supabase.from('sessions').select('id').limit(1);
      if (error && error.code !== 'PGRST116') {
        throw error;
      }
      console.log('📦 Supabase connected');

      // Seed default prompts
      await seedDefaultPrompts();
    }

    const port = process.env.PORT || 10000;
    const host = process.env.HOST || '0.0.0.0';

    const listeningAddress = await new Promise((resolve, reject) => {
      const handleError = (error) => {
        http.off('listening', handleListening);
        reject(error);
      };
      const handleListening = () => {
        http.off('error', handleError);
        const address = http.address();
        const resolvedPort =
          address && typeof address === 'object' && 'port' in address
            ? address.port
            : port;
        console.log(`🎯 Server running at http://${host}:${resolvedPort}`);
        resolve({ host, port: resolvedPort });
      };

      http.once('error', handleError);
      http.once('listening', handleListening);
      http.listen(port, host);
    });

    return listeningAddress;
  } catch (error) {
    console.error('❌ Server startup failed:', error);
    if (exitOnFailure) {
      process.exit(1);
    }
    throw error;
  }
}

if (isDirectRun) {
  startServer();
}

export { app, http, io, startServer };
