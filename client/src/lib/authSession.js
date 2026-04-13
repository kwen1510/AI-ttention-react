export const AUTH_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const AUTH_STORAGE_ENVELOPE_MARKER = "__ai_ttention_auth_storage_v1";

export function buildPersistedAuthValue(value, { now = Date.now(), ttlMs = AUTH_SESSION_TTL_MS } = {}) {
  return JSON.stringify({
    [AUTH_STORAGE_ENVELOPE_MARKER]: true,
    expiresAt: now + ttlMs,
    value: String(value ?? ""),
  });
}

export function readPersistedAuthValue(rawValue, { now = Date.now() } = {}) {
  if (typeof rawValue !== "string" || !rawValue.length) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawValue);
    if (parsed?.[AUTH_STORAGE_ENVELOPE_MARKER] !== true) {
      return rawValue;
    }

    if (typeof parsed.expiresAt === "number" && parsed.expiresAt <= now) {
      return null;
    }

    return typeof parsed.value === "string" ? parsed.value : null;
  } catch {
    return rawValue;
  }
}

export function createPersistentAuthStorage({
  storage = typeof window !== "undefined" ? window.localStorage : null,
  ttlMs = AUTH_SESSION_TTL_MS,
} = {}) {
  return {
    getItem(key) {
      if (!storage) {
        return null;
      }

      try {
        const rawValue = storage.getItem(key);
        const parsedValue = readPersistedAuthValue(rawValue);
        if (rawValue !== null && parsedValue === null) {
          storage.removeItem(key);
        }
        return parsedValue;
      } catch {
        return null;
      }
    },
    setItem(key, value) {
      if (!storage) {
        return;
      }

      try {
        storage.setItem(key, buildPersistedAuthValue(value, { ttlMs }));
      } catch {
        // Ignore storage quota/private mode failures and fall back to in-memory auth.
      }
    },
    removeItem(key) {
      if (!storage) {
        return;
      }

      try {
        storage.removeItem(key);
      } catch {
        // Ignore storage access failures during cleanup.
      }
    },
  };
}

export async function refreshSessionIfPossible(supabase) {
  if (!supabase?.auth) {
    return null;
  }

  try {
    const { data, error } = await supabase.auth.refreshSession();
    if (error) {
      return null;
    }
    return data.session ?? null;
  } catch {
    return null;
  }
}

export async function getSessionWithRefresh(supabase, { refreshIfMissing = false } = {}) {
  if (!supabase?.auth) {
    return null;
  }

  const { data, error } = await supabase.auth.getSession();
  if (error) {
    throw error;
  }

  const session = data.session ?? null;
  if (session?.access_token || !refreshIfMissing) {
    return session;
  }

  return refreshSessionIfPossible(supabase);
}
