export const STAGING_ROUTE_PREFIX = "/staging";
export const STAGING_BYPASS_HEADER = "x-staging-auth-bypass";

export function isStagingBypassPath(pathname = "") {
  return pathname === STAGING_ROUTE_PREFIX || pathname.startsWith(`${STAGING_ROUTE_PREFIX}/`);
}

export function getStagingBasePath(pathname = "") {
  return isStagingBypassPath(pathname) ? STAGING_ROUTE_PREFIX : "";
}

export function buildModePath(path, basePath = "") {
  return `${basePath}${path}`;
}

export function createStagingBypassHeaders(existingHeaders) {
  const headers = new Headers(existingHeaders || {});
  headers.set(STAGING_BYPASS_HEADER, "teacher");
  return headers;
}

export function createStagingBypassTeacherProfile() {
  return {
    id: "staging-teacher",
    email: "staging-teacher@example.com",
    role: "teacher",
  };
}
