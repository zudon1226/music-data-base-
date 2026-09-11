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
 */

import { isPlatformOwnerUserId } from "@/lib/server-supabase";

export const PUBLIC_BETA_PAID_RINGTONE_PURCHASE_ENV = "NEXT_PUBLIC_PUBLIC_BETA_PAID_RINGTONE_PURCHASES_LOCKED";
export const PUBLIC_BETA_PAID_RINGTONE_PURCHASE_MESSAGE = "Purchases coming at full launch.";

function parseTruthyEnv(value: string | undefined) {
    if (value === undefined || value === "") return null;
    const normalized = value.trim().toLowerCase();
    if (normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on") return true;
    if (normalized === "0" || normalized === "false" || normalized === "no" || normalized === "off") return false;
    return null;
}

/** When true, paid marketplace checkout stays blocked for normal buyers. */
export function isPublicBetaPaidRingtonePurchaseLocked() {
    const parsed = parseTruthyEnv(process.env.NEXT_PUBLIC_PUBLIC_BETA_PAID_RINGTONE_PURCHASES_LOCKED);
    if (parsed === null) return true;
    return parsed;
}

export type MarketplaceRingtoneDownloadContext = {
    userId: string;
    priceCents: number;
    hasPaidPurchase: boolean;
    ownerTesting?: boolean;
    creatorTesting?: boolean;
};

/**
 * Server-side marketplace download gate for paid catalog ringtones.
 * Free ringtones (price_cents === 0) remain downloadable after free acquisition.
 * Personal creator source files use /api/ringtones/source-url — not this gate.
 */
export async function assertMarketplaceRingtoneDownloadAllowed(input: MarketplaceRingtoneDownloadContext) {
    const priceCents = Math.max(0, Math.round(Number(input.priceCents) || 0));
    const ownerTesting = input.ownerTesting === true;
    const creatorTesting = input.creatorTesting === true;

    if (ownerTesting || creatorTesting) {
        return { ok: true as const };
    }

    if (!input.hasPaidPurchase) {
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

    return { ok: true as const };
}

export function getPublicBetaPaidRingtonePurchaseMessage() {
    return PUBLIC_BETA_PAID_RINGTONE_PURCHASE_MESSAGE;
}

/** Owner/admin test path remains available when beta lock is on. */
export async function canBuyerBypassPublicBetaPaidRingtoneLock(buyerId: string) {
    return isPlatformOwnerUserId(buyerId);
}
