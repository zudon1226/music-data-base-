import { createClient } from "@supabase/supabase-js";
import { resolveSupabaseLoginUrl, SUPABASE_PROJECT_URL } from "./supabase-config";
import { isOversizedBearerToken, SUPABASE_REFRESH_TOKEN_HEADER } from "./session-token-limits";

export const REFRESH_TOKEN_BODY_KEYS = ["refreshToken", "sessionRefreshToken", "refresh_token"] as const;
export const ACCESS_TOKEN_BODY_KEYS = ["accessToken", "sessionAccessToken", "access_token"] as const;

export function getBearerToken(request: Request) {
    const authorization = request.headers.get("authorization") || "";
    const [scheme, token] = authorization.split(/\s+/);
    if (scheme?.toLowerCase() !== "bearer" || !token?.trim()) {
        return "";
    }
    return token.trim();
}

export function getAccessTokenFromRequest(request: Request, bodyAccessToken = "") {
    const headerToken = getBearerToken(request);
    const bodyToken = String(bodyAccessToken || "").trim();
    return headerToken || bodyToken;
}

export function getRefreshTokenFromRequest(request: Request, bodyRefreshToken = "") {
    const headerToken = request.headers.get(SUPABASE_REFRESH_TOKEN_HEADER)?.trim() || "";
    const bodyToken = String(bodyRefreshToken || "").trim();
    return headerToken || bodyToken;
}

export function describeRouteAuth(
    request: Request,
    route: string,
    userId = "",
    bodyRefreshToken = "",
    bodyAccessToken = "",
) {
    const queryUserId = new URL(request.url).searchParams.get("userId")?.trim()
        || new URL(request.url).searchParams.get("user_id")?.trim()
        || "";
    const token = getAccessTokenFromRequest(request, bodyAccessToken);
    const refreshToken = getRefreshTokenFromRequest(request, bodyRefreshToken);
    return {
        route,
        hasAuthorizationHeader: Boolean(request.headers.get("authorization")),
        bearerTokenPresent: Boolean(token),
        bearerTokenLength: token.length,
        bearerTokenOversized: isOversizedBearerToken(token),
        refreshTokenPresent: Boolean(refreshToken),
        refreshTokenLength: refreshToken.length,
        queryUserId,
        claimedUserId: userId || queryUserId,
    };
}

export function logRouteAuth(
    request: Request,
    route: string,
    userId = "",
    bodyRefreshToken = "",
    bodyAccessToken = "",
) {
    const debug = describeRouteAuth(request, route, userId, bodyRefreshToken, bodyAccessToken);
    console.log(`[${route}] AUTH DEBUG`, debug);
    return debug;
}

function getUserAuthClient() {
    const anonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim().replace(/^["']|["']$/g, "");
    if (!anonKey) {
        throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY is missing.");
    }
    let supabaseUrl = SUPABASE_PROJECT_URL;
    try {
        supabaseUrl = resolveSupabaseLoginUrl();
    }
    catch {
        // Keep hardcoded project URL when env URL is unavailable.
    }
    return createClient(supabaseUrl, anonKey, {
        auth: { autoRefreshToken: false, persistSession: false },
    });
}

async function verifyRefreshTokenUserId(refreshToken: string) {
    const authClient = getUserAuthClient();
    const { data, error } = await authClient.auth.refreshSession({ refresh_token: refreshToken });
    const userId = data.session?.user?.id || data.user?.id || "";
    if (error || !userId) {
        return { userId: "", error: error?.message || "Invalid refresh token." };
    }
    return { userId, error: "" };
}

async function verifyAccessTokenUserId(accessToken: string) {
    if (!accessToken) {
        return { userId: "", error: "Missing access token." };
    }
    if (isOversizedBearerToken(accessToken)) {
        return {
            userId: "",
            error: "Session access token is too large for API requests. Retry with a refreshed session.",
        };
    }
    const authClient = getUserAuthClient();
    const { data, error } = await authClient.auth.getUser(accessToken);
    if (error || !data.user?.id) {
        return { userId: "", error: error?.message || "Invalid session token." };
    }
    return { userId: data.user.id, error: "" };
}

export async function resolveRequestUserId(
    request: Request,
    options: { refreshToken?: string; accessToken?: string } = {},
) {
    const refreshToken = getRefreshTokenFromRequest(request, options.refreshToken);
    const accessToken = getAccessTokenFromRequest(request, options.accessToken);

    if (refreshToken) {
        const refreshResult = await verifyRefreshTokenUserId(refreshToken);
        if (refreshResult.userId) {
            return refreshResult;
        }
    }

    if (accessToken && !isOversizedBearerToken(accessToken)) {
        const accessResult = await verifyAccessTokenUserId(accessToken);
        if (accessResult.userId) {
            return accessResult;
        }
    }

    if (refreshToken) {
        return { userId: "", error: "Invalid refresh token." };
    }

    if (isOversizedBearerToken(accessToken)) {
        return {
            userId: "",
            error: "Session access token is too large for API requests. Refresh your session and try again.",
        };
    }

    return { userId: "", error: "Missing or invalid authorization token." };
}

export async function requireMatchingUserId(
    request: Request,
    route: string,
    claimedUserId: string,
    options: { refreshToken?: string; accessToken?: string } = {},
) {
    logRouteAuth(request, route, claimedUserId, options.refreshToken || "", options.accessToken || "");
    const cleanUserId = claimedUserId.trim();
    if (!cleanUserId) {
        return { ok: false as const, status: 401, error: "Missing user id." };
    }
    const { userId, error } = await resolveRequestUserId(request, options);
    if (!userId) {
        return { ok: false as const, status: 401, error: error || "Missing or invalid authorization token." };
    }
    if (userId !== cleanUserId) {
        return { ok: false as const, status: 403, error: "User id does not match session token." };
    }
    return { ok: true as const, userId };
}
