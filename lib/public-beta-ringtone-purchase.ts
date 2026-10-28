/**
 * Public beta paid ringtone purchase lock.
 *
 * Environment: NEXT_PUBLIC_PUBLIC_BETA_PAID_RINGTONE_PURCHASES_LOCKED
 *
 * Semantics (read literally — do not invert):
 *   true  / 1 / yes / on  / UNSET  → purchases LOCKED (public beta default)
 *   false / 0 / no  / off          → purchases UNLOCKED (full launch only)
 *
 * PUBLIC BETA requires true or unset. Setting false enables paid checkout when Stripe is live.
 * While locked, every account is rejected, including administrators and the owner.
 */

export const PUBLIC_BETA_PAID_RINGTONE_PURCHASE_ENV = "NEXT_PUBLIC_PUBLIC_BETA_PAID_RINGTONE_PURCHASES_LOCKED";
export const PUBLIC_BETA_PAID_RINGTONE_PURCHASE_MESSAGE = "Purchases coming at full launch.";

function parseTruthyEnv(value: string | undefined) {
    if (value === undefined || value === "") return null;
    const normalized = value.trim().toLowerCase();
    if (normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on") return true;
    if (normalized === "0" || normalized === "false" || normalized === "no" || normalized === "off") return false;
    return null;
}

/** When true, paid marketplace checkout stays blocked for every account. */
export function isPublicBetaPaidRingtonePurchaseLocked() {
    const parsed = parseTruthyEnv(process.env.NEXT_PUBLIC_PUBLIC_BETA_PAID_RINGTONE_PURCHASES_LOCKED);
    if (parsed === null) return true;
    return parsed;
}

export type MarketplaceRingtoneDownloadContext = {
    userId: string;
    priceCents: number;
    hasPaidPurchase: boolean;
};

/**
 * Server-side marketplace download gate for catalog ringtones.
 * A paid or free file is delivered only when the buyer has a purchase entitlement.
 * Client or administrator flags cannot grant the file. Creator source files use
 * /api/ringtones/source-url — not this gate.
 */
export async function assertMarketplaceRingtoneDownloadAllowed(input: MarketplaceRingtoneDownloadContext) {
    if (input.hasPaidPurchase) {
        return { ok: true as const };
    }

    const priceCents = Math.max(0, Math.round(Number(input.priceCents) || 0));
    if (priceCents > 0 && isPublicBetaPaidRingtonePurchaseLocked()) {
        return {
            ok: false as const,
            status: 403,
            code: "PURCHASING_UNAVAILABLE",
            error: PUBLIC_BETA_PAID_RINGTONE_PURCHASE_MESSAGE,
        };
    }
    return {
        ok: false as const,
        status: 403,
        code: "PURCHASE_REQUIRED",
        error: "Download requires a paid purchase for this ringtone.",
    };
}

export function getPublicBetaPaidRingtonePurchaseMessage() {
    return PUBLIC_BETA_PAID_RINGTONE_PURCHASE_MESSAGE;
}

/**
 * Paid ringtone purchases stay locked for every account, including administrators and the owner.
 * The buyer id is ignored. Free ringtone acquisition does not use this function.
 */
export async function canBuyerBypassPublicBetaPaidRingtoneLock(_buyerId: string) {
    return false;
}
