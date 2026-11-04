/** Apple App Store / StoreKit server configuration (no private keys in repo). */

export const DEFAULT_APPLE_BUNDLE_ID = "com.digitalmusicdatabase.app";

export type AppleIapClientEnvironment = "Sandbox" | "Production";

export function getAppleAppStoreBundleId() {
    return process.env.APPLE_APP_STORE_BUNDLE_ID?.trim() || DEFAULT_APPLE_BUNDLE_ID;
}

export function getAppleAppStoreAppAppleId(): number | undefined {
    const raw = process.env.APPLE_APP_STORE_APP_APPLE_ID?.trim();
    if (!raw) return undefined;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
    return Math.trunc(parsed);
}

export function isAppleIapVerifyRouteEnabled() {
    const raw = process.env.APPLE_IAP_VERIFY_ENABLED?.trim().toLowerCase();
    if (raw === "0" || raw === "false" || raw === "no" || raw === "off") return false;
    return true;
}

export function isProductionAppleIapRuntime() {
    const vercelEnv = process.env.VERCEL_ENV?.trim().toLowerCase();
    if (vercelEnv === "production") return true;
    return process.env.NODE_ENV?.trim().toLowerCase() === "production";
}

export function getAppleIapWebhookEnvironment(): AppleIapClientEnvironment {
    const fromEnv = normalizeAppleIapClientEnvironment(process.env.APPLE_IAP_WEBHOOK_ENVIRONMENT || "Sandbox");
    return fromEnv || "Sandbox";
}

export function normalizeAppleIapClientEnvironment(value: string): AppleIapClientEnvironment | null {
    const normalized = String(value || "").trim();
    if (normalized === "Sandbox" || normalized === "sandbox") return "Sandbox";
    if (normalized === "Production" || normalized === "production") return "Production";
    return null;
}
