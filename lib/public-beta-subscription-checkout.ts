/**
 * Public beta paid subscription checkout lock.
 *
 * Environment: NEXT_PUBLIC_PUBLIC_BETA_PAID_SUBSCRIPTION_CHECKOUT_LOCKED
 *
 * Semantics (read literally — do not invert):
 *   true  / 1 / yes / on  / UNSET  → checkout LOCKED (public beta default)
 *   false / 0 / no  / off          → checkout UNLOCKED (full launch only)
 *
 * During public beta: signup and free-plan activation succeed; paid Stripe
 * checkout sessions are not created and no live subscriptions are started.
 */

export const PUBLIC_BETA_PAID_SUBSCRIPTION_CHECKOUT_ENV =
    "NEXT_PUBLIC_PUBLIC_BETA_PAID_SUBSCRIPTION_CHECKOUT_LOCKED";
export const PUBLIC_BETA_PAID_SUBSCRIPTION_CHECKOUT_MESSAGE =
    "Subscriptions coming at full launch.";
/** Public beta heading. Paid plan cards stay in the source for full launch. */
export const PUBLIC_BETA_SUBSCRIPTION_LAUNCH_TITLE =
    "Subscriptions Coming at Full Launch";

function parseTruthyEnv(value: string | undefined) {
    if (value === undefined || value === "") return null;
    const normalized = value.trim().toLowerCase();
    if (normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on") return true;
    if (normalized === "0" || normalized === "false" || normalized === "no" || normalized === "off") return false;
    return null;
}

/** When true, paid subscription checkout stays blocked for normal users. */
export function isPublicBetaPaidSubscriptionCheckoutLocked() {
    const parsed = parseTruthyEnv(process.env.NEXT_PUBLIC_PUBLIC_BETA_PAID_SUBSCRIPTION_CHECKOUT_LOCKED);
    if (parsed === null) return true;
    return parsed;
}

export function getPublicBetaPaidSubscriptionCheckoutMessage() {
    return PUBLIC_BETA_PAID_SUBSCRIPTION_CHECKOUT_MESSAGE;
}

/**
 * Paid checkout stays locked for every account, including admin and owner.
 * Account-management actions use their own admin routes and are not a checkout bypass.
 */
export async function canUserBypassPublicBetaPaidSubscriptionCheckout(_userId: string) {
    return false;
}

export async function assertPaidSubscriptionCheckoutAllowed(_userId: string) {
    if (!isPublicBetaPaidSubscriptionCheckoutLocked()) {
        return { ok: true as const };
    }
    return {
        ok: false as const,
        status: 403,
        code: "SUBSCRIPTION_CHECKOUT_LOCKED",
        error: PUBLIC_BETA_PAID_SUBSCRIPTION_CHECKOUT_MESSAGE,
    };
}
