function decodeJwtRole(key: string) {
    try {
        const payload = key.split(".")[1];
        if (!payload) return "";
        const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
        const json = JSON.parse(Buffer.from(normalized, "base64").toString("utf8")) as { role?: string };
        return String(json.role || "");
    }
    catch {
        return "";
    }
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

function normalizeSupabaseProjectUrl(raw: string) {
    let url = raw.trim();
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

export function readSupabaseProjectUrl() {
    const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || "";
    if (!rawUrl) {
        throw new Error("NEXT_PUBLIC_SUPABASE_URL is missing.");
    }
    const url = normalizeSupabaseProjectUrl(rawUrl);
    if (url.includes("digitalmusicdatabase.com")) {
        throw new Error(
            `NEXT_PUBLIC_SUPABASE_URL must be your Supabase project URL (*.supabase.co), not the site URL. Current value: ${rawUrl}`,
        );
    }
    if (!url.includes(".supabase.co")) {
        throw new Error(
            `NEXT_PUBLIC_SUPABASE_URL must be a Supabase project URL (*.supabase.co). Current value: ${rawUrl}`,
        );
    }
    try {
        new URL(url);
    }
    catch {
        throw new Error(`NEXT_PUBLIC_SUPABASE_URL must be a valid Supabase project URL. Current value: ${rawUrl}`);
    }
    return url;
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
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || "";
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
    return serviceRoleKey;
}
