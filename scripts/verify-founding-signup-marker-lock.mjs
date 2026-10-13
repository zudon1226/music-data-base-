/**
 * Signup account-type marker lock — migration contract + API hardening checks.
 * Live PostgREST tamper probes: set RLS_VERIFY_MUTATIONS=1 and run verify-supabase-rls-security.mjs
 * after applying the migration locally.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fails = [];

function read(rel) {
    return readFileSync(path.join(root, rel), "utf8");
}

function record(name, ok) {
    if (!ok) fails.push(name);
    console.log(ok ? "PASS" : "FAIL", name);
}

const migration = read("supabase/migrations/202610111001_lock_founding_signup_account_type_marker.sql");
const route = read("app/api/founding-members/me/route.ts");
const signupType = read("lib/signup-account-type.ts");
const profileUpdate = read("lib/founding-member-profile-update.ts");
const trust = read("lib/signup-account-type-trust.ts");

record("migration defines marker prefix helper", /has_signup_account_type_marker_prefix/.test(migration));
record("migration defines strict marker validator", /is_signup_account_type_marker/.test(migration));
record(
    "migration strict regex matches signup types",
    /mdb_signup_account_type=\(listener\|artist\|producer\|artist_producer\|podcaster\)/.test(migration),
);
record("migration trigger blocks client tamper", /prevent_client_founding_signup_marker_tamper/.test(migration));
record(
    "migration allows only service_role bypass",
    /auth\.role\(\).*service_role/.test(migration)
        && !/is_platform_admin/.test(migration),
);
record(
    "migration covers insert and update",
    /before insert or update on public\.founding_members/.test(migration),
);

record("signup type exports marker prefix", /export const SIGNUP_ACCOUNT_TYPE_MARKER_PREFIX/.test(signupType));
record("signup type validates markers", /isValidSignupAccountTypeMarker/.test(signupType));
record("signup type detects marker prefix", /hasSignupAccountTypeMarkerPrefix/.test(signupType));

record("PATCH route uses profile patch builder", /buildFoundingMemberProfilePatchPayload/.test(route));
record(
    "PATCH route does not assign social_link directly from body",
    !/updatePayload\.social_link = body\.socialLink/.test(route),
);

record("profile patch blocks marker overwrite", /markerLocked/.test(profileUpdate));
record("profile patch rejects forged marker in socialLink", /hasSignupAccountTypeMarkerPrefix\(nextSocialLink\)/.test(profileUpdate));

record("server signup still writes markers", /social_link: marker/.test(trust));
record("invite service still encodes markers", /encodeSignupAccountTypeMarker/.test(read("lib/founding-invite-service.ts")));

record(
    "account_type client lock unchanged",
    /prevent_client_account_type_change/.test(read("supabase/migrations/202609191001_lock_profile_account_type.sql")),
);
record(
    "beta subscription lock module untouched",
    /NEXT_PUBLIC_PUBLIC_BETA_PAID_SUBSCRIPTION_CHECKOUT_LOCKED/.test(read("lib/public-beta-subscription-checkout.ts")),
);

if (fails.length > 0) {
    console.error("\nFOUNDING_SIGNUP_MARKER_LOCK_FAILS=" + fails.length);
    process.exit(1);
}

console.log("\nFounding signup marker lock verification passed.");
