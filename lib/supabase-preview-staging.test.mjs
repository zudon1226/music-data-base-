/**
 * Supabase runtime identity (synthetic JWTs only).
 * Run: node lib/supabase-preview-staging.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
    MDB_SUPABASE_BROWSER_IDENTITY_PREVIEW_STAGING,
    MDB_SUPABASE_BROWSER_IDENTITY_PRODUCTION,
    PREVIEW_STAGING_SUPABASE_PROJECT_REF,
    readSupabaseDeploymentTier,
    readSupabaseLibraryApiKey,
    readSupabaseProjectUrl,
    readSupabaseServiceRoleKey,
    resolveBrowserSupabaseProjectSelection,
    resolveServerSupabaseProjectSelection,
    resolveSupabaseAuthStorageKey,
    resolveSupabaseLoginUrl,
    resolveSupabaseProjectSelection,
    resolveSupabaseStorageUploadUrl,
    SUPABASE_PROJECT_REF,
    SUPABASE_PROJECT_URL,
} from "./supabase-config.ts";

const STAGING_REF = PREVIEW_STAGING_SUPABASE_PROJECT_REF;
const stagingUrl = `https://${STAGING_REF}.supabase.co`;

function b64url(value) {
    return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function fakeLegacyJwt({ ref, role }) {
    const header = b64url({ alg: "HS256", typ: "JWT" });
    const payload = b64url({ ...(ref ? { ref } : {}), role, iss: "supabase" });
    return `${header}.${payload}.synthetic-signature`;
}

const stagingAnon = fakeLegacyJwt({ ref: STAGING_REF, role: "anon" });
const stagingService = fakeLegacyJwt({ ref: STAGING_REF, role: "service_role" });
const productionAnon = fakeLegacyJwt({ ref: SUPABASE_PROJECT_REF, role: "anon" });
const productionService = fakeLegacyJwt({ ref: SUPABASE_PROJECT_REF, role: "service_role" });
const anonMissingRef = fakeLegacyJwt({ ref: undefined, role: "anon" });

const previous = {
    vercelEnv: process.env.VERCEL_ENV,
    previewFlag: process.env.MDB_PREVIEW_SUPABASE_ENABLED,
    publicPreviewFlag: process.env.NEXT_PUBLIC_MDB_PREVIEW_SUPABASE_ENABLED,
    browserIdentity: process.env.NEXT_PUBLIC_MDB_SUPABASE_BROWSER_IDENTITY,
    localStaging: process.env.MDB_LOCAL_SUPABASE_STAGING,
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    anon: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    service: process.env.SUPABASE_SERVICE_ROLE_KEY,
};

function setEnv(overrides) {
    const env = {
        vercelEnv: undefined,
        previewFlag: undefined,
        publicPreviewFlag: undefined,
        browserIdentity: MDB_SUPABASE_BROWSER_IDENTITY_PRODUCTION,
        localStaging: undefined,
        url: undefined,
        anon: productionAnon,
        service: productionService,
        ...overrides,
    };
    if (env.vercelEnv === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = env.vercelEnv;
    if (env.previewFlag === undefined) delete process.env.MDB_PREVIEW_SUPABASE_ENABLED;
    else process.env.MDB_PREVIEW_SUPABASE_ENABLED = env.previewFlag;
    if (env.publicPreviewFlag === undefined) delete process.env.NEXT_PUBLIC_MDB_PREVIEW_SUPABASE_ENABLED;
    else process.env.NEXT_PUBLIC_MDB_PREVIEW_SUPABASE_ENABLED = env.publicPreviewFlag;
    if (env.browserIdentity === undefined) delete process.env.NEXT_PUBLIC_MDB_SUPABASE_BROWSER_IDENTITY;
    else process.env.NEXT_PUBLIC_MDB_SUPABASE_BROWSER_IDENTITY = env.browserIdentity;
    if (env.localStaging === undefined) delete process.env.MDB_LOCAL_SUPABASE_STAGING;
    else process.env.MDB_LOCAL_SUPABASE_STAGING = env.localStaging;
    if (env.url === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = env.url;
    if (env.anon === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = env.anon;
    if (env.service === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = env.service;
}

function assertClientBundleHasNoServiceRoleKey() {
    const root = join(dirname(fileURLToPath(import.meta.url)), "..");
    const clientTargets = ["lib/supabase-auth-client.ts", "lib/supabase-storage-upload.ts"];
    for (const rel of clientTargets) {
        const text = readFileSync(join(root, rel), "utf8");
        assert.match(text, /NEXT_PUBLIC_SUPABASE_ANON_KEY/);
        assert.doesNotMatch(text, /process\.env\.SUPABASE_SERVICE_ROLE_KEY/);
    }
}

try {
    // --- Server: production ---
    setEnv({ vercelEnv: "production", browserIdentity: MDB_SUPABASE_BROWSER_IDENTITY_PRODUCTION });
    assert.equal(readSupabaseDeploymentTier(), "production");
    assert.equal(resolveServerSupabaseProjectSelection().mode, "production");
    assert.equal(readSupabaseProjectUrl(), SUPABASE_PROJECT_URL);
    assert.equal(readSupabaseServiceRoleKey(), productionService);

    setEnv({
        vercelEnv: "production",
        previewFlag: "1",
        publicPreviewFlag: "1",
        url: stagingUrl,
        anon: stagingAnon,
        service: stagingService,
    });
    assert.throws(() => resolveServerSupabaseProjectSelection(), /cannot be set on production deployments/);

    setEnv({ vercelEnv: "production", previewFlag: "1", publicPreviewFlag: undefined });
    assert.throws(() => resolveServerSupabaseProjectSelection(), /cannot be set on production deployments/);

    // --- Server: preview staging ---
    setEnv({
        vercelEnv: "preview",
        previewFlag: "1",
        publicPreviewFlag: "1",
        browserIdentity: MDB_SUPABASE_BROWSER_IDENTITY_PREVIEW_STAGING,
        url: stagingUrl,
        anon: stagingAnon,
        service: stagingService,
    });
    assert.equal(resolveServerSupabaseProjectSelection().mode, "preview-staging");
    assert.equal(readSupabaseServiceRoleKey(), stagingService);

    setEnv({
        vercelEnv: "preview",
        previewFlag: "1",
        publicPreviewFlag: undefined,
        url: stagingUrl,
        anon: stagingAnon,
        service: stagingService,
    });
    assert.throws(() => resolveServerSupabaseProjectSelection(), /requires both MDB_PREVIEW_SUPABASE_ENABLED=1/);

    setEnv({
        vercelEnv: "development",
        previewFlag: "1",
        publicPreviewFlag: "1",
        url: stagingUrl,
        anon: stagingAnon,
        service: stagingService,
    });
    assert.throws(() => resolveServerSupabaseProjectSelection(), /authorized Preview or explicit local staging/);

    // --- Server: explicit local staging ---
    setEnv({
        vercelEnv: undefined,
        previewFlag: "1",
        publicPreviewFlag: "1",
        localStaging: "1",
        url: stagingUrl,
        anon: stagingAnon,
        service: stagingService,
    });
    assert.equal(resolveServerSupabaseProjectSelection().mode, "preview-staging");

  setEnv({
        vercelEnv: undefined,
        previewFlag: "1",
        publicPreviewFlag: "1",
        localStaging: undefined,
        url: stagingUrl,
        anon: stagingAnon,
        service: stagingService,
    });
    assert.throws(() => resolveServerSupabaseProjectSelection(), /authorized Preview or explicit local staging/);

    // --- JWT hardening ---
    setEnv({
        vercelEnv: "preview",
        previewFlag: "1",
        publicPreviewFlag: "1",
        url: stagingUrl,
        anon: anonMissingRef,
        service: stagingService,
    });
    assert.throws(() => resolveServerSupabaseProjectSelection(), /missing a Supabase project ref claim/);

    setEnv({
        vercelEnv: "preview",
        previewFlag: "1",
        publicPreviewFlag: "1",
        url: stagingUrl,
        anon: stagingAnon,
        service: productionService,
    });
    assert.throws(() => resolveServerSupabaseProjectSelection(), /SUPABASE_SERVICE_ROLE_KEY is for Supabase project/);

    setEnv({
        vercelEnv: "production",
        anon: productionAnon,
        service: "not-a-jwt",
    });
    assert.throws(() => readSupabaseServiceRoleKey(), /must be a legacy Supabase JWT API key/);

    // --- Browser: production identity ---
    setEnv({
        vercelEnv: undefined,
        browserIdentity: MDB_SUPABASE_BROWSER_IDENTITY_PRODUCTION,
        url: undefined,
        anon: productionAnon,
    });
    assert.equal(resolveBrowserSupabaseProjectSelection().mode, "production");

    setEnv({
        browserIdentity: MDB_SUPABASE_BROWSER_IDENTITY_PRODUCTION,
        publicPreviewFlag: "1",
        url: stagingUrl,
        anon: stagingAnon,
    });
    assert.throws(() => resolveBrowserSupabaseProjectSelection(), /Production browser identity rejects/);

    setEnv({
        browserIdentity: MDB_SUPABASE_BROWSER_IDENTITY_PRODUCTION,
        url: stagingUrl,
        anon: stagingAnon,
    });
    assert.throws(() => resolveBrowserSupabaseProjectSelection(), /Production browser identity:/);

    // --- Browser: preview staging build-time identity ---
    setEnv({
        browserIdentity: MDB_SUPABASE_BROWSER_IDENTITY_PREVIEW_STAGING,
        publicPreviewFlag: "1",
        url: stagingUrl,
        anon: stagingAnon,
    });
    assert.equal(resolveBrowserSupabaseProjectSelection().mode, "preview-staging");
    assert.equal(resolveBrowserSupabaseProjectSelection().projectRef, STAGING_REF);

    setEnv({
        browserIdentity: MDB_SUPABASE_BROWSER_IDENTITY_PREVIEW_STAGING,
        publicPreviewFlag: undefined,
        url: stagingUrl,
        anon: stagingAnon,
    });
    assert.throws(() => resolveBrowserSupabaseProjectSelection(), /browser identity requires NEXT_PUBLIC_MDB_PREVIEW_SUPABASE_ENABLED=1/);

    setEnv({
        browserIdentity: MDB_SUPABASE_BROWSER_IDENTITY_PREVIEW_STAGING,
        publicPreviewFlag: "1",
        url: stagingUrl,
        anon: productionAnon,
    });
    assert.throws(() => resolveBrowserSupabaseProjectSelection(), /NEXT_PUBLIC_SUPABASE_ANON_KEY is for Supabase project/);

    // --- Auth / storage / queue consistency (server preview path) ---
    setEnv({
        vercelEnv: "preview",
        previewFlag: "1",
        publicPreviewFlag: "1",
        browserIdentity: MDB_SUPABASE_BROWSER_IDENTITY_PREVIEW_STAGING,
        url: stagingUrl,
        anon: stagingAnon,
        service: stagingService,
    });
    const authUrl = resolveSupabaseLoginUrl();
    assert.equal(authUrl, stagingUrl);
    assert.equal(resolveSupabaseAuthStorageKey(), `sb-${STAGING_REF}-auth-token`);
    assert.equal(resolveSupabaseStorageUploadUrl(), `https://${STAGING_REF}.storage.supabase.co`);
    assert.equal(readSupabaseLibraryApiKey(), stagingService);

    // Default server path uses production when unconfigured
    setEnv({
        vercelEnv: undefined,
        browserIdentity: undefined,
        previewFlag: undefined,
        publicPreviewFlag: undefined,
        url: undefined,
    });
    assert.equal(resolveServerSupabaseProjectSelection().mode, "production");
    assert.equal(resolveSupabaseProjectSelection().mode, "production");

    assertClientBundleHasNoServiceRoleKey();
}
finally {
    setEnv(previous);
    if (previous.vercelEnv === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = previous.vercelEnv;
    if (previous.previewFlag === undefined) delete process.env.MDB_PREVIEW_SUPABASE_ENABLED;
    else process.env.MDB_PREVIEW_SUPABASE_ENABLED = previous.previewFlag;
    if (previous.publicPreviewFlag === undefined) delete process.env.NEXT_PUBLIC_MDB_PREVIEW_SUPABASE_ENABLED;
    else process.env.NEXT_PUBLIC_MDB_PREVIEW_SUPABASE_ENABLED = previous.publicPreviewFlag;
    if (previous.browserIdentity === undefined) delete process.env.NEXT_PUBLIC_MDB_SUPABASE_BROWSER_IDENTITY;
    else process.env.NEXT_PUBLIC_MDB_SUPABASE_BROWSER_IDENTITY = previous.browserIdentity;
    if (previous.localStaging === undefined) delete process.env.MDB_LOCAL_SUPABASE_STAGING;
    else process.env.MDB_LOCAL_SUPABASE_STAGING = previous.localStaging;
    if (previous.url === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = previous.url;
    if (previous.anon === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = previous.anon;
    if (previous.service === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previous.service;
}

console.log("supabase-preview-staging tests passed.");