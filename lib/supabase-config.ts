export const SUPABASE_PROJECT_REF = "aehuszoadgqtbkxsliyy";
export const SUPABASE_PROJECT_URL = `https://${SUPABASE_PROJECT_REF}.supabase.co`;

function decodeJwtPayload(key: string) {
    try {
        const payload = key.split(".")[1];
        if (!payload) return null;
        const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
        const jsonStr =
            typeof Buffer !== "undefined"
                ? Buffer.from(normalized, "base64").toString("utf8")
                : atob(normalized);
        return JSON.parse(jsonStr) as { role?: string; ref?: string };
    }
    catch {
        return null;
    }
}

function decodeJwtRole(key: string) {
    return String(decodeJwtPayload(key)?.role || "");
}

export function extractSupabaseProjectRefFromKey(key: string) {
    return String(decodeJwtPayload(key)?.ref || "").trim();
}

function looksLikeUrl(value: string) {
    return /^https?:\/\//i.test(value);
}

export function describeSupabaseEnvValue(name: string, value: string) {
    if (!value) return `${name} is missing.`;
    if (looksLikeUrl(value)) {
        return `${name} must be a Supabase API key, not a URL. Current value starts with ${value.slice(0, 40)}`;
    }
    if (value.startsWith("sb_publishable_")) {
        return `${name} must use the legacy anon JWT key (eyJ...), not sb_publishable.`;
    }
    if (value.startsWith("sb_secret_")) {
        return `${name} must use the legacy service_role JWT key (eyJ...), not sb_secret.`;
    }
    if (!value.startsWith("eyJ")) {
        return `${name} must be a legacy Supabase JWT API key (eyJ...).`;
    }
    return "";
}

function stripEnvQuotes(value: string) {
    return value.trim().replace(/^["']|["']$/g, "");
}

function normalizeSupabaseProjectUrl(raw: string) {
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

function hasSupabaseProjectHost(url: string) {
    try {
        return new URL(url).hostname.toLowerCase().endsWith(".supabase.co");
    }
    catch {
        return false;
    }
}

/** Browser login client URL — normalizes env and falls back to project ref from anon JWT. */
export function resolveSupabaseLoginUrl() {
    const rawUrl = stripEnvQuotes(process.env.NEXT_PUBLIC_SUPABASE_URL || "");
    const anonKey = stripEnvQuotes(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "");
    let url = rawUrl ? normalizeSupabaseProjectUrl(rawUrl) : "";

    if (!hasSupabaseProjectHost(url) && anonKey) {
        const ref = extractSupabaseProjectRefFromKey(anonKey);
        if (ref) {
            url = `https://${ref}.supabase.co`;
        }
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

export function readSupabaseProjectUrl() {
    return SUPABASE_PROJECT_URL;
}

export function readSupabaseAnonKey() {
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || "";
    if (!anonKey) {
        throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY is missing.");
    }
    const shapeError = describeSupabaseEnvValue("NEXT_PUBLIC_SUPABASE_ANON_KEY", anonKey);
    if (shapeError) {
        throw new Error(shapeError);
    }
    const role = decodeJwtRole(anonKey);
    if (role && role !== "anon") {
        throw new Error(
            `NEXT_PUBLIC_SUPABASE_ANON_KEY is set to a ${role} key. Use the anon legacy JWT from Supabase Settings > API.`,
        );
    }
    return anonKey;
}

export function readSupabaseServiceRoleKey() {
    const serviceRoleKey = stripEnvQuotes(process.env.SUPABASE_SERVICE_ROLE_KEY || "");
    if (!serviceRoleKey || serviceRoleKey === "your_service_role_key_here") {
        throw new Error("SUPABASE_SERVICE_ROLE_KEY is missing or still set to the placeholder value.");
    }
    const shapeError = describeSupabaseEnvValue("SUPABASE_SERVICE_ROLE_KEY", serviceRoleKey);
    if (shapeError) {
        throw new Error(shapeError);
    }
    const role = decodeJwtRole(serviceRoleKey);
    if (role === "anon") {
        throw new Error(
            "SUPABASE_SERVICE_ROLE_KEY is set to the anon key. Use the service_role legacy JWT from Supabase Settings > API.",
        );
    }
    if (role && role !== "service_role") {
        throw new Error(`SUPABASE_SERVICE_ROLE_KEY must be the service_role JWT. Current JWT role: ${role}.`);
    }
    const ref = extractSupabaseProjectRefFromKey(serviceRoleKey);
    if (ref && ref !== SUPABASE_PROJECT_REF) {
        throw new Error(
            `SUPABASE_SERVICE_ROLE_KEY is for project "${ref}", but this app uses "${SUPABASE_PROJECT_REF}".`,
        );
    }
    return serviceRoleKey;
}
