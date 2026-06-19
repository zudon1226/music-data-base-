import { createClient } from "@supabase/supabase-js";

function stripEnvQuotes(value) {
    return String(value || "").trim().replace(/^["']|["']$/g, "");
}

function decodeJwtPayload(key) {
    try {
        const payload = key.split(".")[1];
        if (!payload) {
            return null;
        }
        const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
        return JSON.parse(atob(normalized));
    }
    catch {
        return null;
    }
}

function extractProjectRefFromAnonKey(anonKey) {
    const payload = decodeJwtPayload(anonKey);
    return String(payload?.ref || "").trim();
}

function normalizeSupabaseProjectUrl(raw) {
    let url = stripEnvQuotes(raw);
    if (!url) {
        return "";
    }

    if (!url.includes(".") && /^[a-z0-9]+$/i.test(url)) {
        return `https://${url}.supabase.co`;
    }

    if (!/^https?:\/\//i.test(url)) {
        url = `https://${url}`;
    }

    url = url.replace(/\/+$/, "");

    try {
        const parsed = new URL(url);
        const hostname = parsed.hostname.toLowerCase();
        if (!hostname.endsWith(".supabase.co") && /^[a-z0-9]+$/i.test(hostname)) {
            return `https://${hostname}.supabase.co`;
        }
    }
    catch {
        return url;
    }

    return url;
}

function hasSupabaseProjectHost(url) {
    try {
        return new URL(url).hostname.toLowerCase().endsWith(".supabase.co");
    }
    catch {
        return false;
    }
}

/** Login-only URL resolver. Prefers project ref from anon JWT over env. */
function resolveSupabaseLoginUrl() {
    const rawUrl = stripEnvQuotes(process.env.NEXT_PUBLIC_SUPABASE_URL);
    const anonKey = stripEnvQuotes(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
    const refFromJwt = extractProjectRefFromAnonKey(anonKey);

    if (refFromJwt) {
        return `https://${refFromJwt}.supabase.co`;
    }

    let url = rawUrl ? normalizeSupabaseProjectUrl(rawUrl) : "";
    if (!hasSupabaseProjectHost(url) && refFromJwt) {
        url = `https://${refFromJwt}.supabase.co`;
    }

    if (!url) {
        throw new Error("NEXT_PUBLIC_SUPABASE_URL is missing.");
    }
    if (url.includes("digitalmusicdatabase.com")) {
        throw new Error(
            `NEXT_PUBLIC_SUPABASE_URL must be your Supabase project URL (*.supabase.co), not the site URL. Current value: ${rawUrl}`,
        );
    }
    if (!hasSupabaseProjectHost(url)) {
        throw new Error(
            `NEXT_PUBLIC_SUPABASE_URL must be a Supabase project URL (*.supabase.co). Current value: ${rawUrl}`,
        );
    }
    return url;
}

/** Final Supabase project URL used by browser auth (signIn, session, refresh). */
export const supabaseLoginUrl = resolveSupabaseLoginUrl();
const anonKey = stripEnvQuotes(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
if (!anonKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY is missing.");
}

export const supabase = createClient(supabaseLoginUrl, anonKey, {
    auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
    },
});
