/**
 * Platform Overview artist/producer distinct-user counting.
 * Usage: node scripts/verify-platform-overview-role-deduplication.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDir = path.join(root, "tmp");
mkdirSync(evidenceDir, { recursive: true });
const results = [];

function record(name, ok, detail = "") {
    results.push({ name, ok, detail });
    console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}

function read(rel) {
    return readFileSync(path.join(root, rel), "utf8").replace(/\r\n/g, "\n");
}

function main() {
    const service = read("lib/platform-control-center-service.ts");
    const helper = read("lib/signup-account-type.ts");

    record(
        "countDistinctCreatorUsers uses Set of user ids",
        service.includes("countDistinctCreatorUsers")
            && service.includes("const ids = new Set<string>()"),
    );

    record(
        "artists union profiles.account_type + active user_roles",
        /countDistinctCreatorUsers\(supabase,\s*\{[\s\S]*?profileAccountTypes:\s*ARTIST_ACCOUNT_TYPES[\s\S]*?userRoles:\s*ARTIST_ROLE_TOKENS/.test(service),
    );

    record(
        "producers union profiles.account_type + active user_roles",
        /countDistinctCreatorUsers\(supabase,\s*\{[\s\S]*?profileAccountTypes:\s*PRODUCER_ACCOUNT_TYPES[\s\S]*?userRoles:\s*PRODUCER_ROLE_TOKENS/.test(service),
    );

    record(
        "artist_producer primary is single account_type with both roles",
        helper.includes("primaryAccountType: artistRole")
            && helper.includes("userRoles: [artistRole, producerRole]"),
    );

    record(
        "total users remains distinct profile count",
        /countRows\(supabase,\s*"profiles"\)/.test(service)
            && /totalUsers:\s*totalUsersResult\.count/.test(service),
    );

    writeFileSync(
        path.join(evidenceDir, "platform-overview-role-deduplication-evidence.json"),
        JSON.stringify({ results, checkedAt: new Date().toISOString() }, null, 2),
    );
    const fails = results.filter((item) => !item.ok);
    console.log(`\nPLATFORM_OVERVIEW_ROLE_DEDUPLICATION_FAILS=${fails.length}`);
    process.exit(fails.length ? 1 : 0);
}

main();
