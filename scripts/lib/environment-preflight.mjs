const PLACEHOLDER_PATTERN = /^(?:<.*>|\[.*\]|your[-_ ]|replace[-_ ])/i;

function present(value) {
  return String(value || "").trim();
}

function requireValue(env, name, errors) {
  const value = present(env[name]);
  if (!value || PLACEHOLDER_PATTERN.test(value)) {
    errors.push(`${name} is required and must not be a placeholder`);
  }
  return value;
}

function parseUrl(value, name, errors) {
  try {
    return new URL(value);
  } catch {
    errors.push(`${name} must be a valid URL`);
    return null;
  }
}

function supabaseProjectRef(value) {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return hostname.endsWith(".supabase.co") ? hostname.split(".")[0] : "";
  } catch {
    return "";
  }
}

export function validateArchiveEnvironment(env = process.env) {
  const errors = [];
  const primary = present(env.SUPABASE_DB_URL);
  const fallback = present(env.DATABASE_URL);
  if (primary && fallback && primary !== fallback) {
    errors.push("SUPABASE_DB_URL and DATABASE_URL disagree; keep only the intended production URL");
  }

  const rawUrl = primary || fallback;
  if (!rawUrl || PLACEHOLDER_PATTERN.test(rawUrl)) {
    errors.push("SUPABASE_DB_URL is required and must not be a placeholder");
    return errors;
  }

  const parsed = parseUrl(rawUrl, "SUPABASE_DB_URL", errors);
  if (!parsed) return errors;
  if (!/^postgres(?:ql)?:$/.test(parsed.protocol)) {
    errors.push("SUPABASE_DB_URL must use postgresql://");
  }
  if (!parsed.hostname || !parsed.username || !parsed.password || parsed.pathname !== "/postgres") {
    errors.push("SUPABASE_DB_URL must include host, username, password, and the postgres database");
  }
  try {
    if (PLACEHOLDER_PATTERN.test(decodeURIComponent(parsed.password))) {
      errors.push("SUPABASE_DB_URL password placeholder must be replaced");
    }
  } catch {
    errors.push("SUPABASE_DB_URL contains invalid percent-encoding");
  }
  if (parsed.port === "6543") {
    errors.push("Transaction pooler port 6543 is forbidden; use direct or session mode on port 5432");
  } else if (parsed.port && parsed.port !== "5432") {
    errors.push("SUPABASE_DB_URL must use PostgreSQL port 5432");
  }
  if (parsed.searchParams.has("sslmode") && parsed.searchParams.get("sslmode") === "disable") {
    errors.push("SUPABASE_DB_URL must not disable TLS");
  }
  if (parsed.hash) errors.push("SUPABASE_DB_URL must not contain a URL fragment");

  const projectRef = supabaseProjectRef(env.SUPABASE_URL);
  if (projectRef) {
    const identity = `${parsed.hostname} ${decodeURIComponent(parsed.username)}`.toLowerCase();
    if (!identity.includes(projectRef)) {
      errors.push("SUPABASE_DB_URL does not match the configured SUPABASE_URL project reference");
    }
  }
  return errors;
}

export function assertArchiveEnvironment(env = process.env) {
  const errors = validateArchiveEnvironment(env);
  if (errors.length) {
    throw new Error(`Archive environment preflight failed:\n- ${errors.join("\n- ")}`);
  }
}

export function validateDeploymentEnvironment(env = process.env) {
  const errors = [];
  if (present(env.NODE_ENV) !== "production") errors.push("NODE_ENV must be production");

  const publicOrigin = requireValue(env, "APP_PUBLIC_ORIGIN", errors);
  const configuredOrigins = requireValue(env, "APP_ORIGINS", errors)
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  for (const [name, value] of [["APP_PUBLIC_ORIGIN", publicOrigin], ...configuredOrigins.map((value) => ["APP_ORIGINS", value])]) {
    const parsed = parseUrl(value, name, errors);
    if (parsed && (parsed.protocol !== "https:" || parsed.origin !== value)) {
      errors.push(`${name} must contain exact HTTPS origins without paths or trailing slashes`);
    }
  }
  if (publicOrigin && configuredOrigins.length && !configuredOrigins.includes(publicOrigin)) {
    errors.push("APP_ORIGINS must include APP_PUBLIC_ORIGIN");
  }

  const supabaseUrl = requireValue(env, "SUPABASE_URL", errors);
  const viteSupabaseUrl = requireValue(env, "VITE_SUPABASE_URL", errors);
  const parsedSupabase = parseUrl(supabaseUrl, "SUPABASE_URL", errors);
  if (parsedSupabase && (parsedSupabase.protocol !== "https:" || !parsedSupabase.hostname.endsWith(".supabase.co"))) {
    errors.push("SUPABASE_URL must be the managed project's HTTPS supabase.co URL");
  }
  if (supabaseUrl && viteSupabaseUrl && supabaseUrl !== viteSupabaseUrl) {
    errors.push("VITE_SUPABASE_URL must match SUPABASE_URL");
  }

  const publishable = requireValue(env, "SUPABASE_PUBLISHABLE_KEY", errors);
  const vitePublishable = requireValue(env, "VITE_SUPABASE_PUBLISHABLE_KEY", errors);
  const secret = requireValue(env, "SUPABASE_SECRET_KEY", errors);
  if (publishable && !publishable.startsWith("sb_publishable_")) errors.push("SUPABASE_PUBLISHABLE_KEY must use the new publishable-key format");
  if (secret && !secret.startsWith("sb_secret_")) errors.push("SUPABASE_SECRET_KEY must use the new secret-key format");
  if (publishable && vitePublishable && publishable !== vitePublishable) errors.push("VITE_SUPABASE_PUBLISHABLE_KEY must match SUPABASE_PUBLISHABLE_KEY");

  for (const legacy of ["SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_JWT_SECRET"]) {
    if (present(env[legacy])) errors.push(`${legacy} must not be deployed`);
  }
  if (present(env.SUPABASE_DB_URL) || present(env.DATABASE_URL)) {
    errors.push("The migration database URL must not be deployed to DigitalOcean");
  }

  const cookieSecret = requireValue(env, "AUTH_COOKIE_SECRET", errors);
  const joinSecret = requireValue(env, "SESSION_JOIN_SECRET", errors);
  if (cookieSecret && cookieSecret.length < 32) errors.push("AUTH_COOKIE_SECRET must be at least 32 characters");
  if (joinSecret && joinSecret.length < 32) errors.push("SESSION_JOIN_SECRET must be at least 32 characters");
  if (cookieSecret && joinSecret && cookieSecret === joinSecret) errors.push("AUTH_COOKIE_SECRET and SESSION_JOIN_SECRET must be independent");
  if ([cookieSecret, joinSecret].filter(Boolean).includes(secret)) errors.push("Application secrets must not reuse SUPABASE_SECRET_KEY");

  requireValue(env, "OPENAI_API_KEY", errors);
  requireValue(env, "ELEVENLABS_KEY", errors);

  for (const testOnlyFlag of ["STAGING_AUTH_BYPASS", "ALLOW_DEV_TEST", "MOCK_AI_SERVICES"]) {
    if (present(env[testOnlyFlag]).toLowerCase() === "true") {
      errors.push(`${testOnlyFlag} must not be enabled in production`);
    }
  }
  for (const stagingOnlyValue of ["STAGING_BYPASS_TEACHER_ID", "STAGING_BYPASS_TEACHER_EMAIL"]) {
    if (present(env[stagingOnlyValue])) {
      errors.push(`${stagingOnlyValue} must not be deployed to production`);
    }
  }

  if (present(env.ALLOW_LEGACY_TEACHER_ALLOWLIST) !== "false") {
    errors.push("ALLOW_LEGACY_TEACHER_ALLOWLIST must be false");
  }
  const classroomMinutes = Number(env.CLASSROOM_SESSION_TTL_MINUTES);
  if (!Number.isInteger(classroomMinutes) || classroomMinutes < 5 || classroomMinutes > 240) {
    errors.push("CLASSROOM_SESSION_TTL_MINUTES must be an integer from 5 through 240");
  }
  const pendingMinutes = Number(env.PENDING_SESSION_TTL_MINUTES);
  if (!Number.isInteger(pendingMinutes) || pendingMinutes < 5 || pendingMinutes > 120) {
    errors.push("PENDING_SESSION_TTL_MINUTES must be an integer from 5 through 120");
  }
  const cookieSeconds = Number(env.AUTH_COOKIE_TTL_SECONDS);
  if (!Number.isInteger(cookieSeconds) || cookieSeconds < 3600 || cookieSeconds > 2_592_000) {
    errors.push("AUTH_COOKIE_TTL_SECONDS must be an integer from 3600 through 2592000");
  }

  for (const name of Object.keys(env)) {
    if (name.startsWith("VITE_") && /(SECRET|SERVICE|DATABASE|JWT|OPENAI|ELEVENLABS)/i.test(name)) {
      errors.push(`${name} is server-only and must not use the VITE_ prefix`);
    }
  }
  return [...new Set(errors)];
}
