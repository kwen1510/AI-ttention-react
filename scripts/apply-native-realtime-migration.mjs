import path from "node:path";
import { fileURLToPath } from "node:url";
import { postgresEnvironment, resolvePgTool, runPostgresTool } from "./lib/postgres-cli.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const databaseUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || process.env.POSTGRES_URL;
const migrations = [
  "server/db/migrations/20260720_classroom_session_lifecycle.sql",
  "server/db/migrations/20260720_native_realtime_memberships.sql",
  "server/db/migrations/20260728_hybrid_live_audio_and_rolling_summaries.sql"
];

if (!databaseUrl) {
  console.error("Missing DATABASE_URL, SUPABASE_DB_URL, or POSTGRES_URL.");
  process.exit(1);
}

const postgresEnv = postgresEnvironment(databaseUrl);
const psql = await resolvePgTool("psql");

for (const migration of migrations) {
  await runPostgresTool(psql, [
    "--set", "ON_ERROR_STOP=1",
    "--file", path.join(root, migration)
  ], postgresEnv);
}
