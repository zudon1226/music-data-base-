import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveSupabaseLoginUrl } from "./supabase-config";
import {
    createDesktopSupabaseAuthClient,
    createDesktopSupabaseServerStubClient,
} from "./supabase-auth-client";

/** DESKTOP ONLY — shared browser auth client (NEXT_PUBLIC_SUPABASE_URL + anon key). */
export const supabaseLoginUrl = resolveSupabaseLoginUrl();

const BROWSER_CLIENT_KEY = "__mdb_browser_supabase_client__";

type BrowserClientGlobal = typeof globalThis & {
    [BROWSER_CLIENT_KEY]?: SupabaseClient;
};

function getBrowserSupabaseClient() {
    const scope = globalThis as BrowserClientGlobal;
    if (!scope[BROWSER_CLIENT_KEY]) {
        scope[BROWSER_CLIENT_KEY] = createDesktopSupabaseAuthClient();
    }
    return scope[BROWSER_CLIENT_KEY];
}

export const supabase = typeof window !== "undefined"
    ? getBrowserSupabaseClient()
    : createDesktopSupabaseServerStubClient();
