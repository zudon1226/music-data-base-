import type { Session, SupabaseClient } from "@supabase/supabase-js";

export const ACCESS_TOKEN_SOURCE = "supabase.auth.getSession().session.access_token";

const ALLOWED_REQUEST_HEADERS = new Set(["content-type", "accept", "cache-control"]);

export function logAccessTokenDiagnostics(accessToken: unknown, sourcePath = ACCESS_TOKEN_SOURCE) {
    const tokenString = accessToken == null ? "" : String(accessToken);
    console.log("AUTH_SOURCE", "supabase-session");
    console.log("TOKEN_SOURCE_PATH", sourcePath);
    console.log("TOKEN_TYPE", typeof accessToken);
    console.log("TOKEN_PREFIX", tokenString.slice(0, 50));
    console.log("TOKEN_LENGTH", tokenString.length);
}

export function readAccessTokenFromSession(
    session: Session | null | undefined,
    sourcePath = ACCESS_TOKEN_SOURCE,
) {
    const raw = session?.access_token;
    logAccessTokenDiagnostics(raw, sourcePath);

    if (typeof raw !== "string" || !raw) {
        console.error("ACCESS_TOKEN_REJECTED", {
            sourcePath,
            reason: "missing-or-not-string",
            sessionExists: Boolean(session),
            sessionKeys: session ? Object.keys(session) : [],
        });
        return "";
    }

    if (!raw.startsWith("eyJ")) {
        console.error("ACCESS_TOKEN_REJECTED", {
            sourcePath,
            reason: "not-jwt-prefix",
            tokenType: typeof raw,
            tokenPrefix: raw.slice(0, 50),
            tokenLength: raw.length,
            looksLikeJson: raw.startsWith("{") || raw.startsWith("["),
            sessionTokenTypeField: session?.token_type || null,
            refreshTokenLength: typeof session?.refresh_token === "string" ? session.refresh_token.length : null,
        });
        return "";
    }

    return raw;
}

async function readSessionAccessToken(supabase: SupabaseClient) {
    const {
        data: { session },
        error,
    } = await supabase.auth.getSession();

    const accessToken = readAccessTokenFromSession(session);
    return {
        session,
        accessToken,
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
        throw new Error(
            error?.message
                || `Invalid session access_token from ${ACCESS_TOKEN_SOURCE}. Expected JWT string starting with "eyJ". Request stopped.`,
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
