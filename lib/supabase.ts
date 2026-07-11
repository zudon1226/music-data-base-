/** DESKTOP ONLY — one shared browser Supabase client for the entire app. */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
    createDesktopSupabaseAuthClient,
    createDesktopSupabaseServerStubClient,
} from "./supabase-auth-client";

const DESKTOP_SUPABASE_CLIENT_KEY = "__mdb_desktop_supabase_client__";

type DesktopSupabaseClientGlobal = typeof globalThis & {
    [DESKTOP_SUPABASE_CLIENT_KEY]?: SupabaseClient;
};

/**
 * Returns the single desktop Supabase auth client.
 * Browser: one GoTrueClient on globalThis. Server: ephemeral stub per call.
 * Auth traffic always uses the locked *.supabase.co project URL from createDesktopSupabaseAuthClient.
 */
export function getDesktopSupabaseClient(): SupabaseClient {
    if (typeof window === "undefined") {
        return createDesktopSupabaseServerStubClient();
    }

    const scope = globalThis as DesktopSupabaseClientGlobal;
    if (!scope[DESKTOP_SUPABASE_CLIENT_KEY]) {
        scope[DESKTOP_SUPABASE_CLIENT_KEY] = createDesktopSupabaseAuthClient();
    }
    return scope[DESKTOP_SUPABASE_CLIENT_KEY];
}

/** Lazy singleton — every property access resolves to the shared client. */
export const supabase: SupabaseClient = typeof window === "undefined"
    ? createDesktopSupabaseServerStubClient()
    : new Proxy({} as SupabaseClient, {
        get(_target, prop) {
            const client = getDesktopSupabaseClient();
            const value = Reflect.get(client, prop, client) as unknown;
            return typeof value === "function"
                ? (value as (...args: unknown[]) => unknown).bind(client)
                : value;
        },
    });

export { resolveSupabaseLoginUrl as supabaseLoginUrl } from "./supabase-config";
