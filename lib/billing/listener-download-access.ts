/**
 * Premium Listener download entitlement (music + video cards).
 * Stricter than creator billing: past_due / canceled / inactive / unpaid never allow.
 */

import {
    clientSlugForPlanName,
    type ClientPlanSlug,
} from "@/lib/billing/plan-catalog";
import { resolveEffectiveSubscriptionStatus } from "@/lib/billing/creator-access";
import type { SubscriptionRow } from "@/lib/billing/types";

export const PREMIUM_LISTENER_DOWNLOAD_REQUIRED_MESSAGE =
    "Premium Listener is required to download music and videos.";

export type ListenerDownloadAccessResult = {
    allowed: boolean;
    reason:
        | "ALLOWED"
        | "NO_SUBSCRIPTION"
        | "NOT_PREMIUM_LISTENER"
        | "UNPAID"
        | "STATUS_BLOCKED";
    effectiveStatus: string;
    planSlug: ClientPlanSlug | null;
    planName: string | null;
};

/**
 * Active paid Premium Listener only.
 * Blocks free, past_due, canceled, inactive, expired, suspended, paused, unpaid.
 */
export function evaluatePremiumListenerDownloadAccess(
    subscription: SubscriptionRow | null,
): ListenerDownloadAccessResult {
    if (!subscription) {
        return {
            allowed: false,
            reason: "NO_SUBSCRIPTION",
            effectiveStatus: "none",
            planSlug: null,
            planName: null,
        };
    }

    const planName = String(subscription.plan_name || "").trim() || null;
    const priceCents = Math.max(0, Math.round(Number(subscription.price_cents || 0)));
    const planSlug = clientSlugForPlanName(planName || "", priceCents);
    const effectiveStatus = resolveEffectiveSubscriptionStatus(subscription);

    if (planSlug !== "premium-listener") {
        return {
            allowed: false,
            reason: "NOT_PREMIUM_LISTENER",
            effectiveStatus,
            planSlug,
            planName,
        };
    }

    if (priceCents <= 0) {
        return {
            allowed: false,
            reason: "UNPAID",
            effectiveStatus,
            planSlug,
            planName,
        };
    }

    // Only fully current Premium Listener. past_due / grace / canceled / inactive blocked.
    if (effectiveStatus !== "active") {
        return {
            allowed: false,
            reason: "STATUS_BLOCKED",
            effectiveStatus,
            planSlug,
            planName,
        };
    }

    return {
        allowed: true,
        reason: "ALLOWED",
        effectiveStatus,
        planSlug,
        planName,
    };
}
