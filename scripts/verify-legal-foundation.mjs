/**
 * Verify legal/policy foundation for Music Data Base launch readiness.
 * Usage: node scripts/verify-legal-foundation.mjs
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const results = [];

function read(rel) {
    return readFileSync(join(root, rel), "utf8");
}

function record(name, pass) {
    results.push({ name, pass });
    console.log(`${pass ? "PASS" : "FAIL"} ${name}`);
}

const policies = read("lib/legal-policies.ts");
const content = read("lib/legal-policy-content.ts");
const migration = read("supabase/migrations/202609101002_legal_acceptances.sql");
const page = read("app/page.tsx");
const sponsor = read("components/sponsor/sponsor-workspace.tsx");
const acceptancesRoute = read("app/api/legal/acceptances/route.ts");
const validateSignupRoute = read("app/api/legal/validate-signup/route.ts");
const acceptanceService = read("lib/legal-acceptance-service.ts");

const requiredSlugs = [
    "privacy",
    "terms",
    "creator-upload",
    "dmca",
    "subscription-billing",
    "refunds",
    "creator-payout",
    "sponsor-advertising",
];

for (const slug of requiredSlugs) {
    record(`policy route /legal/${slug}`, existsSync(join(root, "app/legal/[slug]/page.tsx")) && policies.includes(`"${slug}"`));
}

record("privacy policy content", content.includes("Privacy Policy"));
record("terms of service content", content.includes("Terms of Service"));
record("creator upload agreement content", content.includes("Creator / Upload Agreement"));
record("dmca policy content", content.includes("counter-notification"));
record("subscription billing exact listener price", content.includes("$6.99/month") && content.includes("monthly billing only"));
record("subscription billing artist prices", content.includes("$9.99/month") && content.includes("$99.99/year"));
record("subscription billing producer prices", content.includes("$14.99/month") && content.includes("$149.99/year"));
record("subscription billing renewal reminder", content.includes("10 days"));
record("subscription billing beta lock mention", content.includes("public beta"));
record("subscription billing stripe mention", content.includes("Stripe"));
record("subscription billing past due withdrawal", content.includes("Past-due creator subscriptions"));
record("refund policy content", content.includes("Refund Policy"));
record("creator payout agreement content", content.includes("Creator Payout Agreement"));
record("creator payout no automated payout claim", content.includes("automated payouts may not be active"));
record("sponsor terms platform revenue rule", content.includes("100% platform revenue"));
record("sponsor terms no connect transfer", content.includes("do not create Artist/Producer earnings") || content.includes("They do not create Artist/Producer earnings"));
record("policy version identifier", policies.includes("LEGAL_POLICY_VERSION"));
record("policy last updated label", policies.includes("LEGAL_LAST_UPDATED_LABEL"));
record("no fake business address in policies", !content.match(/\d+\s+[A-Z][a-z]+\s+(Street|St\.|Avenue|Ave\.|Road|Rd\.)/));
record("dmca uses existing contact email", content.includes("LEGAL_CONTACT_EMAIL") && read("lib/legal-policies.ts").includes("zudon1226@gmail.com"));

record("legal acceptances migration", migration.includes("legal_acceptances"));
record("legal acceptances unique constraint", migration.includes("unique (user_id, policy_type, policy_version)"));
record("legal acceptances rls enabled", migration.includes("enable row level security"));
record("legal acceptances append-only for users", migration.includes("legal_acceptances_insert_own") && !migration.includes("legal_acceptances_update"));
record("acceptance service duplicate safe upsert", acceptanceService.includes("ignoreDuplicates"));

record("signup legal checkboxes wired", page.includes("SignupLegalAcceptance") && page.includes("authAcceptTerms"));
record("signup validate endpoint wired", page.includes("/api/legal/validate-signup"));
record("signup acceptance persistence wired", page.includes("/api/legal/acceptances"));
record("signup policy links clickable", read("components/legal/signup-legal-acceptance.tsx").includes("Terms of Service") && read("components/legal/signup-legal-acceptance.tsx").includes("Privacy Policy"));
record("public policy links footer on signup", page.includes("PolicyLinksFooter"));
record("sponsor terms linked from sponsor flow", sponsor.includes("/legal/sponsor-advertising"));

record("upload-audio creator agreement gate", read("app/api/upload-audio/route.ts").includes("requireCreatorUploadLegalAgreement"));
record("video-upload creator agreement gate", read("app/api/video-upload/route.ts").includes("requireCreatorUploadLegalAgreement"));
record("album create creator agreement gate", read("app/api/albums/create/route.ts").includes("requireCreatorUploadLegalAgreement"));
record("ringtone upload-source creator agreement gate", read("app/api/ringtones/upload-source/route.ts").includes("requireCreatorUploadLegalAgreement"));

record("acceptances route signup context", acceptancesRoute.includes('context === "signup"'));
record("validate-signup route exists", validateSignupRoute.includes("validateSignupAcceptanceInput"));

record("creator upload rights acknowledgment", content.includes("own or control the rights"));
record("creator upload license grant", content.includes("non-exclusive"));
record("creator upload ringtone rights note", content.includes("do not transfer underlying ownership"));
record("creator upload infringement enforcement", content.includes("Repeat infringement"));

record("no sk_live in legal modules", !policies.includes("sk_live") && !content.includes("sk_live"));

const failed = results.filter((entry) => !entry.pass);
if (failed.length > 0) {
    console.error(`\nLegal foundation verification failed (${failed.length} checks).`);
    process.exit(1);
}

console.log("\nLegal foundation verification passed.");
console.log("PUBLIC-BETA LEGAL BLOCKER: NO (code foundation present)");
console.log("POLICY PAGE COUNT: 8");
