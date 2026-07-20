import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import path from "node:path";

export function postgresEnvironment(connectionUrl, label = "Postgres URL") {
  if (!connectionUrl) throw new Error(`${label} is required`);
  const parsed = new URL(connectionUrl);
  if (!/^postgres(ql)?:$/.test(parsed.protocol)) {
    throw new Error(`${label} must use postgresql://`);
  }
  const database = decodeURIComponent(parsed.pathname.slice(1));
  const user = decodeURIComponent(parsed.username);
  if (!parsed.hostname || !database || !user) {
    throw new Error(`${label} must include host, database, and username`);
  }
  return {
    ...process.env,
    PGHOST: parsed.hostname,
    PGPORT: parsed.port || "5432",
    PGDATABASE: database,
    PGUSER: user,
    PGPASSWORD: decodeURIComponent(parsed.password),
    PGSSLMODE: parsed.searchParams.get("sslmode") || "require"
  };
}
export async function resolvePgTool(name) {
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

export function runPostgresTool(command, args, env, { capture = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env,
      stdio: capture ? ["ignore", "pipe", "inherit"] : "inherit"
    });
    let stdout = "";
    if (capture) child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`${path.basename(command)} exited ${code ?? 1}`));
    });
  });
}
