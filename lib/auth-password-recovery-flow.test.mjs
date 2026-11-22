/**
 * Password recovery redirect + Production Auth recover endpoint contract.
 * Run: node lib/auth-password-recovery-flow.test.mjs
 */
import assert from "node:assert/strict";
import {
    isAllowedPasswordRecoveryRedirect,
    resolvePasswordRecoveryRedirectUrl,
    submitPasswordRecoveryRequest,
    SUPABASE_PASSWORD_RECOVERY_REDIRECT_ALLOWLIST,
} from "./auth-password-recovery-flow.ts";
import {
    MDB_SUPABASE_BROWSER_IDENTITY_PRODUCTION,
    resolveSupabaseLoginUrl,
    SUPABASE_PROJECT_REF,
    SUPABASE_PROJECT_URL,
} from "./supabase-config.ts";

function b64url(value) {
    return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function fakeLegacyJwt({ ref, role }) {
    const header = b64url({ alg: "HS256", typ: "JWT" });
    const payload = b64url({ ...(ref ? { ref } : {}), role, iss: "supabase" });
    return `${header}.${payload}.synthetic-signature`;
}

const productionAnon = fakeLegacyJwt({ ref: SUPABASE_PROJECT_REF, role: "anon" });

const previous = {
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL,
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    anon: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    browserIdentity: process.env.NEXT_PUBLIC_MDB_SUPABASE_BROWSER_IDENTITY,
    vercelEnv: process.env.VERCEL_ENV,
};

function restoreEnv() {
    for (const [key, value] of Object.entries(previous)) {
        const envName = {
            siteUrl: "NEXT_PUBLIC_SITE_URL",
            url: "NEXT_PUBLIC_SUPABASE_URL",
            anon: "NEXT_PUBLIC_SUPABASE_ANON_KEY",
            browserIdentity: "NEXT_PUBLIC_MDB_SUPABASE_BROWSER_IDENTITY",
            vercelEnv: "VERCEL_ENV",
        }[key];
        if (value === undefined) delete process.env[envName];
        else process.env[envName] = value;
    }
}

function setProductionBrowserEnv() {
    process.env.VERCEL_ENV = "production";
    process.env.NEXT_PUBLIC_MDB_SUPABASE_BROWSER_IDENTITY = MDB_SUPABASE_BROWSER_IDENTITY_PRODUCTION;
    process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_PROJECT_URL;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = productionAnon;
    process.env.NEXT_PUBLIC_SITE_URL = "https://digitalmusicdatabase.com";
}

try {
    setProductionBrowserEnv();

    // --- Redirect: www vs apex (configured apex must not override live www origin) ---
    assert.equal(
        resolvePasswordRecoveryRedirectUrl({
            browserOrigin: "https://www.digitalmusicdatabase.com",
            configuredSiteUrl: "https://digitalmusicdatabase.com",
        }),
        "https://www.digitalmusicdatabase.com",
    );

    assert.equal(
        resolvePasswordRecoveryRedirectUrl({
            browserOrigin: "https://digitalmusicdatabase.com",
            configuredSiteUrl: "https://digitalmusicdatabase.com",
        }),
        "https://digitalmusicdatabase.com",
    );

    assert.equal(
        resolvePasswordRecoveryRedirectUrl({
            browserOrigin: "http://localhost:3003",
            configuredSiteUrl: "https://digitalmusicdatabase.com",
        }),
        "https://digitalmusicdatabase.com",
    );

    for (const allowed of SUPABASE_PASSWORD_RECOVERY_REDIRECT_ALLOWLIST) {
        assert.equal(isAllowedPasswordRecoveryRedirect(allowed), true, allowed);
        assert.equal(isAllowedPasswordRecoveryRedirect(`${allowed}/`), true, `${allowed}/`);
    }
    assert.equal(isAllowedPasswordRecoveryRedirect("https://evil.example"), false);

    const wwwRedirect = resolvePasswordRecoveryRedirectUrl({
        browserOrigin: "https://www.digitalmusicdatabase.com",
        configuredSiteUrl: "https://digitalmusicdatabase.com",
    });
    assert.equal(isAllowedPasswordRecoveryRedirect(wwwRedirect), true);

    // --- resetPasswordForEmail uses GoTrue POST /auth/v1/recover on the locked project host ---
    const recoverEndpoint = `${resolveSupabaseLoginUrl().replace(/\/+$/, "")}/auth/v1/recover`;
    assert.equal(recoverEndpoint, `${SUPABASE_PROJECT_URL}/auth/v1/recover`);
    assert.match(recoverEndpoint, /aehuszoadgqtbkxsliyy\.supabase\.co\/auth\/v1\/recover$/);

    // --- Handler invokes resetPasswordForEmail with allowlisted redirect (no network) ---
    const calls = [];
    const mockSupabase = {
        auth: {
            resetPasswordForEmail(email, options) {
                calls.push({ email, redirectTo: options?.redirectTo });
                return Promise.resolve({ data: {}, error: null });
            },
        },
    };

    await submitPasswordRecoveryRequest(mockSupabase, "  user@example.com  ", {
        browserOrigin: "https://www.digitalmusicdatabase.com",
        configuredSiteUrl: "https://digitalmusicdatabase.com",
    });

    assert.equal(calls.length, 1);
    assert.equal(calls[0].email, "user@example.com");
    assert.equal(calls[0].redirectTo, "https://www.digitalmusicdatabase.com");
    assert.equal(isAllowedPasswordRecoveryRedirect(calls[0].redirectTo), true);

    console.log("auth-password-recovery-flow.test.mjs: PASS");
}
finally {
    restoreEnv();
}