import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { getValidatedSession, validateAccessToken } from "./auth-session-guard";

export const ACCESS_TOKEN_SOURCE = "supabase.auth.getSession().session.access_token";

const ALLOWED_REQUEST_HEADERS = new Set(["content-type", "accept", "cache-control"]);

export function readAccessTokenFromSession(session: Session | null | undefined) {
    const raw = session?.access_token;
    const validation = validateAccessToken(raw);
    if (!validation.valid) {
        return "";
    }
    return raw as string;
}

async function readSessionAccessToken(supabase: SupabaseClient) {
    const { session, error, authInvalidated } = await getValidatedSession(supabase);
    const accessToken = readAccessTokenFromSession(session);
    return {
        session,
        accessToken,
        userId: session?.user?.id || "",
        error,
        authInvalidated,
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
    const { accessToken, error, authInvalidated } = await readSessionAccessToken(supabase);
    if (authInvalidated || !accessToken) {
        throw new Error(
            error?.message
                || `Invalid session access_token from ${ACCESS_TOKEN_SOURCE}. Sign in again.`,
        );
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
