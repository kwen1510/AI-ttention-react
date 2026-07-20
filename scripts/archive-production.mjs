import "dotenv/config";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertArchiveEnvironment } from "./lib/environment-preflight.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
assertArchiveEnvironment(process.env);
const databaseUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
if (!databaseUrl) {
  console.error("Refusing to archive without DATABASE_URL or SUPABASE_DB_URL (direct Postgres connection string).");
  process.exit(1);
}

const now = new Date();
const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
const schemaStamp = stamp.replace("T", "_").replace("Z", "");
const batchId = `aittention-${stamp}`;
const archiveSchema = `aittention_archive_${schemaStamp}`;
const archiveRoot = path.join(root, "archives");
const outputDir = path.join(archiveRoot, batchId);
const dumpPath = path.join(outputDir, "database.dump");
const sqlPath = path.join(root, "server", "db", "archive", "archive_current_application.sql");
const verifySqlPath = path.join(root, "server", "db", "archive", "verify_archive.sql");
const parsedDatabaseUrl = new URL(databaseUrl);
if (!/^postgres(ql)?:$/.test(parsedDatabaseUrl.protocol)) throw new Error("Archive URL must use PostgreSQL");
const postgresEnv = {
  ...process.env,
  PGHOST: parsedDatabaseUrl.hostname,
  PGPORT: parsedDatabaseUrl.port || "5432",
  PGDATABASE: decodeURIComponent(parsedDatabaseUrl.pathname.slice(1)),
  PGUSER: decodeURIComponent(parsedDatabaseUrl.username),
  PGPASSWORD: decodeURIComponent(parsedDatabaseUrl.password),
  PGSSLMODE: parsedDatabaseUrl.searchParams.get("sslmode") || "require"
};

function run(command, args, { capture = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: postgresEnv,
      stdio: capture ? ["ignore", "pipe", "inherit"] : "inherit"
    });
    let stdout = "";
    if (capture) child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolve(stdout) : reject(new Error(`${command} exited ${code}`)));
  });
}

async function resolvePgTool(name) {
  const candidates = [
    process.env.PG_BIN_DIR && path.join(process.env.PG_BIN_DIR, name),
    `/opt/homebrew/opt/postgresql@17/bin/${name}`,
    name
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (candidate === name) return candidate;
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next known installation.
    }
  }
  return name;
}

const psql = await resolvePgTool("psql");
const pgDump = await resolvePgTool("pg_dump");

const serverVersionNumber = Number((await run(psql, ["--tuples-only", "--no-align", "--command", "show server_version_num"], { capture: true })).trim());
const pgDumpVersion = await run(pgDump, ["--version"], { capture: true });
const clientMajor = Number(pgDumpVersion.match(/(\d+)(?:\.\d+)?/)?.[1]);
const serverMajor = Math.floor(serverVersionNumber / 10_000);
if (!Number.isInteger(clientMajor) || !Number.isInteger(serverMajor) || clientMajor < serverMajor) {
  throw new Error(`Refusing archive: pg_dump ${clientMajor || "unknown"} is older than PostgreSQL ${serverMajor || "unknown"}. Install a matching/newer libpq client and put it first on PATH.`);
}

await mkdir(archiveRoot, { recursive: true, mode: 0o700 });
await mkdir(outputDir, { recursive: false, mode: 0o700 });

// Full custom-format dump is the authoritative recovery artifact, including
// Auth and other non-public schemas. No destructive SQL is executed here.
await run(pgDump, ["--format=custom", "--no-owner", "--no-acl", "--file", dumpPath]);
await run(psql, [
  "--set", "ON_ERROR_STOP=1",
  "--set", `archive_schema=${archiveSchema}`,
  "--set", `archive_batch=${batchId}`,
  "--file", sqlPath
]);
await run(psql, [
  "--set", "ON_ERROR_STOP=1",
  "--set", `archive_batch=${batchId}`,
  "--file", verifySqlPath
]);
const completeness = (await run(psql, [
  "--tuples-only", "--no-align",
  "--command", `select (select count(*) from private.aittention_archive_catalog where batch_id = '${batchId}') = (select count(*) from pg_tables where schemaname = 'public' and tablename not like 'aittention_archive_%')`
], { capture: true })).trim();
if (completeness !== "t") {
  throw new Error("Archive catalog does not cover every current public application table");
}

const catalogCsv = await run(psql, [
  "--csv", "--tuples-only",
  "--command", `select table_name,source_row_count,row_count from private.aittention_archive_catalog where batch_id = '${batchId}' order by table_name`
], { capture: true });
const dump = await readFile(dumpPath);
const manifest = {
  formatVersion: 1,
  batchId,
  archiveSchema,
  createdAt: now.toISOString(),
  dumpFile: "database.dump",
  dumpSha256: createHash("sha256").update(dump).digest("hex"),
  dumpBytes: dump.length,
  archivedTablesCsv: catalogCsv.trim(),
  restoreCommand: "pg_restore --clean --if-exists --no-owner --no-acl --dbname <RESTORE_DATABASE_URL> database.dump"
};
await writeFile(path.join(outputDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx", mode: 0o600 });
console.log(`Archive created: ${outputDir}`);
console.log(`Batch: ${batchId}`);
console.log(`SHA-256: ${manifest.dumpSha256}`);
