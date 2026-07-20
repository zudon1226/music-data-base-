/** Production fail-closed helpers for subscription checkout. */

export const FREE_PLAN_ACTIVE_SUFFIX = "is now active.";

export function isProductionBillingEnvironment() {
    const nodeEnv = String(process.env.NODE_ENV || "").trim().toLowerCase();
    const vercelEnv = String(process.env.VERCEL_ENV || "").trim().toLowerCase();
    return nodeEnv === "production" || vercelEnv === "production";
}

/**
 * Local/CI test provider only. Never allowed in production — paid plans must use
 * configured Stripe/PayPal and webhook confirmation.
 */
export function isBillingTestProviderAllowed() {
    if (isProductionBillingEnvironment()) return false;
    const preferred = String(process.env.BILLING_PAYMENT_PROVIDER || "").trim().toLowerCase();
    if (preferred === "stripe" || preferred === "paypal") return false;
    return true;
}
