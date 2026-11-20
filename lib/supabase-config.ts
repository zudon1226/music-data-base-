export const SUPABASE_PROJECT_REF = "aehuszoadgqtbkxsliyy";
export const SUPABASE_PROJECT_URL = `https://${SUPABASE_PROJECT_REF}.supabase.co`;

/** Approved MDB Preview staging Supabase project (non-production). */
export const PREVIEW_STAGING_SUPABASE_PROJECT_REF = "jzlegcbotqfzevtczwhx";
export const PREVIEW_STAGING_SUPABASE_PROJECT_URL = `https://${PREVIEW_STAGING_SUPABASE_PROJECT_REF}.supabase.co`;

/**
 * Build-time browser identity (Next.js inlines NEXT_PUBLIC_* at compile time).
 * - `production` (default): browser always resolves the locked production project.
 * - `preview-staging`: browser may resolve staging when combined with
 *   NEXT_PUBLIC_MDB_PREVIEW_SUPABASE_ENABLED and validated URL/anon JWT.
 * Vercel Preview staging builds must set this alongside staging URL/keys.
 */
export const MDB_SUPABASE_BROWSER_IDENTITY_PRODUCTION = "production";
export const MDB_SUPABASE_BROWSER_IDENTITY_PREVIEW_STAGING = "preview-staging";

/** Deliberate server-side local staging (never implied by URL or public flag alone). */
const LOCAL_STAGING_OPT_IN_ENV = "MDB_LOCAL_SUPABASE_STAGING";

export type SupabaseRuntimeMode = "production" | "preview-staging";

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

function previewStagingFlagsComplete() {
    return (
        parseEnabledFlag(process.env.MDB_PREVIEW_SUPABASE_ENABLED)
        && parseEnabledFlag(process.env.NEXT_PUBLIC_MDB_PREVIEW_SUPABASE_ENABLED)
    );
}

function previewStagingFlagPartiallySet() {
    const server = parseEnabledFlag(process.env.MDB_PREVIEW_SUPABASE_ENABLED);
    const client = parseEnabledFlag(process.env.NEXT_PUBLIC_MDB_PREVIEW_SUPABASE_ENABLED);
    return server !== client;
}

function productionSupabaseOverrideEnabled() {
    return (
        parseEnabledFlag(process.env.MDB_PREVIEW_PWA_USE_PRODUCTION_SUPABASE)
        || parseEnabledFlag(process.env.NEXT_PUBLIC_MDB_PREVIEW_PWA_USE_PRODUCTION_SUPABASE)
    );
}

/** Vercel deployment tier when present; otherwise local Node/Next workspace. */
export function readSupabaseDeploymentTier() {
    const vercelEnv = String(process.env.VERCEL_ENV || "").trim().toLowerCase();
    if (vercelEnv === "production") return "production" as const;
    if (vercelEnv === "preview") return "preview" as const;
    return "local" as const;
}

function isBrowserSupabaseRuntime() {
    return typeof window !== "undefined";
}

function localStagingExplicitlyEnabled() {
    return (
        parseEnabledFlag(process.env[LOCAL_STAGING_OPT_IN_ENV])
        && previewStagingFlagsComplete()
    );
}

export function readBrowserBuildIdentity() {
    const raw = stripEnvQuotes(process.env.NEXT_PUBLIC_MDB_SUPABASE_BROWSER_IDENTITY || "").toLowerCase();
    if (!raw || raw === MDB_SUPABASE_BROWSER_IDENTITY_PRODUCTION) {
        return MDB_SUPABASE_BROWSER_IDENTITY_PRODUCTION as typeof MDB_SUPABASE_BROWSER_IDENTITY_PRODUCTION;
    }
    if (raw === MDB_SUPABASE_BROWSER_IDENTITY_PREVIEW_STAGING) {
        return MDB_SUPABASE_BROWSER_IDENTITY_PREVIEW_STAGING as typeof MDB_SUPABASE_BROWSER_IDENTITY_PREVIEW_STAGING;
    }
    throw new Error(
        `Unsupported NEXT_PUBLIC_MDB_SUPABASE_BROWSER_IDENTITY "${raw}". Use "${MDB_SUPABASE_BROWSER_IDENTITY_PRODUCTION}" or "${MDB_SUPABASE_BROWSER_IDENTITY_PREVIEW_STAGING}".`,
    );
}

function readConfiguredSupabaseProjectRef() {
    const rawUrl = stripEnvQuotes(process.env.NEXT_PUBLIC_SUPABASE_URL || "");
    const normalizedUrl = rawUrl ? normalizeSupabaseProjectUrl(rawUrl) : "";
    if (!normalizedUrl || !hasSupabaseProjectHost(normalizedUrl)) {
        return { rawUrl, normalizedUrl, configuredRef: "" };
    }
    return {
        rawUrl,
        normalizedUrl,
        configuredRef: extractRefFromSupabaseProjectUrl(normalizedUrl),
    };
}

function serverStagingDeploymentAuthorized(tier: ReturnType<typeof readSupabaseDeploymentTier>, configuredRef: string) {
    if (tier === "preview") {
        return true;
    }
    if (
        tier === "local"
        && localStagingExplicitlyEnabled()
        && configuredRef === PREVIEW_STAGING_SUPABASE_PROJECT_REF
    ) {
        return true;
    }
    return false;
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
            projectRef: null,
        };
    }
    if (raw.startsWith("sb_publishable_")) {
        return {
            keyFormat: "sb_publishable" as const,
            role: "anon",
            projectRef: null,
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
                projectRef: serviceRoleMeta?.projectRef ?? resolveSupabaseProjectSelection().projectRef,
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

export function extractRefFromSupabaseProjectUrl(url: string) {
    try {
        const hostname = new URL(url).hostname.toLowerCase();
        if (!hostname.endsWith(".supabase.co")) return "";
        return hostname.slice(0, -".supabase.co".length);
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
    if (!ref) {
        throw new Error(
            `${keyName} legacy JWT is missing a Supabase project ref claim for "${expectedRef}".`,
        );
    }
    if (ref !== expectedRef) {
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

function previewStagingSelection(stagingRef: string): SupabaseProjectSelection {
    const projectUrl = `https://${stagingRef}.supabase.co`;
    return {
        mode: "preview-staging",
        projectRef: stagingRef,
        projectUrl,
        storageUploadOrigin: `https://${stagingRef}.storage.supabase.co`,
    };
}

function assertPreviewStagingAllowed(configuredRef: string) {
    if (configuredRef !== PREVIEW_STAGING_SUPABASE_PROJECT_REF) {
        throw new Error(
            `Unsupported Supabase project ref "${configuredRef}". Preview staging is locked to "${PREVIEW_STAGING_SUPABASE_PROJECT_REF}".`,
        );
    }
}

function assertProductionBrowserIdentity(configuredRef: string) {
    if (parseEnabledFlag(process.env.NEXT_PUBLIC_MDB_PREVIEW_SUPABASE_ENABLED)) {
        throw new Error(
            "Production browser identity rejects NEXT_PUBLIC_MDB_PREVIEW_SUPABASE_ENABLED. Use a production browser build.",
        );
    }
    if (configuredRef && configuredRef !== SUPABASE_PROJECT_REF) {
        throw new Error(
            `Production browser identity: NEXT_PUBLIC_SUPABASE_URL must reference project "${SUPABASE_PROJECT_REF}", not "${configuredRef}".`,
        );
    }
    const anonKey = sanitizeApiKey(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "");
    if (anonKey.startsWith("eyJ")) {
        assertLegacyJwtMatchesProjectRef("NEXT_PUBLIC_SUPABASE_ANON_KEY", anonKey, SUPABASE_PROJECT_REF);
    }
}

function assertPreviewStagingBrowserIdentity(configuredRef: string, normalizedUrl: string) {
    if (!parseEnabledFlag(process.env.NEXT_PUBLIC_MDB_PREVIEW_SUPABASE_ENABLED)) {
        throw new Error(
            "Preview staging browser identity requires NEXT_PUBLIC_MDB_PREVIEW_SUPABASE_ENABLED=1.",
        );
    }
    if (!normalizedUrl || !hasSupabaseProjectHost(normalizedUrl)) {
        throw new Error(
            "Preview staging browser identity requires NEXT_PUBLIC_SUPABASE_URL set to https://<project-ref>.supabase.co.",
        );
    }
    rejectMisconfiguredSiteUrl(normalizedUrl);
    assertPreviewStagingAllowed(configuredRef);
    const anonKey = sanitizeApiKey(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "");
    assertLegacyJwtMatchesProjectRef("NEXT_PUBLIC_SUPABASE_ANON_KEY", anonKey, configuredRef);
}

/**
 * Browser-only resolver. Uses build-time NEXT_PUBLIC_MDB_SUPABASE_BROWSER_IDENTITY
 * plus validated URL/anon JWT. Never reads server-only flags or service-role keys.
 */
export function resolveBrowserSupabaseProjectSelection(): SupabaseProjectSelection {
    const { normalizedUrl, configuredRef } = readConfiguredSupabaseProjectRef();
    const browserIdentity = readBrowserBuildIdentity();
    if (browserIdentity === MDB_SUPABASE_BROWSER_IDENTITY_PRODUCTION) {
        assertProductionBrowserIdentity(configuredRef);
        return productionSelection();
    }
    assertPreviewStagingBrowserIdentity(configuredRef, normalizedUrl);
    return previewStagingSelection(configuredRef);
}

/**
 * Server / SSR resolver. Requires both preview flags and service-role JWT on staging paths.
 */
export function resolveServerSupabaseProjectSelection(): SupabaseProjectSelection {
    const tier = readSupabaseDeploymentTier();
    const { rawUrl, normalizedUrl, configuredRef } = readConfiguredSupabaseProjectRef();

    if (tier === "production") {
        if (previewStagingFlagsComplete() || previewStagingFlagPartiallySet()) {
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
        if (anonKey.startsWith("eyJ")) {
            assertLegacyJwtMatchesProjectRef("NEXT_PUBLIC_SUPABASE_ANON_KEY", anonKey, SUPABASE_PROJECT_REF);
        }
        const serviceRoleKey = sanitizeApiKey(process.env.SUPABASE_SERVICE_ROLE_KEY || "");
        if (serviceRoleKey && serviceRoleKey !== "your_service_role_key_here" && serviceRoleKey.startsWith("eyJ")) {
            assertLegacyJwtMatchesProjectRef("SUPABASE_SERVICE_ROLE_KEY", serviceRoleKey, SUPABASE_PROJECT_REF);
        }
        return productionSelection();
    }

    if (serverStagingDeploymentAuthorized(tier, configuredRef) && previewStagingFlagPartiallySet()) {
        throw new Error(
            "Preview staging requires both MDB_PREVIEW_SUPABASE_ENABLED=1 and NEXT_PUBLIC_MDB_PREVIEW_SUPABASE_ENABLED=1.",
        );
    }

    if (serverStagingDeploymentAuthorized(tier, configuredRef) && previewStagingFlagsComplete()) {
        if (productionSupabaseOverrideEnabled()) {
            throw new Error(
                "MDB_PREVIEW_PWA_USE_PRODUCTION_SUPABASE cannot be enabled when Preview staging Supabase is configured.",
            );
        }
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
        assertPreviewStagingAllowed(configuredRef);
        const anonKey = sanitizeApiKey(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "");
        assertLegacyJwtMatchesProjectRef("NEXT_PUBLIC_SUPABASE_ANON_KEY", anonKey, configuredRef);
        const serviceRoleKey = sanitizeApiKey(process.env.SUPABASE_SERVICE_ROLE_KEY || "");
        if (!serviceRoleKey || serviceRoleKey === "your_service_role_key_here") {
            throw new Error("Preview staging requires SUPABASE_SERVICE_ROLE_KEY for server routes.");
        }
        assertLegacyJwtMatchesProjectRef("SUPABASE_SERVICE_ROLE_KEY", serviceRoleKey, configuredRef);
        return previewStagingSelection(configuredRef);
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
        if (parseEnabledFlag(process.env.NEXT_PUBLIC_MDB_PREVIEW_SUPABASE_ENABLED) || parseEnabledFlag(process.env.MDB_PREVIEW_SUPABASE_ENABLED)) {
            throw new Error(
                `Non-production NEXT_PUBLIC_SUPABASE_URL requires an authorized Preview or explicit local staging configuration (${LOCAL_STAGING_OPT_IN_ENV}=1 with both preview flags).`,
            );
        }
        throw new Error(
            `Local development: NEXT_PUBLIC_SUPABASE_URL must reference production project "${SUPABASE_PROJECT_REF}" unless ${LOCAL_STAGING_OPT_IN_ENV}=1 with both preview flags.`,
        );
    }

    if (previewStagingFlagPartiallySet()) {
        throw new Error(
            "Preview staging requires both MDB_PREVIEW_SUPABASE_ENABLED=1 and NEXT_PUBLIC_MDB_PREVIEW_SUPABASE_ENABLED=1.",
        );
    }

    return productionSelection();
}

/**
 * Selects the Supabase project for this process (browser vs server contract).
 */
export function resolveSupabaseProjectSelection(): SupabaseProjectSelection {
    if (isBrowserSupabaseRuntime()) {
        return resolveBrowserSupabaseProjectSelection();
    }
    return resolveServerSupabaseProjectSelection();
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
        previewStagingFlagsComplete: previewStagingFlagsComplete(),
        browserBuildIdentity: isBrowserSupabaseRuntime() ? readBrowserBuildIdentity() : null,
        runtimeSurface: isBrowserSupabaseRuntime() ? "browser" as const : "server" as const,
    };
}

export function resolveSupabaseAuthStorageKey() {
    return `sb-${resolveSupabaseProjectSelection().projectRef}-auth-token`;
}

export function resolveSupabaseStorageUploadUrl() {
    return resolveSupabaseProjectSelection().storageUploadOrigin;
}

function assertValidatedApiKeyFormat(key: string, keyName: string) {
    const raw = sanitizeApiKey(key);
    if (!raw.startsWith("sb_secret_") && !raw.startsWith("sb_publishable_")) {
        return;
    }
    const selection = resolveSupabaseProjectSelection();
    const kind = raw.startsWith("sb_secret_") ? "sb_secret" : "sb_publishable";
    if (selection.mode === "preview-staging") {
        throw new Error(
            `${keyName} uses ${kind}, which cannot be validated against the staging project. Use legacy eyJ... JWT keys from the staging Supabase project.`,
        );
    }
    if (selection.projectRef !== SUPABASE_PROJECT_REF || selection.mode !== "production") {
        throw new Error(
            `${keyName} uses ${kind}, which cannot be project-validated for "${selection.projectRef}". Use legacy eyJ... JWT keys.`,
        );
    }
}

/** Browser login client URL — selected Supabase project host, never the app/Vercel URL. */
export function resolveSupabaseLoginUrl() {
    return resolveSupabaseProjectSelection().projectUrl;
}

export function readSupabaseProjectUrl() {
    return resolveSupabaseProjectSelection().projectUrl;
}

export function readSupabaseAnonKey() {
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || "";
    if (!anonKey) {
        throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY is missing.");
    }
    assertValidatedApiKeyFormat(anonKey, "NEXT_PUBLIC_SUPABASE_ANON_KEY");
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
            assertValidatedApiKeyFormat(serviceRoleKey, "SUPABASE_SERVICE_ROLE_KEY");
            return serviceRoleKey;
        }
        if (serviceRoleKey.startsWith("eyJ")) {
            const meta = describeSupabaseApiKey(serviceRoleKey);
            if (meta.role === "service_role") {
                const selectedRef = resolveSupabaseProjectSelection().projectRef;
                if (meta.projectRef === selectedRef) {
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
        assertValidatedApiKeyFormat(serviceRoleKey, "SUPABASE_SERVICE_ROLE_KEY");
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
    if (!meta.projectRef || meta.projectRef !== selectedRef) {
        throw new Error(
            meta.projectRef
                ? `SUPABASE_SERVICE_ROLE_KEY is for project "${meta.projectRef}", but this app uses "${selectedRef}".`
                : `SUPABASE_SERVICE_ROLE_KEY legacy JWT is missing a Supabase project ref claim for "${selectedRef}".`,
        );
    }
    return sanitizeApiKey(serviceRoleKey);
}
