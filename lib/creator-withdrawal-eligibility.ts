/**
 * Full withdrawal eligibility gate for Artist/Producer payouts.
 * Requires: subscription current + Connect complete + payouts enabled + balance > 0.
 */

import { getCreatorBillingAccessForUser } from "@/lib/billing/subscription-service";
import { getCreatorAvailableBalanceCents } from "@/lib/creator-balance";
import { getConnectOnboardingStatus } from "@/lib/stripe-connect";

export type WithdrawalEligibilityResult = {
    eligible: boolean;
    code: string | null;
    message: string | null;
    billingStatus: string;
    availableBalanceCents: number;
    connectOnboardingComplete: boolean;
    payoutsEnabled: boolean;
    requestedAmountCents: number;
};

export async function evaluateWithdrawalEligibility(input: {
    userId: string;
    creatorType: "artist" | "producer";
    amountCents: number;
}): Promise<WithdrawalEligibilityResult> {
    const access = await getCreatorBillingAccessForUser(input.userId, input.creatorType);
    const connect = await getConnectOnboardingStatus(input.userId, input.creatorType);
    const balance = await getCreatorAvailableBalanceCents(input.userId, input.creatorType);

    const base = {
        billingStatus: access.billingStatus,
        availableBalanceCents: balance.availableCents,
        connectOnboardingComplete: connect.onboardingComplete,
        payoutsEnabled: connect.payoutsEnabled,
        requestedAmountCents: input.amountCents,
    };

    if (access.withdrawalsLocked) {
        return {
            ...base,
            eligible: false,
            code: access.withdrawalLockCode || "WITHDRAWALS_LOCKED",
            message: access.withdrawalLockMessage,
        };
    }

    if (!connect.onboardingComplete || !connect.payoutsEnabled) {
        return {
            ...base,
            eligible: false,
            code: "CONNECT_ONBOARDING_INCOMPLETE",
            message: "Complete Stripe payout onboarding before requesting a withdrawal.",
        };
    }

    if (balance.availableCents <= 0) {
        return {
            ...base,
            eligible: false,
            code: "INSUFFICIENT_BALANCE",
            message: "No available earnings to withdraw.",
        };
    }

    if (input.amountCents > balance.availableCents) {
        return {
            ...base,
            eligible: false,
            code: "INSUFFICIENT_BALANCE",
            message: "Withdrawal amount exceeds available earnings.",
        };
    }

    return {
        ...base,
        eligible: true,
        code: null,
        message: null,
    };
}
