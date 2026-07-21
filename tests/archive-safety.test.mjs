import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("archive SQL is browser-denied, RLS protected, audited, and service-role scoped", async () => {
  const sql = await readFile(new URL("../server/db/archive/archive_current_application.sql", import.meta.url), "utf8");
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /revoke all on (schema|table).*anon, authenticated/i);
  assert.match(sql, /grant select on table .* to service_role/i);
  assert.match(sql, /auth\.role\(\) <> 'service_role'/i);
  assert.match(sql, /aittention_archive_access_log/i);
  assert.doesNotMatch(sql, /grant select on table .* to (anon|authenticated)/i);
});

test("archive tooling refuses to fall back to API keys or an implicit database", async () => {
  const script = await readFile(new URL("../scripts/archive-production.mjs", import.meta.url), "utf8");
  assert.match(script, /Refusing to archive without DATABASE_URL or SUPABASE_DB_URL/);
  assert.doesNotMatch(script, /SUPABASE_(SECRET|SERVICE_ROLE|ANON|PUBLISHABLE)_KEY/);
  assert.match(script, /pg_dump/);
});

test("live reset is archive-gated and preserves the reusable question library", async () => {
  const sql = await readFile(new URL("../server/db/cutover/reset_operational_data.sql", import.meta.url), "utf8");
  assert.match(sql, /RESET_OPERATIONAL_DATA/);
  assert.match(sql, /aittention_archive_catalog/);
  assert.match(sql, /source_row_count = row_count/);
  assert.doesNotMatch(sql, /truncate table public\.(teacher_prompts|prompt_library|teacher_access)/i);
  assert.doesNotMatch(sql, /delete from auth\.users/i);
});

test("production migration, reset, and rollback runners are archive-gated and keep database URLs out of argv", async () => {
  const files = [
    "../scripts/migrate-production.mjs",
    "../scripts/reset-production.mjs",
    "../scripts/rollback-production.mjs",
    "../scripts/apply-native-realtime-migration.mjs",
    "../scripts/apply-async-migration.mjs"
  ];
  for (const file of files) {
    const source = await readFile(new URL(file, import.meta.url), "utf8");
    assert.doesNotMatch(source, /spawn\([^\n]+\[\s*(databaseUrl|connectionUrl)/);
    assert.match(source, /postgresEnvironment/);
  }

  for (const file of files.slice(0, 3)) {
    const source = await readFile(new URL(file, import.meta.url), "utf8");
    assert.match(source, /import ["']dotenv\/config["']/);
  }

  const archive = await readFile(new URL("../scripts/archive-production.mjs", import.meta.url), "utf8");
  assert.match(archive, /import ["']dotenv\/config["']/);

  const migration = await readFile(new URL("../scripts/migrate-production.mjs", import.meta.url), "utf8");
  assert.match(migration, /ARCHIVE_BATCH/);
  assert.match(migration, /verify_archive\.sql/);
  const reset = await readFile(new URL("../scripts/reset-production.mjs", import.meta.url), "utf8");
  assert.match(reset, /CONFIRM_RESET.*RESET_OPERATIONAL_DATA/s);
  const rollback = await readFile(new URL("../scripts/rollback-production.mjs", import.meta.url), "utf8");
  assert.match(rollback, /CONFIRM_ROLLBACK.*RESTORE_OPERATIONAL_DATA/s);
});

test("retention cleanup is bounded, audited, and unavailable to browser roles", async () => {
  const sql = await readFile(new URL("../server/db/migrations/20260722_retention_cleanup.sql", import.meta.url), "utf8");
  assert.match(sql, /aittention_retention_log/i);
  assert.match(sql, /is_anonymous is true/i);
  assert.match(sql, /not exists[\s\S]+expires_at > now\(\)/i);
  assert.match(sql, /revoke all on function[\s\S]+from public, anon, authenticated/i);
  assert.match(sql, /grant execute on function[\s\S]+to service_role/i);
});

test("production access migration enforces the exact whitelist and global/local prompts", async () => {
  const sql = await readFile(new URL("../server/db/migrations/20260723_access_whitelist_and_prompt_visibility.sql", import.meta.url), "utf8");
  assert.match(sql, /role in \('admin', 'teacher', 'guest'\)/i);
  assert.match(sql, /update public\.teacher_access[\s\S]+active = false/i);
  assert.match(sql, /ri\.kwmachinelearning@gmail\.com[\s\S]+'admin'/i);
  assert.match(sql, /kuangwen\.chan@ri\.edu\.sg[\s\S]+'teacher'/i);
  assert.match(sql, /yuwen\.eng@ri\.edu\.sg[\s\S]+'teacher'/i);
  assert.match(sql, /machinelearning\.kw@gmail\.com[\s\S]+'guest'/i);
  assert.match(sql, /alter column is_public set not null/i);
});

test("asynchronous audio retries have a database uniqueness boundary", async () => {
  const sql = await readFile(new URL("../server/db/migrations/20260724_async_audio_idempotency.sql", import.meta.url), "utf8");
  assert.match(sql, /add column if not exists client_chunk_id text/i);
  assert.match(sql, /unique index[\s\S]+async_group_id, client_chunk_id/i);
});

test("classroom session reuse and final-upload grace survive multiple app instances", async () => {
  const sql = await readFile(new URL("../server/db/migrations/20260725_multi_instance_session_state.sql", import.meta.url), "utf8");
  assert.match(sql, /add column if not exists is_current boolean not null default false/i);
  assert.match(sql, /add column if not exists accept_uploads_until timestamptz/i);
  assert.match(sql, /unique index[\s\S]+owner_id, mode[\s\S]+where is_current = true/i);
  assert.match(sql, /check \(not is_current or \(ended_reason is null and end_time is null\)\)/i);

  const migrationRunner = await readFile(new URL("../scripts/migrate-production.mjs", import.meta.url), "utf8");
  assert.match(migrationRunner, /20260725_multi_instance_session_state\.sql/);
});

test("abandoned pending sessions are deleted by the audited service-only retention job", async () => {
  const sql = await readFile(new URL("../server/db/migrations/20260726_abandoned_session_cleanup.sql", import.meta.url), "utf8");
  assert.match(sql, /start_time is null/i);
  assert.match(sql, /active is false/i);
  assert.match(sql, /delete from public\.sessions/i);
  assert.match(sql, /abandoned_sessions_deleted/i);
  assert.match(sql, /revoke all on function[\s\S]+from public, anon, authenticated/i);
  assert.match(sql, /grant execute on function[\s\S]+to service_role/i);

  const migrationRunner = await readFile(new URL("../scripts/migrate-production.mjs", import.meta.url), "utf8");
  assert.match(migrationRunner, /20260726_abandoned_session_cleanup\.sql/);
});
