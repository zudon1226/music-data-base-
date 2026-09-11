/**
 * Public beta sponsor paid checkout lock.
 *
 * Environment: NEXT_PUBLIC_PUBLIC_BETA_SPONSOR_CHECKOUT_LOCKED
 *
 * Semantics (read literally — do not invert):
 *   true  / 1 / yes / on  / UNSET  → checkout LOCKED (public beta default)
 *   false / 0 / no  / off          → checkout UNLOCKED (full launch only)
 */

import { isPlatformOwnerUserId } from "@/lib/server-supabase";

export const PUBLIC_BETA_SPONSOR_CHECKOUT_ENV = "NEXT_PUBLIC_PUBLIC_BETA_SPONSOR_CHECKOUT_LOCKED";
export const PUBLIC_BETA_SPONSOR_CHECKOUT_MESSAGE = "Sponsor payment activation is coming at full launch.";

function parseTruthyEnv(value: string | undefined) {
    if (value === undefined || value === "") return null;
    const normalized = value.trim().toLowerCase();
    if (normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on") return true;
    if (normalized === "0" || normalized === "false" || normalized === "no" || normalized === "off") return false;
    return null;
}

export function isPublicBetaSponsorCheckoutLocked() {
    const parsed = parseTruthyEnv(process.env.NEXT_PUBLIC_PUBLIC_BETA_SPONSOR_CHECKOUT_LOCKED);
    if (parsed === null) return true;
    return parsed;
}

export function getPublicBetaSponsorCheckoutMessage() {
    return PUBLIC_BETA_SPONSOR_CHECKOUT_MESSAGE;
}

export async function canUserStartSponsorCheckout(userId: string) {
    if (!isPublicBetaSponsorCheckoutLocked()) return true;
    return isPlatformOwnerUserId(userId);
}

export async function assertSponsorCheckoutAllowed(userId: string) {
    if (await canUserStartSponsorCheckout(userId)) {
        return { ok: true as const };
    }
    return {
        ok: false as const,
        status: 503,
        code: "SPONSOR_CHECKOUT_LOCKED",
        error: getPublicBetaSponsorCheckoutMessage(),
    };
}
