import "dotenv/config";

const requiredEnv = ["SUPABASE_URL", "SUPABASE_SECRET_KEY"];
const missing = requiredEnv.filter((key) => !process.env[key]);

if (missing.length > 0) {
  console.error(`Missing ${missing.join(", ")}. Add them to .env or export them before running this script.`);
  process.exit(1);
}

const tables = [
  "async_sessions",
  "async_groups",
  "async_segments",
  "async_group_reports"
];

async function checkTable(table) {
  const url = `${process.env.SUPABASE_URL.replace(/\/+$/, "")}/rest/v1/${table}?select=id&limit=1`;
  const response = await fetch(url, {
    headers: {
      apikey: process.env.SUPABASE_SECRET_KEY
    }
  });
  const text = await response.text();

  if (response.ok) {
    return { table, ok: true };
  }

  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }

  return {
    table,
    ok: false,
    status: response.status,
    code: parsed?.code || null,
    message: parsed?.message || text
  };
}

const results = await Promise.all(tables.map(checkTable));
const failed = results.filter((result) => !result.ok);

for (const result of results) {
  if (result.ok) {
    console.log(`ok: ${result.table}`);
  } else if (result.code === "PGRST205") {
    console.log(`missing: ${result.table} (${result.code})`);
  } else {
    console.log(`failed: ${result.table} (${result.status}${result.code ? ` ${result.code}` : ""}) ${result.message}`);
  }
}

if (failed.length > 0) {
  console.error("\nAsync migration is not fully applied.");
  process.exit(1);
}

console.log("\nAsync migration is applied.");
