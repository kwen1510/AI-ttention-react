import test from "node:test";
import assert from "node:assert/strict";

import {
  AUTH_SESSION_TTL_MS,
  buildPersistedAuthValue,
  createPersistentAuthStorage,
  getSessionWithRefresh,
  readPersistedAuthValue,
  refreshSessionIfPossible,
} from "../client/src/lib/authSession.js";

test("persisted auth values round-trip before expiry", () => {
  const now = 1_700_000_000_000;
  const wrapped = buildPersistedAuthValue('{"access_token":"abc"}', { now });

  assert.equal(
    readPersistedAuthValue(wrapped, { now: now + AUTH_SESSION_TTL_MS - 1 }),
    '{"access_token":"abc"}'
  );
});

test("persistent auth storage keeps backward compatibility with raw Supabase values", () => {
  const backingStore = new Map([["sb-project-auth-token", '{"access_token":"legacy"}']]);
  const storage = createPersistentAuthStorage({
    storage: {
      getItem(key) {
        return backingStore.has(key) ? backingStore.get(key) : null;
      },
      setItem(key, value) {
        backingStore.set(key, value);
      },
      removeItem(key) {
        backingStore.delete(key);
      },
    },
  });

  assert.equal(storage.getItem("sb-project-auth-token"), '{"access_token":"legacy"}');
});

test("persistent auth storage evicts expired wrapped values", () => {
  const now = 1_700_000_000_000;
  const backingStore = new Map([
    [
      "sb-project-auth-token",
      buildPersistedAuthValue('{"access_token":"expired"}', {
        now: now - AUTH_SESSION_TTL_MS - 1,
      }),
    ],
  ]);

  const storage = createPersistentAuthStorage({
    storage: {
      getItem(key) {
        return backingStore.has(key) ? backingStore.get(key) : null;
      },
      setItem(key, value) {
        backingStore.set(key, value);
      },
      removeItem(key) {
        backingStore.delete(key);
      },
    },
    ttlMs: AUTH_SESSION_TTL_MS,
  });

  const realNow = Date.now;
  Date.now = () => now;
  try {
    assert.equal(storage.getItem("sb-project-auth-token"), null);
    assert.equal(backingStore.has("sb-project-auth-token"), false);
  } finally {
    Date.now = realNow;
  }
});

test("getSessionWithRefresh returns the existing session without forcing a refresh", async () => {
  const session = { access_token: "current-token", refresh_token: "refresh-token" };
  let refreshCalls = 0;

  const resolved = await getSessionWithRefresh({
    auth: {
      async getSession() {
        return { data: { session }, error: null };
      },
      async refreshSession() {
        refreshCalls += 1;
        return { data: { session: null }, error: null };
      },
    },
  });

  assert.deepEqual(resolved, session);
  assert.equal(refreshCalls, 0);
});

test("getSessionWithRefresh retries with refreshSession when requested", async () => {
  const refreshedSession = { access_token: "new-token", refresh_token: "refresh-token" };

  const resolved = await getSessionWithRefresh(
    {
      auth: {
        async getSession() {
          return { data: { session: null }, error: null };
        },
        async refreshSession() {
          return { data: { session: refreshedSession }, error: null };
        },
      },
    },
    { refreshIfMissing: true }
  );

  assert.deepEqual(resolved, refreshedSession);
});

test("refreshSessionIfPossible returns null when refresh fails", async () => {
  const resolved = await refreshSessionIfPossible({
    auth: {
      async refreshSession() {
        return {
          data: { session: null },
          error: new Error("refresh failed"),
        };
      },
    },
  });

  assert.equal(resolved, null);
});
