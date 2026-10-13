/**
 * Signup account activation repair verification.
 * Usage: node scripts/verify-signup-account-activation.mjs
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(rel) {
    return readFileSync(path.join(root, rel), "utf8");
}

function record(name, ok, detail = "") {
    console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
    if (!ok) process.exitCode = 1;
}

const activation = read("lib/signup-account-activation.ts");
const inviteService = read("lib/founding-invite-service.ts");
const page = read("app/page.tsx");
const resumeRoute = read("app/api/signup/resume-activation/route.ts");
const legalRoute = read("app/api/legal/acceptances/route.ts");
const metadata = read("lib/auth-user-metadata.ts");

record("activation service exists", activation.includes("resumeSignupAccountActivation"));
record("approval uses founding false grants", inviteService.includes("{ founding: false }"));
record("approval delegates to applySignupAccountTypeGrants", inviteService.includes("applySignupAccountTypeGrants"));
record("resume API route exists", resumeRoute.includes("resumeSignupAccountActivation"));
record("legal signup triggers resume", legalRoute.includes("resumeSignupAccountActivation"));
record("pending invite metadata supported", metadata.includes("pendingInviteCode"));
record("signup stores pending invite when beta locked", page.includes("pendingInviteCode:"));
record("client resume on auth bootstrap", page.includes("/api/signup/resume-activation"));
record("email confirm message mentions resume", page.includes("Confirm your email, then sign in"));
record("activation supports pending creator requests", activation.includes("createPendingCreatorAccessRequest"));
record("ordinary creator auto-approve", activation.includes("ensureOrdinaryCreatorAppAccess"));
record("listener auto app access", activation.includes("ensureListenerOrdinaryAppAccess"));
record("email verification before activation", activation.includes("needs_email_confirmation"));
record("legacy founding account types preserved on approval", activation.includes("legacy_preserved"));

if (process.exitCode) {
    console.error("\nSignup account activation verification failed.");
    process.exit(process.exitCode);
}
console.log("\nSignup account activation verification passed.");
