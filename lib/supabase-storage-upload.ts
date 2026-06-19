import { createClient } from "@supabase/supabase-js";
import { SUPABASE_PROJECT_REF, SUPABASE_PROJECT_URL } from "./supabase-config";

function readStorageAnonKey() {
    return (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim().replace(/^["']|["']$/g, "");
}

function decodeJwtPayload(key: string) {
    try {
        const payload = key.split(".")[1];
        if (!payload) {
            return null;
        }
        const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
        const jsonStr = atob(normalized);
        return JSON.parse(jsonStr) as { iss?: string; ref?: string; role?: string };
    }
    catch {
        return null;
    }
}

/** Storage hostname client URL (browser direct upload). */
export function getSupabaseStorageUploadUrl() {
    return `https://${SUPABASE_PROJECT_REF}.storage.supabase.co`;
}

export function describeStorageUploadAuth() {
    const anonKey = readStorageAnonKey();
    const storageUploadUrl = getSupabaseStorageUploadUrl();
    const jwtPayload = decodeJwtPayload(anonKey);
    return {
        supabaseUrl: SUPABASE_PROJECT_URL,
        storageUploadUrl,
        keySource: "NEXT_PUBLIC_SUPABASE_ANON_KEY",
        serviceRoleKeyUsed: false,
        keyFormat: anonKey.startsWith("eyJ")
            ? "legacy-jwt"
            : anonKey.startsWith("sb_publishable_")
              ? "sb_publishable"
              : anonKey
                ? "other"
                : "missing",
        jwtPayload,
        authorizationHeaderSent: false,
    };
}

/**
 * Browser Storage upload client for signed uploads.
 * Uses anon key only — signed upload token is passed to uploadToSignedUrl().
 */
export function createSupabaseStorageUploadClient() {
    const anonKey = readStorageAnonKey();
    if (!anonKey) {
        throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY is missing.");
    }
    if (!anonKey.startsWith("eyJ")) {
        throw new Error(
            "Storage uploads require the legacy anon JWT in NEXT_PUBLIC_SUPABASE_ANON_KEY (eyJ...). sb_publishable keys are not valid for Storage apikey.",
        );
    }
    const storageUrl = getSupabaseStorageUploadUrl();
    return createClient(storageUrl, anonKey, {
        auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
        },
    });
}
