import { createClient } from "@supabase/supabase-js";
import { createSupabaseAuthStorage } from "./supabase-auth-storage";

/** Fixed Supabase project URL for browser login only. */
export const supabaseLoginUrl = "https://aehuszoadgqtbkxsliyy.supabase.co";

const BROWSER_CLIENT_KEY = "__mdb_browser_supabase_client__";

const anonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim().replace(/^["']|["']$/g, "");
if (!anonKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY is missing.");
}

function createBrowserSupabaseClient() {
    return createClient(supabaseLoginUrl, anonKey, {
        auth: {
            storage: createSupabaseAuthStorage(),
            persistSession: true,
            autoRefreshToken: false,
            detectSessionInUrl: true,
        },
    });
}

function getBrowserSupabaseClient() {
    if (!globalThis[BROWSER_CLIENT_KEY]) {
        globalThis[BROWSER_CLIENT_KEY] = createBrowserSupabaseClient();
    }
    return globalThis[BROWSER_CLIENT_KEY];
}

/** Single browser auth client. Survives HMR without creating duplicate GoTrue instances. */
export const supabase = typeof window !== "undefined"
    ? getBrowserSupabaseClient()
    : createClient(supabaseLoginUrl, anonKey, {
        auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
        },
    });
