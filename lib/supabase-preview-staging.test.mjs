/**
 * Preview staging Supabase selection (synthetic JWTs only).
 * Run: npx tsx lib/supabase-preview-staging.test.mjs
 */
import assert from "node:assert/strict";
import { resolveSupabaseAuthStorageKey, SUPABASE_AUTH_STORAGE_KEY } from "./auth-session.ts";
import { readDesktopSupabaseAuthConfig } from "./supabase-auth-client.ts";
import { getSupabaseStorageUploadUrl } from "./supabase-storage-upload.ts";
import {
    describeSupabaseRuntimeIdentity,
    readSupabaseDeploymentTier,
    readSupabaseLibraryApiKey,
    readSupabaseProjectUrl,
    resolveSupabaseProjectSelection,
    SUPABASE_PROJECT_REF,
    SUPABASE_PROJECT_URL,
} from "./supabase-config.ts";

const STAGING_REF = "stagingref123456789012";

function b64url(value) {
    return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function fakeLegacyJwt({ ref, role }) {
    const header = b64url({ alg: "HS256", typ: "JWT" });
    const payload = b64url({ ref, role, iss: "supabase" });
    return `${header}.${payload}.synthetic-signature`;
}

const stagingUrl = `https://${STAGING_REF}.supabase.co`;
const stagingAnon = fakeLegacyJwt({ ref: STAGING_REF, role: "anon" });
const stagingService = fakeLegacyJwt({ ref: STAGING_REF, role: "service_role" });
const productionAnon = fakeLegacyJwt({ ref: SUPABASE_PROJECT_REF, role: "anon" });
const productionService = fakeLegacyJwt({ ref: SUPABASE_PROJECT_REF, role: "service_role" });
const mismatchedAnon = fakeLegacyJwt({ ref: "otherstagingref000000000000", role: "anon" });

const previous = {
    vercelEnv: process.env.VERCEL_ENV,
    previewFlag: process.env.MDB_PREVIEW_SUPABASE_ENABLED,
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    anon: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    service: process.env.SUPABASE_SERVICE_ROLE_KEY,
    isolated: process.env.MDB_ISOLATED_SUPABASE_E2E,
};

function setEnv(overrides) {
    const env = {
        vercelEnv: undefined,
        previewFlag: undefined,
        url: undefined,
        anon: productionAnon,
        service: productionService,
        isolated: undefined,
        ...overrides,
    };
    if (env.vercelEnv === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = env.vercelEnv;
    if (env.previewFlag === undefined) delete process.env.MDB_PREVIEW_SUPABASE_ENABLED;
    else process.env.MDB_PREVIEW_SUPABASE_ENABLED = env.previewFlag;
    if (env.url === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = env.url;
    if (env.anon === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = env.anon;
    if (env.service === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = env.service;
    if (env.isolated === undefined) delete process.env.MDB_ISOLATED_SUPABASE_E2E;
    else process.env.MDB_ISOLATED_SUPABASE_E2E = env.isolated;
}

try {
    setEnv({ vercelEnv: "production", url: undefined, anon: productionAnon });
    assert.equal(readSupabaseDeploymentTier(), "production");
    assert.equal(resolveSupabaseProjectSelection().mode, "production");
    assert.equal(readSupabaseProjectUrl(), SUPABASE_PROJECT_URL);
    assert.equal(resolveSupabaseAuthStorageKey(), `sb-${SUPABASE_PROJECT_REF}-auth-token`);
    assert.equal(resolveSupabaseAuthStorageKey(), SUPABASE_AUTH_STORAGE_KEY);
    assert.equal(getSupabaseStorageUploadUrl(), `https://${SUPABASE_PROJECT_REF}.storage.supabase.co`);

    setEnv({
        vercelEnv: "preview",
        previewFlag: "1",
        url: stagingUrl,
        anon: stagingAnon,
        service: stagingService,
    });
    const stagingSelection = resolveSupabaseProjectSelection();
    assert.equal(stagingSelection.mode, "preview-staging");
    assert.equal(stagingSelection.projectRef, STAGING_REF);
    assert.equal(readSupabaseProjectUrl(), stagingUrl);
    assert.equal(resolveSupabaseAuthStorageKey(), `sb-${STAGING_REF}-auth-token`);
    assert.equal(getSupabaseStorageUploadUrl(), `https://${STAGING_REF}.storage.supabase.co`);
    assert.equal(describeSupabaseRuntimeIdentity().projectRef, STAGING_REF);

    setEnv({
        vercelEnv: "preview",
        previewFlag: "1",
        url: stagingUrl,
        anon: mismatchedAnon,
        service: stagingService,
    });
    assert.throws(() => resolveSupabaseProjectSelection(), /NEXT_PUBLIC_SUPABASE_ANON_KEY is for Supabase project/);

    setEnv({
        vercelEnv: "preview",
        previewFlag: undefined,
        url: stagingUrl,
        anon: stagingAnon,
        service: stagingService,
    });
    assert.throws(() => resolveSupabaseProjectSelection(), /MDB_PREVIEW_SUPABASE_ENABLED=1/);

    setEnv({
        vercelEnv: "preview",
        previewFlag: "1",
        url: undefined,
        anon: stagingAnon,
        service: stagingService,
    });
    assert.throws(() => resolveSupabaseProjectSelection(), /Preview staging requires NEXT_PUBLIC_SUPABASE_URL/);

    setEnv({
        vercelEnv: "production",
        previewFlag: "1",
        url: stagingUrl,
        anon: stagingAnon,
        service: stagingService,
    });
    assert.throws(() => resolveSupabaseProjectSelection(), /cannot be set on production deployments/);

    setEnv({
        vercelEnv: "production",
        previewFlag: undefined,
        url: stagingUrl,
        anon: productionAnon,
        service: productionService,
    });
    assert.throws(() => resolveSupabaseProjectSelection(), /Production deployment: NEXT_PUBLIC_SUPABASE_URL/);

    setEnv({ vercelEnv: "preview", previewFlag: undefined, url: undefined, anon: undefined, service: undefined });
    assert.equal(readSupabaseProjectUrl(), SUPABASE_PROJECT_URL);

    setEnv({
        vercelEnv: "preview",
        previewFlag: "1",
        url: SUPABASE_PROJECT_URL,
        anon: productionAnon,
        service: productionService,
    });
    assert.throws(() => resolveSupabaseProjectSelection(), /must use a non-production Supabase project/);

    setEnv({
        vercelEnv: "preview",
        previewFlag: "1",
        url: stagingUrl,
        anon: stagingAnon,
        service: undefined,
    });
    assert.throws(() => resolveSupabaseProjectSelection(), /Preview staging requires SUPABASE_SERVICE_ROLE_KEY/);

    setEnv({
        vercelEnv: "preview",
        previewFlag: "1",
        url: stagingUrl,
        anon: stagingAnon,
        service: stagingService,
    });
    const desktopAuth = readDesktopSupabaseAuthConfig();
    assert.equal(desktopAuth.supabaseUrl, stagingUrl);
    assert.equal(desktopAuth.projectUrl, stagingUrl);
    assert.equal(readSupabaseLibraryApiKey(), stagingService);

    setEnv({
        vercelEnv: "production",
        previewFlag: "1",
        url: undefined,
        anon: productionAnon,
        service: productionService,
    });
    assert.throws(() => resolveSupabaseProjectSelection(), /cannot be set on production deployments/);
}
finally {
    setEnv(previous);
    if (previous.vercelEnv === undefined) delete process.env.VERCEL_ENV;
    if (previous.previewFlag === undefined) delete process.env.MDB_PREVIEW_SUPABASE_ENABLED;
    if (previous.url === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = previous.url;
    if (previous.anon === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = previous.anon;
    if (previous.service === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previous.service;
    if (previous.isolated === undefined) delete process.env.MDB_ISOLATED_SUPABASE_E2E;
    else process.env.MDB_ISOLATED_SUPABASE_E2E = previous.isolated;
}

console.log("supabase-preview-staging tests passed.");
