import test from "node:test";
import assert from "node:assert/strict";

import {
  validateArchiveEnvironment,
  validateDeploymentEnvironment
} from "../scripts/lib/environment-preflight.mjs";

const ref = "abcdefghijklmnopqrst";

test("archive preflight accepts direct/session URLs without returning secret material", () => {
  const direct = `postgresql://postgres:private-password@db.${ref}.supabase.co:5432/postgres`;
  const session = `postgresql://postgres.${ref}:private-password@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres`;
  const base = { SUPABASE_URL: `https://${ref}.supabase.co` };

  assert.deepEqual(validateArchiveEnvironment({ ...base, SUPABASE_DB_URL: direct }), []);
  assert.deepEqual(validateArchiveEnvironment({ ...base, SUPABASE_DB_URL: session }), []);
});

test("archive preflight rejects placeholders, wrong projects, transaction pooling, and disabled TLS", () => {
  const base = { SUPABASE_URL: `https://${ref}.supabase.co` };
  const cases = [
    "<paste-url>",
    `postgresql://postgres:%5BYOUR-PASSWORD%5D@db.${ref}.supabase.co:5432/postgres`,
    `postgresql://postgres:password@db.wrongproject.supabase.co:5432/postgres`,
    `postgresql://postgres.${ref}:password@pooler.supabase.com:6543/postgres`,
    `postgresql://postgres:password@db.${ref}.supabase.co:5432/postgres?sslmode=disable`
  ];
  for (const SUPABASE_DB_URL of cases) {
    assert.notEqual(validateArchiveEnvironment({ ...base, SUPABASE_DB_URL }).length, 0);
  }
});

function validDeployment() {
  return {
    NODE_ENV: "production",
    APP_PUBLIC_ORIGIN: "https://app.example",
    APP_ORIGINS: "https://app.example",
    SUPABASE_URL: `https://${ref}.supabase.co`,
    VITE_SUPABASE_URL: `https://${ref}.supabase.co`,
    SUPABASE_PUBLISHABLE_KEY: "sb_publishable_public-value",
    VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_public-value",
    SUPABASE_SECRET_KEY: "sb_secret_server-value",
    AUTH_COOKIE_SECRET: "cookie-secret-value-with-more-than-32-characters",
    SESSION_JOIN_SECRET: "join-secret-value-with-more-than-32-characters",
    OPENAI_API_KEY: "openai-server-test-value",
    ELEVENLABS_KEY: "elevenlabs-server-test-value",
    AUTH_COOKIE_TTL_SECONDS: "2592000",
    CLASSROOM_SESSION_TTL_MINUTES: "240",
    PENDING_SESSION_TTL_MINUTES: "60",
    ALLOW_LEGACY_TEACHER_ALLOWLIST: "false"
  };
}

test("deployment preflight accepts only the new-key, HTTPS, secret-separated contract", () => {
  assert.deepEqual(validateDeploymentEnvironment(validDeployment()), []);
});

test("deployment preflight rejects legacy keys, migration URLs, insecure origins, and reused secrets", () => {
  const env = validDeployment();
  env.APP_PUBLIC_ORIGIN = "http://app.example";
  env.APP_ORIGINS = "http://app.example";
  env.SUPABASE_ANON_KEY = "legacy";
  env.SUPABASE_DB_URL = "postgresql://must-not-deploy";
  env.SESSION_JOIN_SECRET = env.AUTH_COOKIE_SECRET;
  env.VITE_SUPABASE_SECRET_KEY = env.SUPABASE_SECRET_KEY;

  const errors = validateDeploymentEnvironment(env).join("\n");
  assert.match(errors, /HTTPS/);
  assert.match(errors, /SUPABASE_ANON_KEY/);
  assert.match(errors, /must not be deployed to DigitalOcean/);
  assert.match(errors, /must be independent/);
  assert.match(errors, /VITE_SUPABASE_SECRET_KEY/);
  assert.equal(errors.includes(env.AUTH_COOKIE_SECRET), false);
});

test("deployment preflight rejects test bypasses, staging identities, and missing providers", () => {
  const env = validDeployment();
  env.STAGING_AUTH_BYPASS = "true";
  env.ALLOW_DEV_TEST = "true";
  env.MOCK_AI_SERVICES = "true";
  env.STAGING_BYPASS_TEACHER_EMAIL = "staging@example.com";
  delete env.OPENAI_API_KEY;

  const errors = validateDeploymentEnvironment(env).join("\n");
  assert.match(errors, /STAGING_AUTH_BYPASS/);
  assert.match(errors, /ALLOW_DEV_TEST/);
  assert.match(errors, /MOCK_AI_SERVICES/);
  assert.match(errors, /STAGING_BYPASS_TEACHER_EMAIL/);
  assert.match(errors, /OPENAI_API_KEY is required/);
});
