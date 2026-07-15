import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readLocalEnvironment() {
  const values = {};
  for (const line of readFileSync(path.join(root, ".env.local"), "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    values[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
  return values;
}

function resolveDirectDatabaseUrl(connectionString, projectSupabaseUrl) {
  try {
    const url = new URL(connectionString);
    const projectRef = projectSupabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/i)?.[1];
    if (!projectRef || !url.hostname.includes("pooler.supabase.com")) {
      return connectionString;
    }
    url.username = "postgres";
    url.hostname = `db.${projectRef}.supabase.co`;
    url.port = "5432";
    return url.toString();
  } catch {
    return connectionString;
  }
}

const env = readLocalEnvironment();
const databaseUrl = env.DATABASE_URL || "";
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL || "";
const migrationSql = readFileSync(
  path.join(root, "supabase", "migrations", "202607140005_fix_rls_verification_gaps.sql"),
  "utf8",
);

const client = new pg.Client({
  connectionString: resolveDirectDatabaseUrl(databaseUrl, supabaseUrl),
  ssl: env.PGSSLMODE === "disable" ? false : { rejectUnauthorized: false },
  application_name: "apply-rls-verification-gap-fix",
});

try {
  await client.connect();
  await client.query(migrationSql);
  console.log("migration applied");
} catch (error) {
  console.error("migration failed", error.code || "", String(error.message || error).slice(0, 300));
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
