export const SUPABASE_PROJECT_REF = "aehuszoadgqtbkxsliyy";
export const SUPABASE_PROJECT_URL = `https://${SUPABASE_PROJECT_REF}.supabase.co`;

const ISOLATED_LOCAL_PROJECT_REF = "isolated-local";

export type SupabaseRuntimeMode = "production" | "preview-staging" | "isolated-local";

export type SupabaseProjectSelection = {
    mode: SupabaseRuntimeMode;
    projectRef: string;
    projectUrl: string;
    storageUploadOrigin: string;
};

function parseEnabledFlag(value: string | undefined) {
    const normalized = String(value || "").trim().toLowerCase();
    return normalized === "1" || normalized === "true" || normalized === "yes";
}

function previewStagingExplicitlyEnabled() {
    return (
        parseEnabledFlag(process.env.MDB_PREVIEW_SUPABASE_ENABLED)
        || parseEnabledFlag(process.env.NEXT_PUBLIC_MDB_PREVIEW_SUPABASE_ENABLED)
    );
}

/** Vercel deployment tier when present; otherwise local Node/Next workspace. */
export function readSupabaseDeploymentTier() {
    const vercelEnv = String(process.env.VERCEL_ENV || "").trim().toLowerCase();
    if (vercelEnv === "production") return "production" as const;
    if (vercelEnv === "preview") return "preview" as const;
    if (vercelEnv === "development") return "preview" as const;
    return "local" as const;
}

/**
 * Browser bundles only receive NEXT_PUBLIC_* vars, so Preview client code sees tier "local".
 * When preview staging is explicitly enabled and a non-production project URL is configured,
 * treat the runtime like Preview for Supabase selection (server routes still use VERCEL_ENV).
 */
function readEffectiveSupabaseDeploymentTier(configuredRef: string) {
    const tier = readSupabaseDeploymentTier();
    if (tier !== "local") {
        return tier;
    }
    if (
        previewStagingExplicitlyEnabled()
        && configuredRef
        && configuredRef !== SUPABASE_PROJECT_REF
    ) {
        return "preview" as const;
    }
    return tier;
}

function extractRefFromSupabaseProjectHostname(hostname: string) {
    const host = hostname.toLowerCase();
    if (!host.endsWith(".supabase.co")) return "";
    return host.slice(0, -".supabase.co".length);
}

export function extractRefFromSupabaseProjectUrl(url: string) {
    try {
        return extractRefFromSupabaseProjectHostname(new URL(url).hostname);
    }
    catch {
        return "";
    }
}

function rejectMisconfiguredSiteUrl(url: string) {
    if (url.includes("digitalmusicdatabase.com") || url.includes("vercel.app") || url.includes("localhost")) {
        throw new Error(
            "NEXT_PUBLIC_SUPABASE_URL must be your Supabase project URL (*.supabase.co), not the site URL.",
        );
    }
}

function assertLegacyJwtMatchesProjectRef(keyName: string, key: string, expectedRef: string) {
    const shapeError = describeSupabaseEnvValue(keyName, key);
    if (shapeError) {
        throw new Error(shapeError);
    }
    const ref = extractSupabaseProjectRefFromKey(key);
    if (ref && ref !== expectedRef) {
        throw new Error(
            `${keyName} is for Supabase project "${ref}", but the selected project is "${expectedRef}".`,
        );
    }
}

function productionSelection(): SupabaseProjectSelection {
    return {
        mode: "production",
        projectRef: SUPABASE_PROJECT_REF,
        projectUrl: SUPABASE_PROJECT_URL,
        storageUploadOrigin: `https://${SUPABASE_PROJECT_REF}.storage.supabase.co`,
    };
}

function isolatedLocalSelection(): SupabaseProjectSelection {
    const url = parseConfiguredSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL || "");
    const origin = url ? url.origin : "http://127.0.0.1:54321";
    return {
        mode: "isolated-local",
        projectRef: ISOLATED_LOCAL_PROJECT_REF,
        projectUrl: origin,
        storageUploadOrigin: `${origin}/storage/v1`,
    };
}

function previewStagingSelection(normalizedUrl: string, stagingRef: string): SupabaseProjectSelection {
    const projectUrl = `https://${stagingRef}.supabase.co`;
    return {
        mode: "preview-staging",
        projectRef: stagingRef,
        projectUrl,
        storageUploadOrigin: `https://${stagingRef}.storage.supabase.co`,
    };
}

/**
 * Selects the Supabase project for this process.
 * Production deployments always use the locked production project.
 * Preview may use a separate project only when explicitly enabled and fully validated.
 */
export function resolveSupabaseProjectSelection(): SupabaseProjectSelection {
    if (isIsolatedLocalSupabaseE2E()) {
        return isolatedLocalSelection();
    }

    const tier = readSupabaseDeploymentTier();
    const rawUrl = stripEnvQuotes(process.env.NEXT_PUBLIC_SUPABASE_URL || "");
    const normalizedUrl = rawUrl ? normalizeSupabaseProjectUrl(rawUrl) : "";
    const configuredRef = normalizedUrl && hasSupabaseProjectHost(normalizedUrl)
        ? extractRefFromSupabaseProjectUrl(normalizedUrl)
        : "";
    const effectiveTier = readEffectiveSupabaseDeploymentTier(configuredRef);

    if (tier === "production") {
        if (previewStagingExplicitlyEnabled()) {
            throw new Error(
                "MDB_PREVIEW_SUPABASE_ENABLED and NEXT_PUBLIC_MDB_PREVIEW_SUPABASE_ENABLED cannot be set on production deployments.",
            );
        }
        if (configuredRef && configuredRef !== SUPABASE_PROJECT_REF) {
            throw new Error(
                `Production deployment: NEXT_PUBLIC_SUPABASE_URL must reference project "${SUPABASE_PROJECT_REF}", not "${configuredRef}".`,
            );
        }
        const anonKey = sanitizeApiKey(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "");
        if (anonKey) {
            assertLegacyJwtMatchesProjectRef("NEXT_PUBLIC_SUPABASE_ANON_KEY", anonKey, SUPABASE_PROJECT_REF);
        }
        const serviceRoleKey = sanitizeApiKey(process.env.SUPABASE_SERVICE_ROLE_KEY || "");
        if (serviceRoleKey && serviceRoleKey !== "your_service_role_key_here" && serviceRoleKey.startsWith("eyJ")) {
            assertLegacyJwtMatchesProjectRef("SUPABASE_SERVICE_ROLE_KEY", serviceRoleKey, SUPABASE_PROJECT_REF);
        }
        return productionSelection();
    }

    if (effectiveTier === "preview" && previewStagingExplicitlyEnabled()) {
        if (!normalizedUrl || !hasSupabaseProjectHost(normalizedUrl)) {
            throw new Error(
                "Preview staging requires NEXT_PUBLIC_SUPABASE_URL set to https://<project-ref>.supabase.co.",
            );
        }
        rejectMisconfiguredSiteUrl(normalizedUrl);
        if (!configuredRef) {
            throw new Error("Preview staging URL must be a valid Supabase project URL (*.supabase.co).");
        }
        if (configuredRef === SUPABASE_PROJECT_REF) {
            throw new Error(
                `Preview staging must use a non-production Supabase project, not "${SUPABASE_PROJECT_REF}".`,
            );
        }
        assertLegacyJwtMatchesProjectRef(
            "NEXT_PUBLIC_SUPABASE_ANON_KEY",
            sanitizeApiKey(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""),
            configuredRef,
        );
        const serviceRoleKey = sanitizeApiKey(process.env.SUPABASE_SERVICE_ROLE_KEY || "");
        const serverPreviewDeployment = tier === "preview";
        if (serverPreviewDeployment) {
            if (!serviceRoleKey || serviceRoleKey === "your_service_role_key_here") {
                throw new Error("Preview staging requires SUPABASE_SERVICE_ROLE_KEY for server routes.");
            }
            assertLegacyJwtMatchesProjectRef("SUPABASE_SERVICE_ROLE_KEY", serviceRoleKey, configuredRef);
        }
        else if (
            serviceRoleKey
            && serviceRoleKey !== "your_service_role_key_here"
            && serviceRoleKey.startsWith("eyJ")
        ) {
            assertLegacyJwtMatchesProjectRef("SUPABASE_SERVICE_ROLE_KEY", serviceRoleKey, configuredRef);
        }
        return previewStagingSelection(normalizedUrl, configuredRef);
    }

    if (rawUrl) {
        if (!normalizedUrl || !hasSupabaseProjectHost(normalizedUrl)) {
            throw new Error(
                "NEXT_PUBLIC_SUPABASE_URL must be a Supabase project URL (*.supabase.co).",
            );
        }
        rejectMisconfiguredSiteUrl(normalizedUrl);
    }

    if (configuredRef && configuredRef !== SUPABASE_PROJECT_REF) {
        throw new Error(
            "Non-production NEXT_PUBLIC_SUPABASE_URL requires MDB_PREVIEW_SUPABASE_ENABLED=1 or NEXT_PUBLIC_MDB_PREVIEW_SUPABASE_ENABLED=1 on Preview deployments.",
        );
    }

    return productionSelection();
}

/** Safe runtime identity for diagnostics (no secrets). */
export function describeSupabaseRuntimeIdentity() {
    const selection = resolveSupabaseProjectSelection();
    return {
        mode: selection.mode,
        projectRef: selection.projectRef,
        projectHost: (() => {
            try {
                return new URL(selection.projectUrl).hostname;
            }
            catch {
                return "";
            }
        })(),
        deploymentTier: readSupabaseDeploymentTier(),
        previewStagingEnabled: previewStagingExplicitlyEnabled(),
    };
}

export function resolveSupabaseAuthStorageKey() {
    return `sb-${resolveSupabaseProjectSelection().projectRef}-auth-token`;
}

export function resolveSupabaseStorageUploadUrl() {
    return resolveSupabaseProjectSelection().storageUploadOrigin;
}

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

/** Browser login client URL — selected Supabase project host, never the app/Vercel URL. */
export function resolveSupabaseLoginUrl() {
    if (isolatedSupabaseE2EFlagEnabled() && !isIsolatedLocalSupabaseE2E()) {
        throw new Error(
            "MDB_ISOLATED_SUPABASE_E2E requires http://127.0.0.1:54321 or http://localhost:54321 and must not reference the production project.",
        );
    }
    const configured = parseConfiguredSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL || "");
    if (configured && isLoopbackHostname(configured.hostname) && !isIsolatedLocalSupabaseE2E()) {
        throw new Error("A localhost Supabase URL requires MDB_ISOLATED_SUPABASE_E2E=1.");
    }
    return resolveSupabaseProjectSelection().projectUrl;
}

const ISOLATED_LOCAL_SUPABASE_PORT = "54321";

function isolatedSupabaseE2EFlagEnabled() {
    const flag = String(process.env.MDB_ISOLATED_SUPABASE_E2E || "").trim().toLowerCase();
    return flag === "1" || flag === "true" || flag === "yes";
}

function parseConfiguredSupabaseUrl(raw: string) {
    const trimmed = stripEnvQuotes(raw);
    if (!trimmed) return null;
    try {
        return new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`);
    }
    catch {
        return null;
    }
}

function isLoopbackHostname(hostname: string) {
    const host = hostname.toLowerCase();
    return host === "127.0.0.1" || host === "localhost";
}

/**
 * Isolated local Supabase API only. Requires the explicit E2E flag, HTTP, and port 54321.
 * Any other host, scheme, port, path, or the production project ref is rejected.
 */
function isIsolatedLocalSupabaseE2E() {
    if (!isolatedSupabaseE2EFlagEnabled()) {
        return false;
    }
    const raw = stripEnvQuotes(process.env.NEXT_PUBLIC_SUPABASE_URL || "");
    if (!raw) {
        return false;
    }
    if (raw.includes(SUPABASE_PROJECT_REF)) {
        throw new Error(
            `MDB_ISOLATED_SUPABASE_E2E blocked: NEXT_PUBLIC_SUPABASE_URL must not reference production ref ${SUPABASE_PROJECT_REF}.`,
        );
    }
    const url = parseConfiguredSupabaseUrl(raw);
    if (!url || !isLoopbackHostname(url.hostname)) {
        return false;
    }
    if (url.protocol !== "http:") return false;
    if (url.port !== ISOLATED_LOCAL_SUPABASE_PORT) return false;
    if (url.username || url.password) return false;
    if (url.pathname !== "/" && url.pathname !== "") return false;
    if (url.search || url.hash) return false;
    return true;
}

/** True only when the candidate is the approved isolated local API origin. */
export function isApprovedIsolatedLocalSupabaseUrl(candidate: string) {
    if (!isIsolatedLocalSupabaseE2E()) return false;
    const expected = parseConfiguredSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL || "");
    const parsed = parseConfiguredSupabaseUrl(candidate);
    if (!expected || !parsed) return false;
    if (candidate.includes(SUPABASE_PROJECT_REF)) return false;
    return parsed.origin === expected.origin
        && (parsed.pathname === "/" || parsed.pathname === "")
        && !parsed.search
        && !parsed.hash
        && !parsed.username
        && !parsed.password;
}

export function readSupabaseProjectUrl() {
    return resolveSupabaseLoginUrl();
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
                const selectedRef = resolveSupabaseProjectSelection().projectRef;
                if (
                    isIsolatedLocalSupabaseE2E()
                    || !meta.projectRef
                    || meta.projectRef === selectedRef
                ) {
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
    const selectedRef = resolveSupabaseProjectSelection().projectRef;
    if (!isIsolatedLocalSupabaseE2E() && meta.projectRef && meta.projectRef !== selectedRef) {
        throw new Error(
            `SUPABASE_SERVICE_ROLE_KEY is for project "${meta.projectRef}", but this app uses "${selectedRef}".`,
        );
    }
    return sanitizeApiKey(serviceRoleKey);
}
