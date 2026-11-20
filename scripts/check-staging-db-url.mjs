import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const STAGING_REF = "jzlegcbotqfzevtczwhx";
const PRODUCTION_REF = "aehuszoadgqtbkxsliyy";
const candidates = process.argv.slice(2);

for (const file of candidates) {
    if (!existsSync(file)) {
        console.log("missing", file);
        continue;
    }
    const env = {};
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
        const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (match) env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
    }
    const url = env.DATABASE_URL || env.SUPABASE_DB_URL || "";
    if (!url) {
        console.log("ok=false", "file=" + file, "database_url=present:false");
        continue;
    }
    let host = "";
    let user = "";
    try {
        const parsed = new URL(url);
        host = parsed.hostname.toLowerCase();
        user = decodeURIComponent(parsed.username).toLowerCase();
    } catch {
        console.log("ok=false", "file=" + file, "database_url=invalid");
        continue;
    }
    const stagingOk =
        host === `db.${STAGING_REF}.supabase.co`
        || (host.includes("pooler.supabase.com") && user.includes(STAGING_REF));
    const productionLeak = host.includes(PRODUCTION_REF) || user.includes(PRODUCTION_REF);
    console.log(
        "ok=" + (stagingOk && !productionLeak),
        "file=" + file,
        "database_url=present:true",
        "host=" + host,
        "staging_host=" + stagingOk,
        "production_excluded=" + !productionLeak,
    );
}