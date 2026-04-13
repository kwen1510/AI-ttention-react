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
  const normalizeEmail = (value) => String(value || "").trim().toLowerCase();
  const usersByToken = new Map([
    ["teacher-token", { id: "teacher-1", email: "teacher@example.com" }],
    ["teacher-b-token", { id: "teacher-2", email: "teacher-b@example.com" }],
    ["admin-token", { id: "admin-1", email: "kuangwen.chan@ri.edu.sg" }],
    ["student-token", { id: "student-1", email: "student@example.com" }],
    ["domain-teacher-token", { id: "teacher-3", email: "teacher-c@ri.edu.sg" }]
  ]);

  const accessRecordsByUserId = new Map([
    ["teacher-1", {
      user_id: "teacher-1",
      email: "teacher@example.com",
      role: "teacher",
      active: true
    }],
    ["teacher-2", {
      user_id: "teacher-2",
      email: "teacher-b@example.com",
      role: "teacher",
      active: true
    }]
  ]);

  const accessRecordsByEmail = new Map([
    ["teacher@example.com", accessRecordsByUserId.get("teacher-1")],
    ["teacher-b@example.com", accessRecordsByUserId.get("teacher-2")],
    ["kuangwen.chan@ri.edu.sg", {
      user_id: null,
      email: "kuangwen.chan@ri.edu.sg",
      role: "admin",
      active: true
    }]
  ]);

  const authUsersByEmail = new Map(
    Array.from(usersByToken.values()).map((user) => [normalizeEmail(user.email), user])
  );

  return {
    authenticateUserFromToken(token) {
      if (usersByToken.has(token)) {
        return usersByToken.get(token);
      }

      const error = new Error("Invalid token");
      error.status = 401;
      throw error;
    },
    lookupTeacherAccessRecordByUserId(userId) {
      return accessRecordsByUserId.get(userId) || null;
    },
    lookupTeacherAccessRecordByEmail(email) {
      return accessRecordsByEmail.get(normalizeEmail(email)) || null;
    },
    lookupTeacherAccessRecord(user) {
      return accessRecordsByUserId.get(user.id) || null;
    },
    lookupTeacherAccessRecordsByUserIds(userIds = []) {
      return userIds.map((userId) => accessRecordsByUserId.get(userId)).filter(Boolean);
    },
    syncTeacherAccessRecord(record, user) {
      const nextRecord = {
        ...record,
        user_id: user.id,
        email: normalizeEmail(user.email)
      };

      accessRecordsByEmail.set(nextRecord.email, nextRecord);
      if (nextRecord.user_id) {
        accessRecordsByUserId.set(nextRecord.user_id, nextRecord);
      }

      return nextRecord;
    },
    findAuthUserByEmail(email) {
      return authUsersByEmail.get(normalizeEmail(email)) || null;
    },
    listAuthUsersByIds(userIds = []) {
      const usersById = new Map();
      for (const userId of userIds) {
        const match = Array.from(authUsersByEmail.values()).find((user) => user.id === userId);
        if (match) {
          usersById.set(userId, match);
        }
      }
      return usersById;
    }
  };
}
