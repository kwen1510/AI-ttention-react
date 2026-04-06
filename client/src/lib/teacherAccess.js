export function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

export function isAllowedTeacherUser(userOrEmail, allowedDomains = [], allowedEmails = []) {
  const email =
    typeof userOrEmail === "string"
      ? normalizeEmail(userOrEmail)
      : normalizeEmail(userOrEmail?.email);

  if (!email) return false;

  const normalizedEmails = (allowedEmails || []).map(normalizeEmail).filter(Boolean);
  if (normalizedEmails.includes(email)) {
    return true;
  }

  const normalizedDomains = (allowedDomains || []).map(normalizeEmail).filter(Boolean);
  if (normalizedDomains.length === 0) {
    return true;
  }

  return normalizedDomains.some((domain) => email.endsWith(`@${domain}`));
}
