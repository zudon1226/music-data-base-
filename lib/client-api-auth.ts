import type { SupabaseClient } from "@supabase/supabase-js";

const ALLOWED_REQUEST_HEADERS = new Set(["content-type", "accept", "cache-control"]);

async function readSessionAccessToken(supabase: SupabaseClient) {
    const {
        data: { session },
        error,
    } = await supabase.auth.getSession();
    const accessToken = session?.access_token;
    console.log("AUTH_SOURCE", "supabase-session");
    console.log("ACCESS_TOKEN_LENGTH", accessToken?.length);
    return {
        session,
        accessToken: accessToken || "",
        userId: session?.user?.id || "",
        error,
    };
}

async function forceLogoutForMissingToken(supabase: SupabaseClient) {
    try {
        await supabase.auth.signOut();
    }
    catch {
        // ignore sign-out errors during forced logout
    }
    if (typeof window !== "undefined") {
        window.location.replace("/");
    }
}

function copyAllowedHeaders(target: Headers, source: HeadersInit | undefined) {
    if (!source) {
        return;
    }
    const incoming = new Headers(source);
    incoming.forEach((value, key) => {
        const lowerKey = key.toLowerCase();
        if (ALLOWED_REQUEST_HEADERS.has(lowerKey)) {
            target.set(key, value);
        }
    });
}

function buildAuthHeaders(init: RequestInit | undefined, accessToken: string) {
    const headers = new Headers();
    copyAllowedHeaders(headers, init?.headers);
    headers.delete("authorization");
    headers.delete("Authorization");
    headers.delete("apikey");
    headers.delete("x-supabase-auth");
    headers.delete("x-session");
    headers.delete("x-user");
    headers.delete("x-refresh-token");
    headers.set("Authorization", `Bearer ${accessToken}`);
    return headers;
}

export async function authFetch(
    supabase: SupabaseClient,
    input: RequestInfo | URL,
    init: RequestInit = {},
) {
    const { accessToken, error } = await readSessionAccessToken(supabase);
    if (!accessToken) {
        await forceLogoutForMissingToken(supabase);
        throw new Error(error?.message || "Missing access token. Redirecting to login.");
    }

    const headers = buildAuthHeaders(init, accessToken);
    return fetch(input, {
        method: init.method,
        body: init.body,
        cache: init.cache,
        signal: init.signal,
        referrer: init.referrer,
        mode: init.mode,
        redirect: init.redirect,
        headers,
        credentials: "omit",
    });
}
