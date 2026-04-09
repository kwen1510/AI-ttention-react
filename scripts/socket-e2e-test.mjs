process.env.NODE_ENV = "test";
process.env.PORT = process.env.PORT || "0";
process.env.HOST = process.env.HOST || "127.0.0.1";
process.env.SKIP_SUPABASE_BOOTSTRAP = "true";
process.env.APP_ORIGINS = process.env.APP_ORIGINS || "http://127.0.0.1,http://localhost";
process.env.SUPABASE_URL = process.env.SUPABASE_URL || "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "test-service-role-key";
process.env.SESSION_JOIN_SECRET = process.env.SESSION_JOIN_SECRET || "socket-e2e-secret";
process.env.ALLOW_LEGACY_TEACHER_ALLOWLIST = "false";

import assert from "node:assert/strict";
import { io as createSocketClient } from "socket.io-client";

const { __setAuthTestOverrides } = await import("../server/middleware/auth.js");
const { activeSessions } = await import("../server/services/state.js");
const { http, startServer } = await import("../index.js");

function createAuthOverrides() {
  return {
    authenticateUserFromToken(token) {
      if (token === "teacher-token") {
        return { id: "teacher-1", email: "teacher@example.com" };
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

      return null;
    }
  };
}

function getBaseUrl() {
  const address = http.address();
  if (!address || typeof address === "string" || !address.port) {
    throw new Error("Socket e2e server did not expose a TCP port");
  }

  return `http://127.0.0.1:${address.port}`;
}

function waitForEvent(socket, event, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for ${event}`));
    }, timeoutMs);

    const cleanup = () => {
      clearTimeout(timeout);
      socket.off(event, onEvent);
      socket.off("connect_error", onError);
      socket.off("error", onError);
    };

    const onEvent = (payload) => {
      cleanup();
      resolve(payload);
    };

    const onError = (error) => {
      cleanup();
      reject(error instanceof Error ? error : new Error(String(error)));
    };

    socket.once(event, onEvent);
    socket.once("connect_error", onError);
    socket.once("error", onError);
  });
}

let teacherSocket;
let studentSocket;

try {
  __setAuthTestOverrides(createAuthOverrides());

  await startServer({ exitOnFailure: false });

  activeSessions.set("ROOM42", {
    code: "ROOM42",
    ownerId: "teacher-1",
    active: false,
    interval: 30000,
    persisted: false,
    mode: "summary",
    groups: new Map()
  });

  const baseUrl = getBaseUrl();
  const headers = { Origin: baseUrl };

  teacherSocket = createSocketClient(baseUrl, {
    transports: ["polling"],
    auth: {
      type: "teacher",
      accessToken: "teacher-token"
    },
    extraHeaders: headers
  });

  await waitForEvent(teacherSocket, "connect");
  teacherSocket.emit("admin_join", { code: "ROOM42" });

  const studentJoinedPromise = waitForEvent(teacherSocket, "student_joined");

  studentSocket = createSocketClient(baseUrl, {
    transports: ["polling"],
    extraHeaders: headers
  });

  await waitForEvent(studentSocket, "connect");

  const joinResultPromise = waitForEvent(studentSocket, "joined");
  studentSocket.emit("join", { code: "ROOM42", group: 3 });

  const [teacherNotice, joinResult] = await Promise.all([
    studentJoinedPromise,
    joinResultPromise
  ]);

  assert.deepEqual(teacherNotice, { group: 3, socketId: studentSocket.id });
  assert.equal(joinResult.code, "ROOM42");
  assert.equal(joinResult.group, 3);
  assert.equal(joinResult.status, "waiting");
  assert.equal(joinResult.mode, "summary");

  console.log("Socket e2e test passed.");
} finally {
  if (teacherSocket) {
    teacherSocket.disconnect();
  }

  if (studentSocket) {
    studentSocket.disconnect();
  }

  activeSessions.clear();
  __setAuthTestOverrides(null);

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
