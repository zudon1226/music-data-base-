import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { getAuthSession } from "./auth-session";
import { ACCESS_TOKEN_BODY_KEYS, REFRESH_TOKEN_BODY_KEYS } from "./request-auth";
import { isOversizedBearerToken, SUPABASE_REFRESH_TOKEN_HEADER } from "./session-token-limits";

export const ACCESS_TOKEN_SOURCE = "supabase.auth.getSession().session.access_token";

const ALLOWED_REQUEST_HEADERS = new Set(["content-type", "accept", "cache-control"]);
const REFRESH_TOKEN_BODY_FIELD = REFRESH_TOKEN_BODY_KEYS[0];
const ACCESS_TOKEN_BODY_FIELD = ACCESS_TOKEN_BODY_KEYS[0];

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

    const bearerIsUsable = Boolean(accessToken) && !isOversizedBearerToken(accessToken);
    if (bearerIsUsable) {
        headers.set("Authorization", `Bearer ${accessToken}`);
    }
    if (refreshToken) {
        headers.set(SUPABASE_REFRESH_TOKEN_HEADER, refreshToken);
    }
    if (!bearerIsUsable && !refreshToken && accessToken) {
        headers.set("Authorization", `Bearer ${accessToken}`);
    }
    return headers;
}

function attachSessionTokensToBody(
    body: BodyInit | null | undefined,
    accessToken: string,
    refreshToken: string,
) {
    if (!body) {
        return body;
    }
    if (typeof body === "string") {
        try {
            const parsed = JSON.parse(body) as Record<string, unknown>;
            if (accessToken && !String(parsed[ACCESS_TOKEN_BODY_FIELD] || "").trim()) {
                parsed[ACCESS_TOKEN_BODY_FIELD] = accessToken;
            }
            if (refreshToken && !String(parsed[REFRESH_TOKEN_BODY_FIELD] || "").trim()) {
                parsed[REFRESH_TOKEN_BODY_FIELD] = refreshToken;
            }
            return JSON.stringify(parsed);
        }
        catch {
            return body;
        }
    }
    if (body instanceof FormData) {
        const hasAccessField = ACCESS_TOKEN_BODY_KEYS.some((key) => {
            const value = body.get(key);
            return typeof value === "string" && value.trim().length > 0;
        });
        const hasRefreshField = REFRESH_TOKEN_BODY_KEYS.some((key) => {
            const value = body.get(key);
            return typeof value === "string" && value.trim().length > 0;
        });
        if (accessToken && !hasAccessField) {
            body.append(ACCESS_TOKEN_BODY_FIELD, accessToken);
        }
        if (refreshToken && !hasRefreshField) {
            body.append(REFRESH_TOKEN_BODY_FIELD, refreshToken);
        }
    }
    return body;
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
    const body = attachSessionTokensToBody(init.body ?? null, accessToken, refreshToken);
    return fetch(input, {
        method: init.method,
        body,
        cache: init.cache,
        signal: init.signal,
        referrer: init.referrer,
        mode: init.mode,
        redirect: init.redirect,
        headers,
        credentials: "omit",
    });
}
