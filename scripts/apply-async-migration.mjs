import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { postgresEnvironment, resolvePgTool, runPostgresTool } from "./lib/postgres-cli.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const migrationPath = path.join(rootDir, "server", "db", "migrations", "20260601_async_mode.sql");
const databaseUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || process.env.POSTGRES_URL;

if (!databaseUrl) {
  console.error("Missing DATABASE_URL, SUPABASE_DB_URL, or POSTGRES_URL.");
  console.error("Set it to the Supabase Postgres connection string, then rerun npm run db:migrate:async.");
  process.exit(1);
}

if (!existsSync(migrationPath)) {
  console.error(`Migration file not found: ${migrationPath}`);
  process.exit(1);
}

const postgresEnv = postgresEnvironment(databaseUrl);
const psql = await resolvePgTool("psql");
await runPostgresTool(psql, [
  "--set", "ON_ERROR_STOP=1",
  "--file", migrationPath
], postgresEnv);
