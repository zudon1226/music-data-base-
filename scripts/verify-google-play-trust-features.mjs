/**
 * Google Play trust features — static verification (no destructive API calls).
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const results = [];

function record(name, ok, detail = "") {
    results.push({ name, ok: Boolean(ok), detail: String(detail || "") });
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

function read(rel) {
    const full = path.join(root, rel);
    if (!existsSync(full)) return "";
    return readFileSync(full, "utf8");
}

const migration = read("supabase/migrations/202610011800_user_hidden_content_and_purchase_retention.sql");
const blockedApi = read("app/api/blocked-users/route.ts");
const hiddenApi = read("app/api/user-hidden-content/route.ts");
const deleteApi = read("app/api/account/delete/route.ts");
const deleteService = read("lib/account-deletion-service.ts");
const publicPage = read("app/account-deletion/page.tsx");
const modReports = read("app/api/moderation/reports/route.ts");
const blockEnforce = read("lib/user-block-enforcement.ts");
const profileDash = read("components/user-profile-dashboard.tsx");

record("user_hidden_content migration present", migration.includes("user_hidden_content") && migration.includes("auth.uid()"));
record("ringtone purchase buyer retention migration", migration.includes("ringtone_purchases") && migration.includes("on delete set null"));
record("blocked-users API CRUD", blockedApi.includes("export async function GET") && blockedApi.includes("POST") && blockedApi.includes("DELETE"));
record("hidden content API CRUD", hiddenApi.includes("user_hidden_content"));
record(
    "public account-deletion page",
    publicPage.includes("account-deletion") &&
        (publicPage.includes("Music Data Base LLC") || publicPage.includes("LEGAL_OPERATOR_NAME")) &&
        publicPage.includes("Music Data Base"),
);
record("delete API requires session confirmation", deleteApi.includes('confirmText !== CONFIRM_TEXT') && deleteApi.includes("resolveStrictRequestUserId"));
record("delete service retains payouts", deleteService.includes("detachRetainedFinancialRecords") && deleteService.includes("ringtone_purchases"));
record("moderation reports user POST", modReports.includes("export async function POST") && modReports.includes("submitUserModerationReport"));
record("block enforcement helper", blockEnforce.includes("usersAreBlockedFromInteraction"));
record("profile blocked/hidden panels", profileDash.includes("BlockedUsersPanel") && profileDash.includes("HiddenContentPanel"));
record("no email-only delete route", !read("app/api/account/delete-by-email/route.ts"));
record(
    "account delete bypasses founding gate",
    read("lib/founding-api-access-server.ts").includes('"/api/account/delete"'),
);

const failed = results.filter((row) => !row.ok).length;
console.log(`\nGOOGLE_PLAY_TRUST_FAILS=${failed}`);
process.exit(failed ? 1 : 0);
