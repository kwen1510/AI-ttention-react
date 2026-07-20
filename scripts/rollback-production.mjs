import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { postgresEnvironment, resolvePgTool, runPostgresTool } from "./lib/postgres-cli.mjs";
import { assertArchiveEnvironment } from "./lib/environment-preflight.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
assertArchiveEnvironment(process.env);
const connectionUrl = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
const archiveBatch = String(process.env.ARCHIVE_BATCH || "").trim();
if (!connectionUrl || !archiveBatch || process.env.CONFIRM_ROLLBACK !== "RESTORE_OPERATIONAL_DATA") {
  console.error("Refusing rollback: require SUPABASE_DB_URL, ARCHIVE_BATCH, and CONFIRM_ROLLBACK=RESTORE_OPERATIONAL_DATA.");
  process.exit(1);
}

const env = postgresEnvironment(connectionUrl, "SUPABASE_DB_URL");
const psql = await resolvePgTool("psql");
await runPostgresTool(psql, [
  "--set", "ON_ERROR_STOP=1",
  "--set", `archive_batch=${archiveBatch}`,
  "--file", path.join(root, "server/db/archive/verify_archive.sql")
], env);
await runPostgresTool(psql, [
  "--set", "ON_ERROR_STOP=1",
  "--set", `archive_batch=${archiveBatch}`,
  "--set", "confirm_rollback=RESTORE_OPERATIONAL_DATA",
  "--file", path.join(root, "server/db/cutover/rollback_operational_data.sql")
], env);
console.log(`Operational data restored from archive ${archiveBatch}.`);
