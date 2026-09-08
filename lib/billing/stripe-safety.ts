/**
 * Stripe TEST-mode safety guards for Connect and payout paths.
 * Aborts before any Stripe API call when a live secret key is configured.
 */

export function isStripeSecretKeyLive() {
    const secret = String(process.env.STRIPE_SECRET_KEY || "").trim();
    return secret.startsWith("sk_live_") || secret.startsWith("rk_live_");
}

/** Throws when STRIPE_SECRET_KEY is a live key. Safe no-op when unset or TEST. */
export function assertStripeTestModeOnly(context = "Stripe operation") {
    if (isStripeSecretKeyLive()) {
        throw new Error(`${context} blocked: live Stripe keys are not permitted in this environment.`);
    }
}
