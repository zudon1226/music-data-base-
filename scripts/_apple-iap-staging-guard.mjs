/** Fail-closed guards for Apple IAP staging migration/seed (never production). */

import { PRODUCTION_SUPABASE_REF } from "./_staging-support-admin-guard.mjs";

export const STAGING_SUPABASE_REF = "jzlegcbotqfzevtczwhx";

export function parseEnabledFlag(value) {
    const normalized = String(value || "").trim().toLowerCase();
    return normalized === "1" || normalized === "true" || normalized === "yes";
}

export function assertAppleIapStagingApplyAllowed(env = process.env) {
    if (!parseEnabledFlag(env.MDB_APPLE_IAP_STAGING_APPLY)) {
        return {
            ok: false,
            code: "STAGING_APPLY_DISABLED",
            message: "Set MDB_APPLE_IAP_STAGING_APPLY=1 to apply Apple IAP migrations to staging only.",
        };
    }

    const confirmedRef = String(env.MDB_STAGING_PROJECT_REF || STAGING_SUPABASE_REF).trim();
    if (confirmedRef === PRODUCTION_SUPABASE_REF) {
        return {
            ok: false,
            code: "PRODUCTION_SUPABASE_REF_BLOCKED",
            message: "MDB_STAGING_PROJECT_REF must not equal the production Supabase project ref.",
        };
    }
    if (confirmedRef !== STAGING_SUPABASE_REF) {
        return {
            ok: false,
            code: "STAGING_REF_MISMATCH",
            message: `Expected staging ref ${STAGING_SUPABASE_REF}; got ${confirmedRef}.`,
        };
    }

    const supabaseUrl = String(env.STAGING_SUPABASE_URL || "").trim().replace(/\/+$/, "");
    if (!supabaseUrl || !supabaseUrl.includes(confirmedRef)) {
        return {
            ok: false,
            code: "MISSING_STAGING_SUPABASE_URL",
            message: "Set STAGING_SUPABASE_URL to the staging project URL including the confirmed ref.",
        };
    }
    if (supabaseUrl.includes(PRODUCTION_SUPABASE_REF)) {
        return {
            ok: false,
            code: "PRODUCTION_SUPABASE_URL_BLOCKED",
            message: "STAGING_SUPABASE_URL must not reference production.",
        };
    }

    const databaseUrl = String(env.STAGING_DATABASE_URL || env.STAGING_SUPABASE_DB_URL || "").trim();
    if (!databaseUrl) {
        return {
            ok: false,
            code: "MISSING_STAGING_DATABASE_URL",
            message: "Set STAGING_DATABASE_URL (direct Postgres) for staging migration apply.",
        };
    }
    if (databaseUrl.includes(PRODUCTION_SUPABASE_REF)) {
        return {
            ok: false,
            code: "PRODUCTION_DATABASE_URL_BLOCKED",
            message: "STAGING_DATABASE_URL must not reference production.",
        };
    }

    return { ok: true, confirmedRef, supabaseUrl, databaseUrl };
}
