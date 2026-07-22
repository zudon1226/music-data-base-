/**
 * Signup account-type selection wiring.
 * Usage: node scripts/verify-signup-account-type.mjs
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
    const page = read("app/page.tsx");
    const helper = read("lib/signup-account-type.ts");
    const metadata = read("lib/auth-user-metadata.ts");
    const redeem = read("app/api/founding-invites/redeem/route.ts");
    const inviteService = read("lib/founding-invite-service.ts");

    record(
        "canonical signup account types defined",
        helper.includes('"listener"')
            && helper.includes('"artist"')
            && helper.includes('"producer"')
            && helper.includes('"artist_producer"')
            && helper.includes("DEFAULT_SIGNUP_ACCOUNT_TYPE"),
    );

    const inviteIdx = page.indexOf('t("auth.inviteCode")');
    const accountTypeIdx = page.indexOf('data-signup-account-type="true"');
    const emailIdx = page.indexOf('t("auth.email")', accountTypeIdx >= 0 ? accountTypeIdx : 0);
    record(
        "signup UI places account type between invite and email",
        inviteIdx >= 0
            && accountTypeIdx > inviteIdx
            && emailIdx > accountTypeIdx
            && (accountTypeIdx - inviteIdx) < 2500
            && (emailIdx - accountTypeIdx) < 2500,
        `invite=${inviteIdx} accountType=${accountTypeIdx} email=${emailIdx}`,
    );

    record(
        "signup defaults to Listener",
        page.includes("useState<SignupAccountType>(DEFAULT_SIGNUP_ACCOUNT_TYPE)")
            && helper.includes('DEFAULT_SIGNUP_ACCOUNT_TYPE: SignupAccountType = "listener"'),
    );

    record(
        "helper text present",
        page.includes('t("auth.accountTypeHelp")')
            && read("lib/i18n/messages/en.ts").includes("Creator accounts can still listen"),
    );

    record(
        "signup metadata carries requestedAccountType",
        metadata.includes("requestedAccountType")
            && page.includes("requestedAccountType: signupAccountType"),
    );

    record(
        "redeem API validates accountType server-side",
        redeem.includes("parseSignupAccountTypeInput")
            && redeem.includes("accountType: parsedAccountType.accountType")
            && helper.includes("Invalid account type"),
    );

    record(
        "invite redeem persists requested account type",
        inviteService.includes("encodeSignupAccountTypeMarker")
            && inviteService.includes("persistRequestedSignupAccountType")
            && inviteService.includes("requestedAccountType"),
    );

    record(
        "approval grants from requested signup type",
        inviteService.includes("resolveSignupAccountTypeGrants")
            && inviteService.includes("decodeSignupAccountTypeMarker"),
    );

    writeFileSync(
        path.join(evidenceDir, "signup-account-type-evidence.json"),
        JSON.stringify({ results, checkedAt: new Date().toISOString() }, null, 2),
    );
    const fails = results.filter((item) => !item.ok);
    console.log(`\nSIGNUP_ACCOUNT_TYPE_FAILS=${fails.length}`);
    process.exit(fails.length ? 1 : 0);
}

main();
