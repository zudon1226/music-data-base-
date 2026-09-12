export const LEGAL_POLICY_VERSION = "2026-09-10";

export const LEGAL_POLICY_TYPES = [
    "privacy",
    "terms",
    "creator_upload",
    "dmca",
    "subscription_billing",
    "refund",
    "creator_payout",
    "sponsor_advertising",
];

export function signupRequiresCreatorUploadAgreement(accountType) {
    return accountType === "artist" || accountType === "producer" || accountType === "artist_producer";
}

export function getSignupRequiredPolicyTypes(accountType) {
    const required = ["terms", "privacy"];
    if (signupRequiresCreatorUploadAgreement(accountType)) {
        required.push("creator_upload");
    }
    return required;
}

export function getCurrentPolicyVersion() {
    return LEGAL_POLICY_VERSION;
}

export function validateSignupAcceptanceInput(accountType, acceptances) {
    const required = getSignupRequiredPolicyTypes(accountType);
    const provided = new Set(
        (acceptances || [])
            .filter((entry) => entry?.policyVersion === getCurrentPolicyVersion())
            .map((entry) => entry.policyType),
    );
    const missing = required.filter((type) => !provided.has(type));
    if (missing.length > 0) {
        return {
            ok: false,
            error: `Missing required policy acceptance: ${missing.join(", ")}.`,
            missing,
        };
    }
    for (const entry of acceptances || []) {
        if (!LEGAL_POLICY_TYPES.includes(entry.policyType)) {
            return { ok: false, error: "Invalid policy type.", missing: required };
        }
        if (entry.policyVersion !== getCurrentPolicyVersion()) {
            return {
                ok: false,
                error: `Policy version mismatch for ${entry.policyType}.`,
                missing: required,
            };
        }
    }
    return { ok: true, required, acceptances };
}
