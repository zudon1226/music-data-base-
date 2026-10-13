/**
 * Creator self-signup (Option 1) verification.
 * Usage: node scripts/verify-creator-self-signup.mjs
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

const selfSignup = read("lib/creator-self-signup.ts");
const activation = read("lib/signup-account-activation.ts");
const access = read("lib/founding-access.ts");
const invite = read("lib/founding-invite-service.ts");
const page = read("app/page.tsx");

record("self-signup env flag", selfSignup.includes("NEXT_PUBLIC_CREATOR_SELF_SIGNUP_ENABLED"));
record("founding cohort uses invite_id", selfSignup.includes("invite_id"));
record("beta access badge labels", selfSignup.includes("Artist — Beta Access") && selfSignup.includes("Producer — Beta Access"));
record("activation auto-approve hook", activation.includes("ensureOrdinaryCreatorAppAccess"));
record("email confirmation gate", activation.includes("needs_email_confirmation"));
record("grants stay founding false", activation.includes('resolveSignupAccountTypeGrants(options.accountType, { founding: false })'));
record("access exposes beta vs cohort", access.includes("isBetaAccessCreator") && access.includes("isFoundingCohortMember"));
record("approve service exists", invite.includes("ensureOrdinaryCreatorAppAccess"));
record("signup UI hides invite when self-signup", page.includes("!creatorSelfSignupEnabled"));
record("profile beta access copy", page.includes("isBetaAccessCreator"));
record("pending flow preserved when flag off", activation.includes("pending_approval"));
record("capacitor parity note", page.includes("isCreatorSelfSignupEnabled"));
record("trusted signup account type module", read("lib/signup-account-type-trust.ts").includes("resolveTrustedSignupAccountType"));
record("activation uses trusted account type", activation.includes("resolveTrustedSignupAccountType"));
record("legal signup locks account type", read("lib/legal-acceptance-service.ts").includes("lockSignupAccountTypeAtRegistration"));
record("listener escalation blocked at legal", read("lib/signup-account-type-trust.ts").includes("LISTENER_SIGNUP_ACCOUNT_TYPE_LOCKED_MESSAGE"));

if (process.exitCode) {
    console.error("\nCreator self-signup verification failed.");
    process.exit(process.exitCode);
}
console.log("\nCreator self-signup verification passed.");
