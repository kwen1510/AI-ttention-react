import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { postgresEnvironment, resolvePgTool, runPostgresTool } from "./lib/postgres-cli.mjs";
import { assertArchiveEnvironment } from "./lib/environment-preflight.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
assertArchiveEnvironment(process.env);
const connectionUrl = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
const archiveBatch = String(process.env.ARCHIVE_BATCH || "").trim();
if (!connectionUrl || !archiveBatch) {
  console.error("Refusing migration without SUPABASE_DB_URL and ARCHIVE_BATCH from a verified production archive.");
  process.exit(1);
}

const env = postgresEnvironment(connectionUrl, "SUPABASE_DB_URL");
const psql = await resolvePgTool("psql");
const sqlFiles = [
  "server/db/archive/verify_archive.sql",
  "server/db/migrations/20260601_async_mode.sql",
  "server/db/migrations/20260720_classroom_session_lifecycle.sql",
  "server/db/migrations/20260720_native_realtime_memberships.sql",
  "server/db/migrations/20260722_retention_cleanup.sql",
  "server/db/migrations/20260723_access_whitelist_and_prompt_visibility.sql",
  "server/db/migrations/20260724_async_audio_idempotency.sql",
  "server/db/migrations/20260725_multi_instance_session_state.sql",
  "server/db/migrations/20260726_abandoned_session_cleanup.sql",
  "server/db/migrations/20260727_retention_cron.sql",
  "server/db/migrations/20260721_service_only_live_hardening.sql"
];

for (const relativeFile of sqlFiles) {
  const args = ["--set", "ON_ERROR_STOP=1"];
  if (relativeFile.endsWith("verify_archive.sql")) {
    args.push("--set", `archive_batch=${archiveBatch}`);
  }
  args.push("--file", path.join(root, relativeFile));
  await runPostgresTool(psql, args, env);
}

console.log(`Production migrations applied after verified archive ${archiveBatch}.`);
