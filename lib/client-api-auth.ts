import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { getAuthSession } from "./auth-session";
import { isOversizedBearerToken, SUPABASE_REFRESH_TOKEN_HEADER } from "./session-token-limits";

export const ACCESS_TOKEN_SOURCE = "supabase.auth.getSession().session.access_token";

const ALLOWED_REQUEST_HEADERS = new Set(["content-type", "accept", "cache-control"]);

export function readAccessTokenFromSession(session: Session | null | undefined) {
    return typeof session?.access_token === "string" ? session.access_token : "";
}

function readRefreshTokenFromSession(session: Session | null | undefined) {
    return typeof session?.refresh_token === "string" ? session.refresh_token : "";
}

async function readSessionAccessToken(supabase: SupabaseClient) {
    const { session, error } = await getAuthSession(supabase);
    const accessToken = readAccessTokenFromSession(session);
    const refreshToken = readRefreshTokenFromSession(session);
    return {
        session,
        accessToken,
        refreshToken,
        userId: session?.user?.id || "",
        error,
    };
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

function buildAuthHeaders(init: RequestInit | undefined, accessToken: string, refreshToken: string) {
    const headers = new Headers();
    copyAllowedHeaders(headers, init?.headers);
    headers.delete("authorization");
    headers.delete("Authorization");
    headers.delete("apikey");
    headers.delete("x-supabase-auth");
    headers.delete("x-session");
    headers.delete("x-user");
    headers.delete("x-refresh-token");
    headers.delete(SUPABASE_REFRESH_TOKEN_HEADER);

    const canUseBearer = Boolean(accessToken) && !isOversizedBearerToken(accessToken);
    if (canUseBearer) {
        headers.set("Authorization", `Bearer ${accessToken}`);
        return headers;
    }

    if (refreshToken) {
        headers.set(SUPABASE_REFRESH_TOKEN_HEADER, refreshToken);
        return headers;
    }

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
    const { accessToken, refreshToken, error } = await readSessionAccessToken(supabase);
    if (!accessToken && !refreshToken) {
        throw new Error(
            error?.message
                || `Missing session access_token from ${ACCESS_TOKEN_SOURCE}. Sign in again.`,
        );
    }

    const headers = buildAuthHeaders(init, accessToken, refreshToken);
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
