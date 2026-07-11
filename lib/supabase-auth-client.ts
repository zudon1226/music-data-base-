/**
 * DESKTOP ONLY — single browser Supabase auth client.
 *
 * Auth requests go directly to the locked Supabase project host.
 * No custom fetch wrappers. No duplicate GoTrue clients.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
    resolveSupabaseLoginUrl,
    SUPABASE_PROJECT_URL,
} from "./supabase-config";
import { createSupabaseAuthStorage } from "./supabase-auth-storage";

const DESKTOP_BROWSER_CLIENT_KEY = "__mdb_desktop_supabase_client__";

type DesktopBrowserClientGlobal = typeof globalThis & {
    [DESKTOP_BROWSER_CLIENT_KEY]?: SupabaseClient;
};

function readBrowserSupabaseAnonKey() {
    const anonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "")
        .trim()
        .replace(/^["']|["']$/g, "")
        .replace(/\s+/g, "");
    if (!anonKey) {
        throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY is missing.");
    }
    return anonKey;
}

function assertDirectSupabaseAuthUrl(supabaseUrl: string) {
    let parsed: URL;
    try {
        parsed = new URL(supabaseUrl);
    }
    catch {
        throw new Error(`Invalid Supabase auth URL: ${supabaseUrl}`);
    }
    if (parsed.protocol !== "https:") {
        throw new Error(`Supabase auth URL must be https. Current value: ${supabaseUrl}`);
    }
    if (!parsed.hostname.toLowerCase().endsWith(".supabase.co")) {
        throw new Error(
            `Supabase auth URL must target *.supabase.co directly, not the app host. Current value: ${supabaseUrl}`,
        );
    }
    if (parsed.pathname !== "/" && parsed.pathname !== "") {
        throw new Error(`Supabase auth URL must be the project root, not a path. Current value: ${supabaseUrl}`);
    }
}

function buildDesktopSupabaseClientOptions(anonKey: string, isBrowser: boolean) {
    return {
        auth: {
            storage: isBrowser ? createSupabaseAuthStorage() : undefined,
            persistSession: isBrowser,
            autoRefreshToken: false,
            detectSessionInUrl: isBrowser,
        },
        global: {
            headers: {
                apikey: anonKey,
            },
        },
    } as const;
}

/**
 * Browser GoTrue client — exactly one instance on globalThis.
 * Uses the locked project URL so /auth/v1/* never hits Vercel.
 */
export function createDesktopSupabaseAuthClient(): SupabaseClient {
    const supabaseUrl = resolveSupabaseLoginUrl();
    assertDirectSupabaseAuthUrl(supabaseUrl);
    const anonKey = readBrowserSupabaseAnonKey();

    if (typeof window !== "undefined") {
        const scope = globalThis as DesktopBrowserClientGlobal;
        if (scope[DESKTOP_BROWSER_CLIENT_KEY]) {
            return scope[DESKTOP_BROWSER_CLIENT_KEY];
        }
        const client = createClient(
            supabaseUrl,
            anonKey,
            buildDesktopSupabaseClientOptions(anonKey, true),
        );
        scope[DESKTOP_BROWSER_CLIENT_KEY] = client;
        return client;
    }

    return createClient(
        supabaseUrl,
        anonKey,
        buildDesktopSupabaseClientOptions(anonKey, false),
    );
}

/** SSR stub — no persisted browser session, never stored on globalThis. */
export function createDesktopSupabaseServerStubClient(): SupabaseClient {
    const supabaseUrl = resolveSupabaseLoginUrl();
    assertDirectSupabaseAuthUrl(supabaseUrl);
    const anonKey = readBrowserSupabaseAnonKey();
    return createClient(
        supabaseUrl,
        anonKey,
        buildDesktopSupabaseClientOptions(anonKey, false),
    );
}

export function readDesktopSupabaseAuthConfig() {
    const supabaseUrl = resolveSupabaseLoginUrl();
    assertDirectSupabaseAuthUrl(supabaseUrl);
    return {
        supabaseUrl,
        projectUrl: SUPABASE_PROJECT_URL,
        anonKey: readBrowserSupabaseAnonKey(),
    };
}
