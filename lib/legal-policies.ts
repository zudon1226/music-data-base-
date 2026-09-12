import type { SignupAccountType } from "@/lib/signup-account-type";
import {
    getSignupRequiredPolicyTypes as getSignupRequiredPolicyTypesCore,
    signupRequiresCreatorUploadAgreement as signupRequiresCreatorUploadAgreementCore,
    validateSignupAcceptanceInput as validateSignupAcceptanceInputCore,
    LEGAL_POLICY_VERSION as LEGAL_POLICY_VERSION_CORE,
} from "./legal-signup-validation.mjs";

/** Current published policy version identifier (ISO date). */
export const LEGAL_POLICY_VERSION = LEGAL_POLICY_VERSION_CORE;

export const LEGAL_LAST_UPDATED_LABEL = "September 10, 2026";

export const LEGAL_CONTACT_EMAIL = "zudon1226@gmail.com";

export const LEGAL_POLICY_TYPES = [
    "privacy",
    "terms",
    "creator_upload",
    "dmca",
    "subscription_billing",
    "refund",
    "creator_payout",
    "sponsor_advertising",
] as const;

export type LegalPolicyType = (typeof LEGAL_POLICY_TYPES)[number];

export type LegalPolicyDefinition = {
    type: LegalPolicyType;
    slug: string;
    title: string;
    shortTitle: string;
    version: string;
    lastUpdated: string;
    publicPath: string;
};

export const LEGAL_POLICIES: LegalPolicyDefinition[] = [
    {
        type: "privacy",
        slug: "privacy",
        title: "Privacy Policy",
        shortTitle: "Privacy Policy",
        version: LEGAL_POLICY_VERSION,
        lastUpdated: LEGAL_LAST_UPDATED_LABEL,
        publicPath: "/legal/privacy",
    },
    {
        type: "terms",
        slug: "terms",
        title: "Terms of Service",
        shortTitle: "Terms of Service",
        version: LEGAL_POLICY_VERSION,
        lastUpdated: LEGAL_LAST_UPDATED_LABEL,
        publicPath: "/legal/terms",
    },
    {
        type: "creator_upload",
        slug: "creator-upload",
        title: "Creator / Upload Agreement",
        shortTitle: "Creator / Upload Agreement",
        version: LEGAL_POLICY_VERSION,
        lastUpdated: LEGAL_LAST_UPDATED_LABEL,
        publicPath: "/legal/creator-upload",
    },
    {
        type: "dmca",
        slug: "dmca",
        title: "Copyright / DMCA Policy",
        shortTitle: "Copyright / DMCA Policy",
        version: LEGAL_POLICY_VERSION,
        lastUpdated: LEGAL_LAST_UPDATED_LABEL,
        publicPath: "/legal/dmca",
    },
    {
        type: "subscription_billing",
        slug: "subscription-billing",
        title: "Subscription / Billing Policy",
        shortTitle: "Subscription / Billing Policy",
        version: LEGAL_POLICY_VERSION,
        lastUpdated: LEGAL_LAST_UPDATED_LABEL,
        publicPath: "/legal/subscription-billing",
    },
    {
        type: "refund",
        slug: "refunds",
        title: "Refund Policy",
        shortTitle: "Refund Policy",
        version: LEGAL_POLICY_VERSION,
        lastUpdated: LEGAL_LAST_UPDATED_LABEL,
        publicPath: "/legal/refunds",
    },
    {
        type: "creator_payout",
        slug: "creator-payout",
        title: "Creator Payout Agreement",
        shortTitle: "Creator Payout Agreement",
        version: LEGAL_POLICY_VERSION,
        lastUpdated: LEGAL_LAST_UPDATED_LABEL,
        publicPath: "/legal/creator-payout",
    },
    {
        type: "sponsor_advertising",
        slug: "sponsor-advertising",
        title: "Sponsor / Advertising Terms",
        shortTitle: "Sponsor / Advertising Terms",
        version: LEGAL_POLICY_VERSION,
        lastUpdated: LEGAL_LAST_UPDATED_LABEL,
        publicPath: "/legal/sponsor-advertising",
    },
];

export const LEGAL_POLICY_SLUGS = LEGAL_POLICIES.map((policy) => policy.slug);

export function getLegalPolicyBySlug(slug: string) {
    return LEGAL_POLICIES.find((policy) => policy.slug === slug) || null;
}

export function getLegalPolicyByType(type: LegalPolicyType) {
    return LEGAL_POLICIES.find((policy) => policy.type === type) || null;
}

export function getCurrentPolicyVersion(type: LegalPolicyType) {
    return getLegalPolicyByType(type)?.version || LEGAL_POLICY_VERSION;
}

export function isLegalPolicyType(value: unknown): value is LegalPolicyType {
    return typeof value === "string" && (LEGAL_POLICY_TYPES as readonly string[]).includes(value);
}

export function signupRequiresCreatorUploadAgreement(accountType: SignupAccountType) {
    return signupRequiresCreatorUploadAgreementCore(accountType);
}

export function getSignupRequiredPolicyTypes(accountType: SignupAccountType): LegalPolicyType[] {
    return getSignupRequiredPolicyTypesCore(accountType) as LegalPolicyType[];
}

export type LegalAcceptanceInput = {
    policyType: LegalPolicyType;
    policyVersion: string;
};

export function validateSignupAcceptanceInput(
    accountType: SignupAccountType,
    acceptances: LegalAcceptanceInput[],
) {
    return validateSignupAcceptanceInputCore(accountType, acceptances) as {
        ok: true;
        required: LegalPolicyType[];
        acceptances: LegalAcceptanceInput[];
    } | {
        ok: false;
        error: string;
        missing: LegalPolicyType[];
    };
}
