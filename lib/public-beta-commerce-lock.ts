/**
 * Global public beta commerce lock — purchases, sales, checkout, discounts, and payouts.
 *
 * Environment: NEXT_PUBLIC_PUBLIC_BETA_COMMERCE_LOCKED
 *
 * Semantics (read literally — do not invert):
 *   true  / 1 / yes / on  / UNSET  → commerce LOCKED (public beta default)
 *   false / 0 / no  / off          → commerce UNLOCKED (full launch only)
 *
 * No owner bypass while locked — authenticated and anonymous clients must not
 * start checkout, create orders, redeem discounts, or grant paid entitlements.
 */

export const PUBLIC_BETA_COMMERCE_LOCK_ENV = "NEXT_PUBLIC_PUBLIC_BETA_COMMERCE_LOCKED";
export const PUBLIC_BETA_COMMERCE_LOCK_MESSAGE = "Purchases and Sales Coming at Full Launch.";
export const PUBLIC_BETA_COMMERCE_LOCK_CODE = "COMMERCE_LOCKED";

export const PUBLIC_BETA_DISABLED_DISCOUNT_CODES = ["MDB10", "ALBUM20", "BEATPACK15"] as const;

function parseTruthyEnv(value: string | undefined) {
    if (value === undefined || value === "") return null;
    const normalized = value.trim().toLowerCase();
    if (normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on") return true;
    if (normalized === "0" || normalized === "false" || normalized === "no" || normalized === "off") return false;
    return null;
}

/** When true, all marketplace purchases, sales checkout, and paid entitlements stay blocked. */
export function isPublicBetaCommerceLocked() {
    const parsed = parseTruthyEnv(process.env.NEXT_PUBLIC_PUBLIC_BETA_COMMERCE_LOCKED);
    if (parsed === null) return true;
    return parsed;
}

export function getPublicBetaCommerceLockMessage() {
    return PUBLIC_BETA_COMMERCE_LOCK_MESSAGE;
}

export type PublicBetaCommerceLockDenial = {
    ok: false;
    status: 403;
    code: typeof PUBLIC_BETA_COMMERCE_LOCK_CODE;
    error: string;
};

export function getPublicBetaCommerceLockDenial(): PublicBetaCommerceLockDenial {
    return {
        ok: false,
        status: 403,
        code: PUBLIC_BETA_COMMERCE_LOCK_CODE,
        error: getPublicBetaCommerceLockMessage(),
    };
}

export function assertPublicBetaCommerceTransactionAllowed():
    | { ok: true }
    | PublicBetaCommerceLockDenial {
    if (!isPublicBetaCommerceLocked()) {
        return { ok: true };
    }
    return getPublicBetaCommerceLockDenial();
}

export function isPublicBetaDiscountRedemptionBlocked() {
    return isPublicBetaCommerceLocked();
}

export function normalizeDiscountCodeInput(code: string) {
    return String(code || "").trim().toUpperCase();
}

export function isPublicBetaDisabledDiscountCode(code: string) {
    const normalized = normalizeDiscountCodeInput(code);
    return (PUBLIC_BETA_DISABLED_DISCOUNT_CODES as readonly string[]).includes(normalized);
}

/** Stripe marketplace fulfillment (sales, ringtones, sponsors) and Connect money movement. */
export function isPublicBetaMarketplacePaymentFulfillmentBlocked() {
    return isPublicBetaCommerceLocked();
}

/** Block new paid subscription payment confirmation (webhooks, test provider, admin reactivate). */
export function isPublicBetaPaidSubscriptionEntitlementBlocked() {
    return isPublicBetaCommerceLocked();
}

/**
 * Block Stripe/provider webhooks that would activate a paid subscription (including stale checkout sessions).
 * Allows cancellation, failure, past_due, and other cleanup lifecycle updates.
 */
export function shouldBlockPaidSubscriptionProviderActivation(input: {
    mappedStatus: string;
    subscriptionPriceCents?: number | null;
    pendingPlanPriceCents?: number | null;
}) {
    if (!isPublicBetaCommerceLocked()) {
        return false;
    }
    const mapped = String(input.mappedStatus || "").trim().toLowerCase();
    if (mapped !== "active") {
        return false;
    }
    const subscriptionPrice = Math.max(0, Math.round(Number(input.subscriptionPriceCents) || 0));
    const pendingPlanPrice = Math.max(0, Math.round(Number(input.pendingPlanPriceCents) || 0));
    return Math.max(subscriptionPrice, pendingPlanPrice) > 0;
}

/** Premium Listener downloads require paid subscription — blocked during public beta commerce lock. */
export function isPublicBetaPremiumListenerDownloadBlocked() {
    return isPublicBetaCommerceLocked();
}

/** New Stripe Connect onboarding links and account creation. */
export function isPublicBetaConnectOnboardingBlocked() {
    return isPublicBetaCommerceLocked();
}
