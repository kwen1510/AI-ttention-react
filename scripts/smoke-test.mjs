process.env.NODE_ENV = process.env.NODE_ENV || "test";
process.env.PORT = process.env.PORT || "10000";
process.env.HOST = process.env.HOST || "0.0.0.0";
process.env.SKIP_SUPABASE_BOOTSTRAP = "true";
process.env.APP_ORIGINS = process.env.APP_ORIGINS || "http://127.0.0.1:10000,http://localhost:10000";
process.env.SUPABASE_URL = process.env.SUPABASE_URL || "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "test-service-role-key";
process.env.SESSION_JOIN_SECRET = process.env.SESSION_JOIN_SECRET || "smoke-test-session-secret";

const { http, startServer } = await import("../index.js");

const baseUrl = `http://127.0.0.1:${process.env.PORT}`;

async function ensureOk(pathname, matcher) {
  const response = await fetch(`${baseUrl}${pathname}`);
  if (!response.ok) {
    throw new Error(`${pathname} returned ${response.status}`);
  }

  const body = await response.text();
  if (matcher && !matcher.test(body)) {
    throw new Error(`${pathname} returned an unexpected body`);
  }
}

async function ensureStatus(pathname, options, expectedStatus, matcher) {
  const response = await fetch(`${baseUrl}${pathname}`, options);
  if (response.status !== expectedStatus) {
    throw new Error(`${pathname} returned ${response.status}, expected ${expectedStatus}`);
  }

  const body = await response.text();
  if (matcher && !matcher.test(body)) {
    throw new Error(`${pathname} returned an unexpected body`);
  }
}

try {
  await startServer({ exitOnFailure: false });

  await ensureStatus("/health", {}, 200, /\{"ok":true\}/);
  await ensureOk("/", /<!doctype html>/i);
  await ensureOk("/student", /<html/i);
  await ensureOk("/admin", /<html/i);
  await ensureStatus(
    "/api/auth/me",
    {},
    401,
    /"error":"Unauthorized"/
  );

  console.log("Smoke test passed.");
} finally {
  if (http.listening) {
    await new Promise((resolve, reject) => {
      http.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }
}
