/**
 * Artist & Producer multi-role signup grants.
 * Usage: node scripts/verify-signup-multi-role.mjs
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
    const helper = read("lib/signup-account-type.ts");
    const inviteService = read("lib/founding-invite-service.ts");

    record(
        "artist_producer grants both creator roles",
        /accountType === "artist_producer"[\s\S]*?userRoles:\s*\[artistRole,\s*producerRole\]/.test(helper)
            || helper.includes("userRoles: [artistRole, producerRole]"),
    );

    record(
        "approval loops grants.userRoles (multi upsert)",
        /for \(const role of grants\.userRoles\)[\s\S]*?user_roles[\s\S]*?onConflict:\s*"user_id,role"/.test(inviteService),
    );

    record(
        "listener grant path does not invent creator roles",
        /accountType === "listener"[\s\S]*?userRoles:\s*\[\] as string\[\]/.test(helper),
    );

    record(
        "one user account — no duplicate signup user create",
        !/signUp\([\s\S]*signUp\(/.test(read("app/page.tsx").slice(
            read("app/page.tsx").indexOf("async function handleAuthSubmit"),
            read("app/page.tsx").indexOf("async function handleAuthSubmit") + 2500,
        )),
    );

    writeFileSync(
        path.join(evidenceDir, "signup-multi-role-evidence.json"),
        JSON.stringify({ results, checkedAt: new Date().toISOString() }, null, 2),
    );
    const fails = results.filter((item) => !item.ok);
    console.log(`\nSIGNUP_MULTI_ROLE_FAILS=${fails.length}`);
    process.exit(fails.length ? 1 : 0);
}

main();
