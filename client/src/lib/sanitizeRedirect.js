const FALLBACK_REDIRECT = "/admin";

export function sanitizeRedirect(candidate, fallback = FALLBACK_REDIRECT) {
  if (typeof candidate !== "string") {
    return fallback;
  }

  const value = candidate.trim();
  if (!value || !value.startsWith("/") || value.startsWith("//") || /[\u0000-\u001F\\]/.test(value)) {
    return fallback;
  }

  try {
    const url = new URL(value, "https://app.local");
    if (url.origin !== "https://app.local") {
      return fallback;
    }
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}

export const DEFAULT_REDIRECT_PATH = FALLBACK_REDIRECT;
