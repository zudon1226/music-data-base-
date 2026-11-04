/**
 * Internal QA: allow StoreKit purchase UI for allowlisted users on staging preview only.
 * Does NOT disable global public-beta commerce lock for Stripe/marketplace/UI.
 * Does NOT grant paid entitlements (Stage 1 kill switch remains).
 */
import { isPublicBetaCommerceLocked } from "@/lib/public-beta-commerce-lock";
import { isProductionAppleIapRuntime } from "./app-store-config";

export const APPLE_IAP_STAGING_SUPABASE_REF = "jzlegcbotqfzevtczwhx";
export const APPLE_IAP_PRODUCTION_SUPABASE_REF = "aehuszoadgqtbkxsliyy";

function parseTruthy(value: string | undefined) {
    const normalized = String(value || "").trim().toLowerCase();
    return normalized === "1" || normalized === "true" || normalized === "yes";
}

export function parseAppleIapInternalQaUserAllowlist(raw: string | undefined): Set<string> {
    const set = new Set<string>();
    for (const part of String(raw || "").split(/[,;\s]+/)) {
        const id = part.trim().toLowerCase();
        if (id) set.add(id);
    }
    return set;
}

/** Runtime must point at staging Supabase — never production project ref. */
export function assertAppleIapInternalQaStagingRuntime(): { ok: true } | { ok: false; code: string } {
    const url = String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().toLowerCase();
    if (!url) {
        return { ok: false, code: "MISSING_SUPABASE_URL" };
    }
    if (url.includes(APPLE_IAP_PRODUCTION_SUPABASE_REF)) {
        return { ok: false, code: "PRODUCTION_SUPABASE_URL_BLOCKED" };
    }
    if (!url.includes(APPLE_IAP_STAGING_SUPABASE_REF)) {
        return { ok: false, code: "STAGING_SUPABASE_REF_REQUIRED" };
    }
    return { ok: true };
}

/**
 * Master switch — disabled by default; fail-closed on production runtime or non-staging Supabase.
 * Set only on Preview (never Production Vercel scope): APPLE_IAP_INTERNAL_QA_ENABLED=1
 */
export function isAppleIapInternalQaMasterEnabled(): boolean {
    if (!parseTruthy(process.env.APPLE_IAP_INTERNAL_QA_ENABLED)) {
        return false;
    }
    if (isProductionAppleIapRuntime()) {
        return false;
    }
    const vercelEnv = String(process.env.VERCEL_ENV || "").trim().toLowerCase();
    if (vercelEnv === "production") {
        return false;
    }
    const staging = assertAppleIapInternalQaStagingRuntime();
    if (!staging.ok) {
        return false;
    }
    return true;
}

/** Allowlisted staging QA accounts only; global commerce lock must remain active. */
export function isAppleStoreKitInternalQaAllowedForUser(userId: string): boolean {
    if (!isAppleIapInternalQaMasterEnabled()) {
        return false;
    }
    if (!isPublicBetaCommerceLocked()) {
        return false;
    }
    const allowlist = parseAppleIapInternalQaUserAllowlist(process.env.APPLE_IAP_INTERNAL_QA_USER_IDS);
    if (allowlist.size === 0) {
        return false;
    }
    const normalized = String(userId || "").trim().toLowerCase();
    if (!normalized) {
        return false;
    }
    return allowlist.has(normalized);
}
