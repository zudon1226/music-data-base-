"use client";

import Link from "next/link";
import {
    getCurrentPolicyVersion,
    getLegalPolicyByType,
    signupRequiresCreatorUploadAgreement,
    type LegalAcceptanceInput,
} from "@/lib/legal-policies";
import type { SignupAccountType } from "@/lib/signup-account-type";

type Props = {
    accountType: SignupAccountType;
    acceptTerms: boolean;
    acceptPrivacy: boolean;
    acceptCreatorUpload: boolean;
    onAcceptTermsChange: (value: boolean) => void;
    onAcceptPrivacyChange: (value: boolean) => void;
    onAcceptCreatorUploadChange: (value: boolean) => void;
};

export function buildSignupLegalAcceptances(
    accountType: SignupAccountType,
    input: {
        acceptTerms: boolean;
        acceptPrivacy: boolean;
        acceptCreatorUpload: boolean;
    },
): LegalAcceptanceInput[] | null {
    if (!input.acceptTerms || !input.acceptPrivacy) return null;
    const acceptances: LegalAcceptanceInput[] = [
        { policyType: "terms", policyVersion: getCurrentPolicyVersion("terms") },
        { policyType: "privacy", policyVersion: getCurrentPolicyVersion("privacy") },
    ];
    if (signupRequiresCreatorUploadAgreement(accountType)) {
        if (!input.acceptCreatorUpload) return null;
        acceptances.push({
            policyType: "creator_upload",
            policyVersion: getCurrentPolicyVersion("creator_upload"),
        });
    }
    return acceptances;
}

export function SignupLegalAcceptance({
    accountType,
    acceptTerms,
    acceptPrivacy,
    acceptCreatorUpload,
    onAcceptTermsChange,
    onAcceptPrivacyChange,
    onAcceptCreatorUploadChange,
}: Props) {
    const terms = getLegalPolicyByType("terms");
    const privacy = getLegalPolicyByType("privacy");
    const creatorUpload = getLegalPolicyByType("creator_upload");
    const requiresCreatorAgreement = signupRequiresCreatorUploadAgreement(accountType);

    return (
        <fieldset className="auth-legal-acceptance">
            <legend>Legal acceptance</legend>
            <label className="auth-legal-option">
                <input
                    type="checkbox"
                    checked={acceptTerms}
                    onChange={(event) => onAcceptTermsChange(event.target.checked)}
                />
                <span>
                    I agree to the{" "}
                    <Link href={terms?.publicPath || "/legal/terms"} target="_blank" rel="noopener noreferrer">
                        Terms of Service
                    </Link>
                </span>
            </label>
            <label className="auth-legal-option">
                <input
                    type="checkbox"
                    checked={acceptPrivacy}
                    onChange={(event) => onAcceptPrivacyChange(event.target.checked)}
                />
                <span>
                    I agree to the{" "}
                    <Link href={privacy?.publicPath || "/legal/privacy"} target="_blank" rel="noopener noreferrer">
                        Privacy Policy
                    </Link>
                </span>
            </label>
            {requiresCreatorAgreement ? (
                <label className="auth-legal-option">
                    <input
                        type="checkbox"
                        checked={acceptCreatorUpload}
                        onChange={(event) => onAcceptCreatorUploadChange(event.target.checked)}
                    />
                    <span>
                        I agree to the{" "}
                        <Link
                            href={creatorUpload?.publicPath || "/legal/creator-upload"}
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            Creator / Upload Agreement
                        </Link>
                    </span>
                </label>
            ) : null}
        </fieldset>
    );
}
