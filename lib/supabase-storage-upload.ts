import { createClient } from "@supabase/supabase-js";
import { readSupabaseProjectUrl } from "./supabase-config";

function readStorageAnonKey() {
    return (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim().replace(/^["']|["']$/g, "");
}

export function getSupabaseStorageUploadUrl(supabaseUrl: string) {
    const projectRef = getSupabaseProjectRef(supabaseUrl);
    return `https://${projectRef}.storage.supabase.co`;
}

function getSupabaseProjectRef(supabaseUrl: string) {
    return new URL(supabaseUrl).hostname.split(".")[0];
}

export function createSupabaseStorageUploadClient(accessToken: string) {
    const supabaseUrl = readSupabaseProjectUrl();
    const anonKey = readStorageAnonKey();
    if (!anonKey) {
        throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY is missing.");
    }
    const storageUrl = getSupabaseStorageUploadUrl(supabaseUrl);
    return createClient(storageUrl, anonKey, {
        auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
        },
        global: {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                apikey: anonKey,
            },
        },
    });
}
