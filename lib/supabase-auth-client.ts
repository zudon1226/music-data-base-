import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { resolveSupabaseLoginUrl } from "./supabase-config";
import { createSupabaseAuthStorage } from "./supabase-auth-storage";

const DESKTOP_BROWSER_CLIENT_KEY = "__mdb_desktop_supabase_client__";

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

function resolveRequestUrl(input: RequestInfo | URL, supabaseUrl: string) {
    if (typeof input === "string") {
        return input.startsWith("http") ? input : new URL(input, supabaseUrl).href;
    }
    if (input instanceof URL) {
        return input.href;
    }
    return input.url.startsWith("http") ? input.url : new URL(input.url, supabaseUrl).href;
}

function isSupabaseAuthRequestUrl(requestUrl: string, supabaseUrl: string) {
    try {
        const target = new URL(requestUrl);
        const base = new URL(supabaseUrl);
        return target.origin === base.origin && target.pathname.startsWith("/auth/v1/");
    }
    catch {
        return requestUrl.includes("/auth/v1/");
    }
}

/** Ensures every Supabase auth request carries apikey and JSON content type. */
export function createSupabaseAuthFetch(anonKey: string, supabaseUrl: string): typeof fetch {
    const baseFetch = fetch.bind(globalThis);
    return async (input: RequestInfo | URL, init?: RequestInit) => {
        const requestUrl = resolveRequestUrl(input, supabaseUrl);
        const headers = new Headers(init?.headers);
        const authRequest = isSupabaseAuthRequestUrl(requestUrl, supabaseUrl);

        if (!headers.has("apikey")) {
            headers.set("apikey", anonKey);
        }

        if (authRequest) {
            const method = (init?.method || (typeof Request !== "undefined" && input instanceof Request ? input.method : "GET")).toUpperCase();
            if (method !== "GET" && method !== "HEAD" && !headers.has("Content-Type")) {
                headers.set("Content-Type", "application/json");
            }
        }

        return baseFetch(input, { ...init, headers });
    };
}

function buildDesktopSupabaseClientOptions(supabaseUrl: string, anonKey: string, isBrowser: boolean) {
    const authFetch = createSupabaseAuthFetch(anonKey, supabaseUrl);
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
            fetch: authFetch,
        },
    } as const;
}

type DesktopBrowserClientGlobal = typeof globalThis & {
    [DESKTOP_BROWSER_CLIENT_KEY]?: SupabaseClient;
};

/**
 * DESKTOP ONLY — browser Supabase auth client.
 * Exactly one GoTrueClient per browser context (globalThis singleton).
 */
export function createDesktopSupabaseAuthClient(): SupabaseClient {
    const supabaseUrl = resolveSupabaseLoginUrl();
    const anonKey = readBrowserSupabaseAnonKey();

    if (typeof window !== "undefined") {
        const scope = globalThis as DesktopBrowserClientGlobal;
        if (scope[DESKTOP_BROWSER_CLIENT_KEY]) {
            return scope[DESKTOP_BROWSER_CLIENT_KEY];
        }
        const client = createClient(
            supabaseUrl,
            anonKey,
            buildDesktopSupabaseClientOptions(supabaseUrl, anonKey, true),
        );
        scope[DESKTOP_BROWSER_CLIENT_KEY] = client;
        return client;
    }

    return createClient(
        supabaseUrl,
        anonKey,
        buildDesktopSupabaseClientOptions(supabaseUrl, anonKey, true),
    );
}

/** SSR stub — no persisted browser session, never stored on globalThis. */
export function createDesktopSupabaseServerStubClient(): SupabaseClient {
    const supabaseUrl = resolveSupabaseLoginUrl();
    const anonKey = readBrowserSupabaseAnonKey();
    return createClient(supabaseUrl, anonKey, buildDesktopSupabaseClientOptions(supabaseUrl, anonKey, false));
}

export function readDesktopSupabaseAuthConfig() {
    return {
        supabaseUrl: resolveSupabaseLoginUrl(),
        anonKey: readBrowserSupabaseAnonKey(),
    };
}
