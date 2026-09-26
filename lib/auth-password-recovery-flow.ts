/** Client helpers for Supabase password recovery deep links (no service role). */

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

export function resolvePasswordRecoveryRedirectUrl() {
    const configured = (process.env.NEXT_PUBLIC_SITE_URL || "").trim().replace(/\/+$/, "");
    if (configured) {
        return configured;
    }
    if (typeof window !== "undefined") {
        return window.location.origin.replace(/\/+$/, "");
    }
    return "http://localhost:3000";
}
