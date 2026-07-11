export const SUPABASE_PROJECT_REF = "aehuszoadgqtbkxsliyy";
export const SUPABASE_PROJECT_URL = `https://${SUPABASE_PROJECT_REF}.supabase.co`;

function decodeJwtPayload(key: string) {
    try {
        const payload = key.split(".")[1];
        if (!payload) return null;
        const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
        const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
        const jsonStr =
            typeof Buffer !== "undefined"
                ? Buffer.from(padded, "base64").toString("utf8")
                : atob(padded);
        return JSON.parse(jsonStr) as { role?: string; ref?: string; iss?: string };
    }
    catch {
        return null;
    }
}

function extractRefFromJwtPayload(payload: { ref?: string; iss?: string } | null) {
    if (!payload) return "";
    const directRef = String(payload.ref || "").trim();
    if (directRef) return directRef;
    const iss = String(payload.iss || "").trim();
    const hostMatch = iss.match(/https?:\/\/([a-z0-9]+)\.supabase\.co/i);
    if (hostMatch?.[1]) return hostMatch[1];
    if (iss === "supabase") return SUPABASE_PROJECT_REF;
    return "";
}

export function describeSupabaseApiKey(key: string) {
    const raw = sanitizeApiKey(key);
    if (!raw) {
        return {
            keyFormat: "missing" as const,
            role: null as string | null,
            projectRef: null as string | null,
        };
    }
    if (raw.startsWith("sb_secret_")) {
        return {
            keyFormat: "sb_secret" as const,
            role: "service_role",
            projectRef: SUPABASE_PROJECT_REF,
        };
    }
    if (raw.startsWith("sb_publishable_")) {
        return {
            keyFormat: "sb_publishable" as const,
            role: "anon",
            projectRef: SUPABASE_PROJECT_REF,
        };
    }
    if (raw.startsWith("eyJ")) {
        const payload = decodeJwtPayload(raw);
        const role = payload?.role ? String(payload.role) : null;
        const projectRef = extractRefFromJwtPayload(payload) || null;
        return {
            keyFormat: "legacy-jwt" as const,
            role,
            projectRef,
        };
    }
    return {
        keyFormat: "other" as const,
        role: null as string | null,
        projectRef: null as string | null,
    };
}

export function readSupabaseLibraryKeySource() {
    const serviceRoleKey = sanitizeApiKey(process.env.SUPABASE_SERVICE_ROLE_KEY || "");
    const anonKey = sanitizeApiKey(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "");
    const serviceRoleMeta = serviceRoleKey ? describeSupabaseApiKey(serviceRoleKey) : null;

    if (serviceRoleKey && serviceRoleKey !== "your_service_role_key_here") {
        if (serviceRoleKey.startsWith("sb_secret_") || serviceRoleMeta?.role === "service_role") {
            return {
                keySource: "SUPABASE_SERVICE_ROLE_KEY" as const,
                role: serviceRoleMeta?.role ?? "service_role",
                projectRef: serviceRoleMeta?.projectRef ?? SUPABASE_PROJECT_REF,
                keyFormat: serviceRoleMeta?.keyFormat ?? "sb_secret",
            };
        }
    }

    const libraryKey = readSupabaseLibraryApiKey();
    const libraryMeta = describeSupabaseApiKey(libraryKey);
    if (
        serviceRoleKey &&
        serviceRoleKey !== "your_service_role_key_here" &&
        libraryKey === serviceRoleKey
    ) {
        return {
            keySource: "SUPABASE_SERVICE_ROLE_KEY" as const,
            ...libraryMeta,
        };
    }
    if (libraryMeta.role === "service_role") {
        return {
            keySource: "SUPABASE_SERVICE_ROLE_KEY" as const,
            ...libraryMeta,
        };
    }
    return {
        keySource: "NEXT_PUBLIC_SUPABASE_ANON_KEY (fallback)" as const,
        ...libraryMeta,
        serviceRoleKeyMeta: serviceRoleMeta,
        anonKeyMeta: anonKey ? describeSupabaseApiKey(anonKey) : null,
    };
}

function decodeJwtRole(key: string) {
    return String(decodeJwtPayload(key)?.role || "");
}

export function extractSupabaseProjectRefFromKey(key: string) {
    return extractRefFromJwtPayload(decodeJwtPayload(key));
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

/** Browser login client URL — always the locked Supabase project host, never the app/Vercel URL. */
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
        // Locked single-project app: fall back to the known project host.
        return SUPABASE_PROJECT_URL;
    }
    if (url.includes("digitalmusicdatabase.com") || url.includes("vercel.app") || url.includes("localhost")) {
        throw new Error(
            `NEXT_PUBLIC_SUPABASE_URL must be your Supabase project URL (*.supabase.co), not the site URL. Current value: ${rawUrl}`,
        );
    }
    if (!hasSupabaseProjectHost(url)) {
        throw new Error(
            `NEXT_PUBLIC_SUPABASE_URL must be a Supabase project URL (*.supabase.co). Current value: ${rawUrl}`,
        );
    }

    try {
        const hostname = new URL(url).hostname.toLowerCase();
        if (hostname === `${SUPABASE_PROJECT_REF}.supabase.co`) {
            return SUPABASE_PROJECT_URL;
        }
    }
    catch {
        return SUPABASE_PROJECT_URL;
    }

    // Prefer the locked project for this app so auth never targets a wrong/misconfigured host.
    return SUPABASE_PROJECT_URL;
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

function sanitizeApiKey(value: string) {
    return stripEnvQuotes(value).replace(/\s+/g, "");
}

/** Server library routes: service_role when valid, else anon (login-proven in production). */
export function readSupabaseLibraryApiKey() {
    const serviceRoleKey = sanitizeApiKey(process.env.SUPABASE_SERVICE_ROLE_KEY || "");
    const anonKey = sanitizeApiKey(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "");

    if (serviceRoleKey && serviceRoleKey !== "your_service_role_key_here") {
        if (serviceRoleKey.startsWith("sb_secret_")) {
            return serviceRoleKey;
        }
        if (serviceRoleKey.startsWith("eyJ")) {
            const meta = describeSupabaseApiKey(serviceRoleKey);
            if (meta.role === "service_role") {
                if (!meta.projectRef || meta.projectRef === SUPABASE_PROJECT_REF) {
                    return serviceRoleKey;
                }
            }
        }
    }

    if (anonKey) {
        return anonKey;
    }

    throw new Error(
        "Library routes need SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    );
}

export function readSupabaseServiceRoleKey() {
    const serviceRoleKey = stripEnvQuotes(process.env.SUPABASE_SERVICE_ROLE_KEY || "");
    if (!serviceRoleKey || serviceRoleKey === "your_service_role_key_here") {
        throw new Error("SUPABASE_SERVICE_ROLE_KEY is missing or still set to the placeholder value.");
    }
    if (serviceRoleKey.startsWith("sb_secret_")) {
        return sanitizeApiKey(serviceRoleKey);
    }
    const shapeError = describeSupabaseEnvValue("SUPABASE_SERVICE_ROLE_KEY", serviceRoleKey);
    if (shapeError) {
        throw new Error(shapeError);
    }
    const meta = describeSupabaseApiKey(serviceRoleKey);
    if (meta.role === "anon") {
        throw new Error(
            "SUPABASE_SERVICE_ROLE_KEY is set to the anon key. Use the service_role legacy JWT from Supabase Settings > API.",
        );
    }
    if (meta.role && meta.role !== "service_role") {
        throw new Error(`SUPABASE_SERVICE_ROLE_KEY must be the service_role JWT. Current JWT role: ${meta.role}.`);
    }
    if (meta.projectRef && meta.projectRef !== SUPABASE_PROJECT_REF) {
        throw new Error(
            `SUPABASE_SERVICE_ROLE_KEY is for project "${meta.projectRef}", but this app uses "${SUPABASE_PROJECT_REF}".`,
        );
    }
    return sanitizeApiKey(serviceRoleKey);
}
