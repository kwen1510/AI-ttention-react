export function applyBaseTestEnv(port) {
  process.env.NODE_ENV = "test";
  process.env.PORT = String(port);
  process.env.HOST = "127.0.0.1";
  process.env.SKIP_SUPABASE_BOOTSTRAP = "true";
  process.env.APP_ORIGINS = `http://127.0.0.1:${port},http://localhost:${port}`;
  process.env.SUPABASE_URL = process.env.SUPABASE_URL || "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "test-service-role-key";
  process.env.SESSION_JOIN_SECRET = "test-session-join-secret";
  process.env.JOIN_TOKEN_TTL_SECONDS = "43200";
  process.env.ALLOW_LEGACY_TEACHER_ALLOWLIST = "false";
}

export async function loadServer(tag) {
  return import(new URL(`../index.js?test=${tag}`, import.meta.url));
}

export async function stopServer(http) {
  if (!http?.listening) {
    return;
  }

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

export async function jsonRequest(baseUrl, pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, options);
  const text = await response.text();
  return {
    response,
    body: text ? JSON.parse(text) : null
  };
}

export function createAuthOverrides() {
  return {
    authenticateUserFromToken(token) {
      if (token === "teacher-token") {
        return { id: "teacher-1", email: "teacher@example.com" };
      }

      if (token === "teacher-b-token") {
        return { id: "teacher-2", email: "teacher-b@example.com" };
      }

      if (token === "student-token") {
        return { id: "student-1", email: "student@example.com" };
      }

      const error = new Error("Invalid token");
      error.status = 401;
      throw error;
    },
    lookupTeacherAccessRecord(user) {
      if (user.id === "teacher-1") {
        return {
          user_id: "teacher-1",
          email: user.email,
          role: "teacher",
          active: true
        };
      }

      if (user.id === "teacher-2") {
        return {
          user_id: "teacher-2",
          email: user.email,
          role: "teacher",
          active: true
        };
      }

      return null;
    }
  };
}
