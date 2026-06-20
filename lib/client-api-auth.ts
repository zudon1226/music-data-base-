import type { Session, SupabaseClient } from "@supabase/supabase-js";

export const AUTH_SOURCE = "supabase.auth.getSession";

const ALLOWED_REQUEST_HEADERS = new Set(["content-type", "accept", "cache-control"]);

export function logAuthDebug(session: Session | null) {
    const accessToken = session?.access_token;
    console.log("AUTH DEBUG", {
        AUTH_SOURCE,
        SESSION_EXISTS: Boolean(session),
        ACCESS_TOKEN_LENGTH: typeof accessToken === "string" ? accessToken.length : 0,
        ACCESS_TOKEN_TYPE: typeof accessToken === "string" ? (session?.token_type || "string") : typeof accessToken,
    });
}

export async function getSessionAccessToken(supabase: SupabaseClient) {
    const { data: { session }, error } = await supabase.auth.getSession();
    logAuthDebug(session);
    return {
        session,
        accessToken: session?.access_token || "",
        userId: session?.user?.id || "",
        error,
    };
}

export async function forceLogoutForMissingToken(supabase: SupabaseClient) {
    console.error("AUTH DEBUG", {
        AUTH_SOURCE,
        SESSION_EXISTS: false,
        ACCESS_TOKEN_LENGTH: 0,
        ACCESS_TOKEN_TYPE: "missing",
        action: "force-logout",
    });
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
    const { accessToken, userId, error, session } = await getSessionAccessToken(supabase);
    if (!accessToken) {
        await forceLogoutForMissingToken(supabase);
        throw new Error(error?.message || "Missing access token. Redirecting to login.");
    }

    const headers = buildAuthHeaders(init, accessToken);
    const url = typeof input === "string" ? input : input.toString();
    console.log("AUTH DEBUG", {
        AUTH_SOURCE,
        SESSION_EXISTS: Boolean(session),
        ACCESS_TOKEN_LENGTH: accessToken.length,
        ACCESS_TOKEN_TYPE: session?.token_type || "string",
        url,
        userId,
    });

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
