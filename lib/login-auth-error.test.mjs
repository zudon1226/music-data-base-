import assert from "node:assert/strict";
import { resolveSignInClientErrorMessage } from "./login-auth-error.ts";
import {
    resolveSupabaseProjectSelection,
    SUPABASE_PROJECT_REF,
} from "./supabase-config.ts";

function fakeLegacyJwt(ref) {
    const b64 = (v) => Buffer.from(JSON.stringify(v)).toString("base64url");
    return `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ ref, role: "anon", iss: "supabase" })}.sig`;
}

const productionAnon = fakeLegacyJwt(SUPABASE_PROJECT_REF);
const stagingRef = "jzlegcbotqfzevtczwhx";
const stagingAnon = fakeLegacyJwt(stagingRef);

const prev = {
    vercelEnv: process.env.VERCEL_ENV,
    stagingFlag: process.env.NEXT_PUBLIC_MDB_PREVIEW_SUPABASE_ENABLED,
    pwaProdFlag: process.env.NEXT_PUBLIC_MDB_PREVIEW_PWA_USE_PRODUCTION_SUPABASE,
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    anon: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    service: process.env.SUPABASE_SERVICE_ROLE_KEY,
};

function restore() {
    for (const [key, val] of Object.entries({
        VERCEL_ENV: prev.vercelEnv,
        NEXT_PUBLIC_MDB_PREVIEW_SUPABASE_ENABLED: prev.stagingFlag,
        NEXT_PUBLIC_MDB_PREVIEW_PWA_USE_PRODUCTION_SUPABASE: prev.pwaProdFlag,
        NEXT_PUBLIC_SUPABASE_URL: prev.url,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: prev.anon,
        SUPABASE_SERVICE_ROLE_KEY: prev.service,
    })) {
        if (val === undefined) delete process.env[key];
        else process.env[key] = val;
    }
}

try {
    process.env.VERCEL_ENV = "preview";
    process.env.NEXT_PUBLIC_MDB_PREVIEW_SUPABASE_ENABLED = "1";
    process.env.NEXT_PUBLIC_SUPABASE_URL = `https://${stagingRef}.supabase.co`;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = stagingAnon;
    process.env.SUPABASE_SERVICE_ROLE_KEY = fakeLegacyJwt(stagingRef);
    assert.equal(resolveSupabaseProjectSelection().mode, "preview-staging");
    const mapped = resolveSignInClientErrorMessage({ message: "Invalid login credentials" });
    assert.match(mapped, /staging database/i);

    process.env.NEXT_PUBLIC_MDB_PREVIEW_SUPABASE_ENABLED = "0";
    delete process.env.MDB_PREVIEW_SUPABASE_ENABLED;
    process.env.NEXT_PUBLIC_MDB_PREVIEW_PWA_USE_PRODUCTION_SUPABASE = "1";
    process.env.MDB_PREVIEW_PWA_USE_PRODUCTION_SUPABASE = "1";
    process.env.NEXT_PUBLIC_SUPABASE_URL = `https://${SUPABASE_PROJECT_REF}.supabase.co`;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = productionAnon;
    process.env.SUPABASE_SERVICE_ROLE_KEY = fakeLegacyJwt(SUPABASE_PROJECT_REF);
    assert.equal(resolveSupabaseProjectSelection().mode, "production");

    const plain = resolveSignInClientErrorMessage({ message: "Invalid login credentials" });
    assert.equal(plain, "Invalid login credentials");

    console.log("login-auth-error.test.mjs passed.");
}
finally {
    restore();
}
