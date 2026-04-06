import 'dotenv/config';
import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import path from "path";
import { fileURLToPath } from "url";
import { supabase } from "./server/db/supabaseClient.js";
import { seedDefaultPrompts } from "./server/db/db.js";
import { initSocket } from "./server/services/socket.js";
import apiRouter from "./server/routes/api.js";
import viewsRouter from "./server/routes/views.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const shouldSkipBootstrap = process.env.SKIP_SUPABASE_BOOTSTRAP === "true";
const isDirectRun = process.argv[1] ? path.resolve(process.argv[1]) === __filename : false;

// Initialize Express App
const app = express();
const http = createServer(app);
const io = new Server(http, { cors: { origin: "*" } });

// Make io available to routes
app.set('io', io);

// Initialize Socket.IO services
initSocket(io);

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

// API Routes
app.use('/api', apiRouter);

// View Routes (Static & SPA)
app.use('/', viewsRouter);

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

    await new Promise((resolve, reject) => {
      const handleError = (error) => {
        http.off('listening', handleListening);
        reject(error);
      };
      const handleListening = () => {
        http.off('error', handleError);
        console.log(`🎯 Server running at http://${host}:${port}`);
        resolve();
      };

      http.once('error', handleError);
      http.once('listening', handleListening);
      http.listen(port, host);
    });

    return { host, port };
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
