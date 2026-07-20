import { spawn } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import path from "node:path";

const archiveDir = path.resolve(process.argv[2] || "");
const restoreUrl = process.env.RESTORE_DATABASE_URL;
if (!process.argv[2] || !restoreUrl) {
  console.error("Usage: RESTORE_DATABASE_URL=postgresql://... CONFIRM_RESTORE_BATCH=<batch> npm run db:archive:restore -- archives/<batch>");
  process.exit(1);
}
const manifest = JSON.parse(await readFile(path.join(archiveDir, "manifest.json"), "utf8"));
if (process.env.CONFIRM_RESTORE_BATCH !== manifest.batchId) {
  throw new Error("Refusing destructive restore: CONFIRM_RESTORE_BATCH must exactly match the manifest batchId");
}

const url = new URL(restoreUrl);
if (!/^postgres(ql)?:$/.test(url.protocol)) throw new Error("Restore URL must use PostgreSQL");
const env = {
  ...process.env,
  PGHOST: url.hostname,
  PGPORT: url.port || "5432",
  PGDATABASE: decodeURIComponent(url.pathname.slice(1)),
  PGUSER: decodeURIComponent(url.username),
  PGPASSWORD: decodeURIComponent(url.password),
  PGSSLMODE: url.searchParams.get("sslmode") || "require"
};
const preferredPgRestore = "/opt/homebrew/opt/postgresql@17/bin/pg_restore";
let pgRestore = "pg_restore";
try {
  await access(preferredPgRestore);
  pgRestore = preferredPgRestore;
} catch {
  // PATH fallback.
}
const child = spawn(pgRestore, [
  "--clean", "--if-exists", "--no-owner", "--no-acl",
  "--dbname", env.PGDATABASE,
  path.join(archiveDir, manifest.dumpFile)
], { env, stdio: "inherit" });
child.on("exit", (code) => process.exit(code ?? 1));
