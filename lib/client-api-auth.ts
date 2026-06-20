import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { clearSupabaseAuthStorage, removeLegacyAuthStorageKeys } from "./supabase-auth-storage";

export const AUTH_SOURCE = "supabase.auth.getSession";

const ALLOWED_REQUEST_HEADERS = new Set(["content-type", "accept", "cache-control"]);

export function logSessionAuthDebug(session: Session | null) {
    const accessToken = session?.access_token || "";
    console.log("API AUTH SESSION", {
        sessionExists: Boolean(session),
        accessTokenLength: accessToken.length,
        authSource: AUTH_SOURCE,
        userId: session?.user?.id || "",
    });
}

export async function getSessionAccessToken(supabase: SupabaseClient) {
    const { data: { session }, error } = await supabase.auth.getSession();
    const accessToken = session?.access_token || "";
    logSessionAuthDebug(session);
    return {
        session,
        accessToken,
        userId: session?.user?.id || "",
        error,
    };
}

export async function forceLogoutForMissingToken(supabase: SupabaseClient) {
    console.error("API AUTH: missing access token — forcing logout.");
    try {
        await supabase.auth.signOut();
    }
    catch {
        // ignore sign-out errors during forced logout
    }
    removeLegacyAuthStorageKeys();
    clearSupabaseAuthStorage();
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
    if (accessToken) {
        headers.set("Authorization", `Bearer ${accessToken}`);
    }
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
    console.log("API AUTH FETCH", {
        url,
        sessionExists: Boolean(session),
        accessTokenLength: accessToken.length,
        authSource: AUTH_SOURCE,
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
