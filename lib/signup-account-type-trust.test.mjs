import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const trust = readFileSync(path.join(root, "lib/signup-account-type-trust.ts"), "utf8");
const activation = readFileSync(path.join(root, "lib/signup-account-activation.ts"), "utf8");
const legal = readFileSync(path.join(root, "lib/legal-acceptance-service.ts"), "utf8");

assert.match(trust, /resolveTrustedSignupAccountType/);
assert.match(trust, /lockSignupAccountTypeAtRegistration/);
assert.match(trust, /LISTENER_SIGNUP_ACCOUNT_TYPE_LOCKED_MESSAGE/);
assert.match(trust, /inferListenerOnlySignupFromAcceptanceRows/);
assert.match(trust, /metadataClaimsCreatorEscalation/);

assert.match(activation, /resolveTrustedSignupAccountType/);
assert.match(activation, /metadataClaimsCreatorEscalation/);
assert.doesNotMatch(activation, /const requested = normalizeSignupAccountType\(metadata\.requestedAccountType\)/);

assert.match(legal, /assertSignupAccountTypeRegistrationAllowed/);
assert.match(legal, /lockSignupAccountTypeAtRegistration/);

function inferListenerOnly(types) {
    const version = "2026-09-10";
    const set = new Set(
        types
            .filter((row) => row.policy_version === version)
            .map((row) => row.policy_type),
    );
    return set.has("terms") && set.has("privacy") && !set.has("creator_upload");
}

assert.equal(
    inferListenerOnly([
        { policy_type: "terms", policy_version: "2026-09-10" },
        { policy_type: "privacy", policy_version: "2026-09-10" },
    ]),
    true,
);
assert.equal(
    inferListenerOnly([
        { policy_type: "terms", policy_version: "2026-09-10" },
        { policy_type: "privacy", policy_version: "2026-09-10" },
        { policy_type: "creator_upload", policy_version: "2026-09-10" },
    ]),
    false,
);

console.log("signup-account-type-trust.test.mjs passed");
