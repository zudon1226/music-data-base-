/** Client helpers for Supabase password recovery (no service role). */

import type { SupabaseClient } from "@supabase/supabase-js";

/** Hostnames that may use the live browser origin as the recovery redirect. */
export const MDB_CANONICAL_SITE_HOSTS = new Set([
    "digitalmusicdatabase.com",
    "www.digitalmusicdatabase.com",
]);

/**
 * Redirect URLs documented for Supabase Auth (Phase 6 / production DNS).
 * Used by tests — Dashboard must include these before recover will accept redirectTo.
 */
export const SUPABASE_PASSWORD_RECOVERY_REDIRECT_ALLOWLIST = [
    "https://digitalmusicdatabase.com",
    "https://www.digitalmusicdatabase.com",
    "http://localhost:3000",
] as const;

export type PasswordRecoveryRedirectContext = {
    /** Synthetic browser origin for unit tests (e.g. https://www.digitalmusicdatabase.com). */
    browserOrigin?: string;
    /** Override NEXT_PUBLIC_SITE_URL in tests. */
    configuredSiteUrl?: string;
};

export function isAllowedPasswordRecoveryRedirect(url: string) {
    const normalized = url.trim().replace(/\/+$/, "");
    return (SUPABASE_PASSWORD_RECOVERY_REDIRECT_ALLOWLIST as readonly string[]).includes(normalized);
}

export function isSupabasePasswordRecoveryUrl() {
    if (typeof window === "undefined") {
        return false;
    }
    const hash = window.location.hash.replace(/^#/, "");
    if (!hash) {
        return false;
    }
    const params = new URLSearchParams(hash);
    return params.get("type") === "recovery";
}

export function clearSupabaseAuthFragmentFromUrl() {
    if (typeof window === "undefined") {
        return;
    }
    const nextUrl = `${window.location.pathname}${window.location.search}`;
    window.history.replaceState(window.history.state, "", nextUrl);
}

function readConfiguredSiteUrl(context?: PasswordRecoveryRedirectContext) {
    const raw = context?.configuredSiteUrl ?? process.env.NEXT_PUBLIC_SITE_URL ?? "";
    return raw.trim().replace(/\/+$/, "");
}

function readBrowserOrigin(context?: PasswordRecoveryRedirectContext) {
    if (context?.browserOrigin) {
        return context.browserOrigin.trim().replace(/\/+$/, "");
    }
    if (typeof window !== "undefined") {
        return window.location.origin.replace(/\/+$/, "");
    }
    return "";
}

/**
 * redirectTo for resetPasswordForEmail — must match a Supabase Auth redirect allowlist entry.
 * On Production www/apex hosts, prefer the live browser origin so recover uses the same host
 * the user is on (NEXT_PUBLIC_SITE_URL remains apex for SEO/server routes).
 */
export function resolvePasswordRecoveryRedirectUrl(context?: PasswordRecoveryRedirectContext) {
    const browserOrigin = readBrowserOrigin(context);
    if (browserOrigin) {
        try {
            const host = new URL(browserOrigin).hostname.toLowerCase();
            if (MDB_CANONICAL_SITE_HOSTS.has(host)) {
                return browserOrigin;
            }
        }
        catch {
            // fall through
        }
    }

    const configured = readConfiguredSiteUrl(context);
    if (configured) {
        return configured;
    }

    if (browserOrigin) {
        return browserOrigin;
    }

    return "http://localhost:3000";
}

export async function submitPasswordRecoveryRequest(
    supabase: Pick<SupabaseClient, "auth">,
    email: string,
    context?: PasswordRecoveryRedirectContext,
) {
    const redirectTo = resolvePasswordRecoveryRedirectUrl(context);
    return supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
}