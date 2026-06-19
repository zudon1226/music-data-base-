import { createClient } from "@supabase/supabase-js";

function getSupabaseProjectRef(supabaseUrl: string) {
    return new URL(supabaseUrl).hostname.split(".")[0];
}

export function getSupabaseStorageUploadUrl(supabaseUrl: string) {
    const projectRef = getSupabaseProjectRef(supabaseUrl);
    return `https://${projectRef}.storage.supabase.co`;
}

export function createSupabaseStorageUploadClient(accessToken: string) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || "";
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || "";
    if (!supabaseUrl || !anonKey) {
        throw new Error("Supabase storage upload client is not configured.");
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
