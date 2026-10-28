/**
 * Public beta freeze for new creator payout requests.
 *
 * Environment: NEXT_PUBLIC_PUBLIC_BETA_PAYOUT_REQUESTS_LOCKED
 *
 * Semantics (read literally — do not invert):
 *   true  / 1 / yes / on / UNSET / empty / unrecognized → requests LOCKED
 *   false / 0 / no  / off                               → requests UNLOCKED
 *
 * This blocks POST /api/payouts only. It does not transfer funds, edit
 * existing payout rows, or change Stripe Connect.
 */

export const PUBLIC_BETA_PAYOUT_REQUESTS_ENV =
    "NEXT_PUBLIC_PUBLIC_BETA_PAYOUT_REQUESTS_LOCKED";
export const PUBLIC_BETA_PAYOUT_REQUESTS_MESSAGE =
    "Payout requests are paused until full launch.";
export const PUBLIC_BETA_PAYOUT_REQUESTS_CODE = "PAYOUT_REQUESTS_LOCKED";

function parseLockEnv(value: string | undefined) {
    if (value === undefined || value === "") return null;
    const normalized = value.trim().toLowerCase();
    if (normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on") return true;
    if (normalized === "0" || normalized === "false" || normalized === "no" || normalized === "off") return false;
    return null;
}

export function isPublicBetaPayoutRequestsLocked() {
    const parsed = parseLockEnv(process.env.NEXT_PUBLIC_PUBLIC_BETA_PAYOUT_REQUESTS_LOCKED);
    if (parsed === null) return true;
    return parsed;
}

export function payoutRequestsLockedResult() {
    return {
        ok: false as const,
        status: 403 as const,
        code: PUBLIC_BETA_PAYOUT_REQUESTS_CODE,
        error: PUBLIC_BETA_PAYOUT_REQUESTS_MESSAGE,
    };
}
