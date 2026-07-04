/** DESKTOP ONLY — signed storage upload via fetch (no second Supabase/GoTrue client). */

import { resolveSupabaseLoginUrl, SUPABASE_PROJECT_REF } from "./supabase-config";

function readBrowserSupabaseAnonKey() {
    return (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "")
        .trim()
        .replace(/^["']|["']$/g, "")
        .replace(/\s+/g, "");
}

/** Storage hostname client URL (browser direct upload). */
export function getSupabaseStorageUploadUrl() {
    return `https://${SUPABASE_PROJECT_REF}.storage.supabase.co`;
}

export function describeStorageUploadAuth() {
    const anonKey = readBrowserSupabaseAnonKey();
    const storageUploadUrl = getSupabaseStorageUploadUrl();
    const supabaseUrl = typeof window === "undefined" ? "" : resolveSupabaseLoginUrl();
    return {
        supabaseUrl,
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
        jwtPayload: null,
        authorizationHeaderSent: false,
        sharedAuthClient: true,
    };
}

/** Matches server getPublicVideoUrl() / Supabase getPublicUrl output. */
export function buildVideoPublicStorageUrl(storagePath: string) {
    const cleanPath = storagePath.trim().replace(/^\/+/, "").replace(/^videos\/+/i, "");
    if (!cleanPath) {
        return "";
    }
    const projectUrl = resolveSupabaseLoginUrl().replace(/\/+$/, "");
    return `${projectUrl}/storage/v1/object/public/videos/${cleanPath}`;
}

export type SignedStorageUploadResult = {
    path: string;
};

/**
 * Upload a file to a signed Supabase Storage URL without creating a Supabase client.
 * Uses the signedUrl + token returned by /api/video-upload prepare.
 */
export async function uploadFileToSignedSupabaseStorage(
    signedUrl: string,
    token: string,
    file: File,
    contentType: string,
): Promise<SignedStorageUploadResult> {
    const anonKey = readBrowserSupabaseAnonKey();
    if (!anonKey) {
        throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY is missing.");
    }
    if (!signedUrl || !token) {
        throw new Error("Signed storage upload is missing signedUrl or token.");
    }

    const uploadUrl = new URL(signedUrl);
    uploadUrl.searchParams.set("token", token);

    const response = await fetch(uploadUrl.toString(), {
        method: "PUT",
        headers: {
            apikey: anonKey,
            Authorization: `Bearer ${token}`,
            "Content-Type": contentType || file.type || "application/octet-stream",
            "x-upsert": "false",
        },
        body: file,
        cache: "no-store",
    });

    if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        throw new Error(errorText || `Signed storage upload failed with HTTP ${response.status}.`);
    }

    const pathMatch = uploadUrl.pathname.match(/\/object\/upload\/sign\/videos\/(.+)$/i)
        || uploadUrl.pathname.match(/\/videos\/(.+)$/i);
    return {
        path: pathMatch?.[1] ? decodeURIComponent(pathMatch[1]) : file.name,
    };
}

/** @deprecated Use uploadFileToSignedSupabaseStorage — avoids duplicate GoTrueClient. */
export function createSupabaseStorageUploadClient(): never {
    throw new Error("createSupabaseStorageUploadClient is removed. Use uploadFileToSignedSupabaseStorage instead.");
}
