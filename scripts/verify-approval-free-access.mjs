/**
 * Approval-free ordinary signup access (Listener / Artist / Producer).
 * Usage: node scripts/verify-approval-free-access.mjs
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

const access = read("lib/founding-access.ts");
const activation = read("lib/signup-account-activation.ts");
const invite = read("lib/founding-invite-service.ts");
const resolved = read("lib/resolved-account-role.ts");
const apiGate = read("lib/founding-api-access-server.ts");
const page = read("app/page.tsx");
const creatorSelfSignup = read("lib/creator-self-signup.ts");

record("founding access exposes denial reason", access.includes("appAccessDenialReason"));
record(
    "verified profile can access without approved founding row",
    access.includes("resolveOrdinaryAppAccess")
        && access.includes("canAccessApp: true")
        && access.includes('appAccessDenialReason: null'),
);
record("rejected accounts stay blocked", access.includes('"rejected"') && access.includes("approval_status === \"rejected\""));
record(
    "founding cohort pending stays blocked",
    access.includes("founding_pending") && access.includes("member?.invite_id"),
);
record(
    "listener upload stays restricted",
    access.includes("isListenerAccessMember") && access.includes("resolveCanUpload"),
);
record("listener ordinary access helper", invite.includes("ensureListenerOrdinaryAppAccess"));
record("creator ordinary access helper", invite.includes("ensureOrdinaryCreatorAppAccess"));
record("founding cohort preserves invite_id gate", invite.includes("Founding invite accounts require cohort approval"));
record("activation ensures listener access", activation.includes("ensureListenerOrdinaryAppAccess"));
record("activation ensures creator access", activation.includes("ensureOrdinaryCreatorAppAccess"));
record(
    "activation no longer exits listener as notify-only",
    !activation.includes("status: \"listener\" as const")
        || activation.includes("status: \"activated\" as const"),
);
record("capabilities not stripped for missing approval", resolved.includes('member?.approval_status === "rejected"'));
record("api gate uses denial reason", apiGate.includes("appAccessDenialReason"));
record(
    "registered listeners not shown launch waitlist by default",
    page.includes("denial === \"incomplete_registration\"")
        && !page.includes("const waitlist = !foundingAccess?.member"),
);
record("signup welcome copy for listeners", page.includes("Welcome to Music Data Base. Your listener account is ready."));
record(
    "creator self-signup env flag wired",
    creatorSelfSignup.includes("NEXT_PUBLIC_CREATOR_SELF_SIGNUP_ENABLED")
        && page.includes("isCreatorSelfSignupEnabled"),
);
record("tampering lock preserved", read("lib/signup-account-type-trust.ts").includes("lockSignupAccountTypeAtRegistration"));
record("creator upload agreement preserved", read("lib/legal-acceptance-service.ts").includes("requireCurrentCreatorUploadAgreement"));
record("founding cohort detection preserved", read("lib/creator-self-signup.ts").includes("isFoundingCohortMemberRecord"));

if (process.exitCode) {
    console.error("\nApproval-free access verification failed.");
    process.exit(process.exitCode);
}
console.log("\nApproval-free access verification passed.");
