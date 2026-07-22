/**
 * Platform Overview Listeners counter.
 * Usage: node scripts/verify-platform-overview-listener-count.mjs
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
    const types = read("lib/platform-control-center.ts");
    const service = read("lib/platform-control-center-service.ts");
    const ui = read("components/platform-control-center.tsx");

    record(
        "overview type exposes listeners",
        /totalUsers:\s*number;\s*listeners:\s*number;/.test(types),
    );

    record(
        "listeners counted as distinct registered profiles (not subtraction)",
        service.includes("listeners: totalUsersResult.count")
            && !/listeners:\s*totalUsersResult\.count\s*-\s*/.test(service)
            && !/listeners:[\s\S]{0,80}artists[\s\S]{0,40}producers/.test(service),
    );

    record(
        "Listeners card in overview UI",
        ui.includes('["Listeners", overview?.listeners]')
            && ui.includes('data-overview-metric={String(label)}'),
    );

    record(
        "Listeners sits in user-role section after Total users",
        /"Total users"[\s\S]{0,120}"Listeners"[\s\S]{0,400}"Artists"[\s\S]{0,120}"Producers"/.test(ui),
    );

    record(
        "Ringtones and content metrics still present",
        ui.includes('["Ringtones", overview?.totalRingtones]')
            && ui.includes('["Songs", overview?.totalSongs]')
            && ui.includes('["Followers", overview?.totalFollowers]'),
    );

    writeFileSync(
        path.join(evidenceDir, "platform-overview-listener-count-evidence.json"),
        JSON.stringify({ results, checkedAt: new Date().toISOString() }, null, 2),
    );
    const fails = results.filter((item) => !item.ok);
    console.log(`\nPLATFORM_OVERVIEW_LISTENER_COUNT_FAILS=${fails.length}`);
    process.exit(fails.length ? 1 : 0);
}

main();
