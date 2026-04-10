function decodeBase64Url(input = "") {
  const normalized = String(input)
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));

  if (typeof window !== "undefined" && typeof window.atob === "function") {
    const binary = window.atob(`${normalized}${padding}`);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }

  if (typeof Buffer !== "undefined") {
    return Buffer.from(`${normalized}${padding}`, "base64").toString("utf8");
  }

  return "";
}

export function extractSessionCodeFromJoinToken(token = "") {
  const [payload] = String(token || "").split(".");
  if (!payload) {
    return "";
  }

  try {
    const parsed = JSON.parse(decodeBase64Url(payload));
    return String(parsed?.sessionCode || "").trim().toUpperCase();
  } catch {
    return "";
  }
}
