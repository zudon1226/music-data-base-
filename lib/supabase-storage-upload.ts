import { createClient } from "@supabase/supabase-js";
import { readSupabaseAnonKey, readSupabaseProjectUrl } from "./supabase-config";

export function getSupabaseStorageUploadUrl(supabaseUrl: string) {
    const projectRef = getSupabaseProjectRef(supabaseUrl);
    return `https://${projectRef}.storage.supabase.co`;
}

function getSupabaseProjectRef(supabaseUrl: string) {
    return new URL(supabaseUrl).hostname.split(".")[0];
}

export function createSupabaseStorageUploadClient(accessToken: string) {
    const supabaseUrl = readSupabaseProjectUrl();
    const anonKey = readSupabaseAnonKey();
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
