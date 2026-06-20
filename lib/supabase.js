import { createClient } from "@supabase/supabase-js";
import { installAuthStorageWriteTracer } from "./auth-storage-trace";

installAuthStorageWriteTracer();

/** Fixed Supabase project URL for browser login only. */
export const supabaseLoginUrl = "https://aehuszoadgqtbkxsliyy.supabase.co";

const anonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim().replace(/^["']|["']$/g, "");
if (!anonKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY is missing.");
}

export const supabase = createClient(supabaseLoginUrl, anonKey, {
    auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
    },
});
