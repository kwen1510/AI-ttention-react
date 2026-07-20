import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import path from "node:path";

const archiveDir = path.resolve(process.argv[2] || "");
if (!process.argv[2]) {
  console.error("Usage: npm run db:archive:verify -- archives/<batch-id>");
  process.exit(1);
}

const manifest = JSON.parse(await readFile(path.join(archiveDir, "manifest.json"), "utf8"));
const dumpPath = path.join(archiveDir, manifest.dumpFile);
const dump = await readFile(dumpPath);
const actualHash = createHash("sha256").update(dump).digest("hex");
if (actualHash !== manifest.dumpSha256) throw new Error("Archive dump checksum does not match its manifest");

const preferredPgRestore = "/opt/homebrew/opt/postgresql@17/bin/pg_restore";
let pgRestore = "pg_restore";
try {
  await access(preferredPgRestore);
  pgRestore = preferredPgRestore;
} catch {
  // PATH fallback is version-checked implicitly when it reads the dump.
}

const listedObjects = await new Promise((resolve, reject) => {
  const child = spawn(pgRestore, ["--list", dumpPath], { stdio: ["ignore", "pipe", "inherit"] });
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.on("error", reject);
  child.on("exit", (code) => code === 0 ? resolve(output) : reject(new Error(`pg_restore exited ${code}`)));
});
if (!/TABLE DATA|SCHEMA/.test(listedObjects)) throw new Error("Archive dump contains no restorable schema/table data");

console.log(`Verified archive ${manifest.batchId}`);
console.log(`SHA-256 ${actualHash}`);
console.log(`Bytes ${dump.length}`);
