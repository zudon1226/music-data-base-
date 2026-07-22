/**
 * Signup account-type authorization / forgery rejection.
 * Usage: node scripts/verify-signup-role-auth.mjs
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
    const redeem = read("app/api/founding-invites/redeem/route.ts");
    const inviteService = read("lib/founding-invite-service.ts");
    const metadata = read("lib/auth-user-metadata.ts");

    record(
        "parseSignupAccountTypeInput rejects unknown values",
        helper.includes("parseSignupAccountTypeInput")
            && helper.includes("Invalid account type"),
    );

    record(
        "redeem route rejects before invite consume",
        /parseSignupAccountTypeInput\(body\.accountType\)[\s\S]*?status:\s*400[\s\S]*?redeemFoundingInvite/.test(redeem),
    );

    record(
        "redeemFoundingInvite rejects invalid accountType",
        /parseSignupAccountTypeInput\(options\.accountType\)[\s\S]*?ok: false/.test(inviteService),
    );

    record(
        "authenticated userId required via requireMatchingUserId",
        redeem.includes("requireMatchingUserId")
            && redeem.includes('"/api/founding-invites/redeem"'),
    );

    record(
        "signup metadata role stays listener until approval",
        metadata.includes('role: "listener"')
            && metadata.includes("requestedAccountType"),
    );

    record(
        "no second conflicting role column invented",
        !helper.includes("profiles.signup_role")
            && !helper.includes("account_type_request"),
    );

    writeFileSync(
        path.join(evidenceDir, "signup-role-auth-evidence.json"),
        JSON.stringify({ results, checkedAt: new Date().toISOString() }, null, 2),
    );
    const fails = results.filter((item) => !item.ok);
    console.log(`\nSIGNUP_ROLE_AUTH_FAILS=${fails.length}`);
    process.exit(fails.length ? 1 : 0);
}

main();
