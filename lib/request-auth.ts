import { createClient } from "@supabase/supabase-js";
import { SUPABASE_PROJECT_URL } from "./supabase-config";
import { isOversizedBearerToken, SUPABASE_REFRESH_TOKEN_HEADER } from "./session-token-limits";

export const REFRESH_TOKEN_BODY_KEYS = ["refreshToken", "sessionRefreshToken", "refresh_token"] as const;
export const ACCESS_TOKEN_BODY_KEYS = ["accessToken", "sessionAccessToken", "access_token"] as const;

const REFRESH_TOKEN_QUERY_KEYS = ["refreshToken", "sessionRefreshToken", "refresh_token"] as const;
const ACCESS_TOKEN_QUERY_KEYS = ["accessToken", "sessionAccessToken", "access_token"] as const;

function stripEnvQuotes(value: string) {
    return value.trim().replace(/^["']|["']$/g, "");
}

/** Match browser client key normalization so server auth.getUser uses the same key. */
function readRequestAuthAnonKey() {
    return stripEnvQuotes(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").replace(/\s+/g, "");
}

function readQueryToken(request: Request, keys: readonly string[]) {
    const url = new URL(request.url);
    for (const key of keys) {
        const value = url.searchParams.get(key)?.trim();
        if (value) {
            return value;
        }
    }
    return "";
}

export function getBearerToken(request: Request) {
    const authorization = request.headers.get("authorization") || "";
    const [scheme, token] = authorization.split(/\s+/);
    if (scheme?.toLowerCase() !== "bearer" || !token?.trim()) {
        return "";
    }
    return token.trim();
}

export function getRecordString(record: Record<string, unknown>, keys: readonly string[], fallback = "") {
    for (const key of keys) {
        const value = record[key];
        if (typeof value === "string" && value.trim()) {
            return value.trim();
        }
    }
    return fallback;
}

export function getSessionTokensFromRecord(record: Record<string, unknown>) {
    return {
        refreshToken: getRecordString(record, REFRESH_TOKEN_BODY_KEYS),
        accessToken: getRecordString(record, ACCESS_TOKEN_BODY_KEYS),
    };
}

export function getAccessTokenFromRequest(request: Request, bodyAccessToken = "") {
    const headerToken = getBearerToken(request);
    if (headerToken) {
        return headerToken;
    }
    const queryToken = readQueryToken(request, ACCESS_TOKEN_QUERY_KEYS);
    if (queryToken) {
        return queryToken;
    }
    return String(bodyAccessToken || "").trim();
}

export function getRefreshTokenFromRequest(request: Request, bodyRefreshToken = "") {
    const headerToken = request.headers.get(SUPABASE_REFRESH_TOKEN_HEADER)?.trim() || "";
    if (headerToken) {
        return headerToken;
    }
    const queryToken = readQueryToken(request, REFRESH_TOKEN_QUERY_KEYS);
    if (queryToken) {
        return queryToken;
    }
    return String(bodyRefreshToken || "").trim();
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
    const anonKey = readRequestAuthAnonKey();
    if (!anonKey) {
        throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY is missing.");
    }
    return createClient(SUPABASE_PROJECT_URL, anonKey, {
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

    // Identity comes only from Supabase-verified tokens; decoded JWT claims are never trusted.
    try {
        const authClient = getUserAuthClient();
        const { data, error } = await authClient.auth.getUser(accessToken);
        if (data.user?.id) {
            return { userId: data.user.id, error: "" };
        }
        return { userId: "", error: error?.message || "Invalid session token." };
    }
    catch (error) {
        return {
            userId: "",
            error: error instanceof Error ? error.message : "Invalid session token.",
        };
    }
}

/** Privileged routes: require Supabase auth.getUser — never trust unverified JWT claims alone. */
async function verifyAccessTokenUserIdStrict(accessToken: string) {
    if (!accessToken) {
        return { userId: "", error: "Missing access token." };
    }
    if (isOversizedBearerToken(accessToken)) {
        return {
            userId: "",
            error: "Session access token is too large for API requests. Retry with a refreshed session.",
        };
    }

    try {
        const authClient = getUserAuthClient();
        const { data, error } = await authClient.auth.getUser(accessToken);
        if (data.user?.id) {
            return { userId: data.user.id, error: "" };
        }
        return { userId: "", error: error?.message || "Invalid session token." };
    }
    catch (error) {
        return {
            userId: "",
            error: error instanceof Error ? error.message : "Invalid session token.",
        };
    }
}

/**
 * Strict session resolution for platform-owner / destructive APIs.
 * Accepts verified access tokens or refreshed sessions only — no JWT-claims fallback.
 */
export async function resolveStrictRequestUserId(
    request: Request,
    options: { refreshToken?: string; accessToken?: string } = {},
) {
    const bearerToken = getBearerToken(request);
    if (bearerToken) {
        return verifyAccessTokenUserIdStrict(bearerToken);
    }

    let accessToken = getAccessTokenFromRequest(request, options.accessToken);
    let refreshToken = getRefreshTokenFromRequest(request, options.refreshToken);

    if (!accessToken || !refreshToken) {
        const bodyTokens = await readJsonBodySessionTokens(request);
        if (!accessToken) {
            accessToken = bodyTokens.accessToken;
        }
        if (!refreshToken) {
            refreshToken = bodyTokens.refreshToken;
        }
    }

    let lastError = "Missing or invalid authorization token.";

    if (accessToken && !isOversizedBearerToken(accessToken)) {
        const accessResult = await verifyAccessTokenUserIdStrict(accessToken);
        if (accessResult.userId) {
            return accessResult;
        }
        lastError = accessResult.error || lastError;
    }

    if (refreshToken) {
        const refreshResult = await verifyRefreshTokenUserId(refreshToken);
        if (refreshResult.userId) {
            return refreshResult;
        }
        lastError = refreshResult.error || lastError;
    }

    if (isOversizedBearerToken(accessToken)) {
        return {
            userId: "",
            error: "Session access token is too large for API requests. Refresh your session and try again.",
        };
    }

    return { userId: "", error: lastError };
}

async function readJsonBodySessionTokens(request: Request) {
    const contentType = (request.headers.get("content-type") || "").toLowerCase();
    if (!contentType.includes("application/json")) {
        return { accessToken: "", refreshToken: "" };
    }
    try {
        const body = await request.clone().json() as Record<string, unknown>;
        return getSessionTokensFromRecord(body);
    }
    catch {
        return { accessToken: "", refreshToken: "" };
    }
}

export async function resolveRequestUserId(
    request: Request,
    options: { refreshToken?: string; accessToken?: string } = {},
) {
    const bearerToken = getBearerToken(request);
    if (bearerToken) {
        return verifyAccessTokenUserId(bearerToken);
    }

    let accessToken = getAccessTokenFromRequest(request, options.accessToken);
    let refreshToken = getRefreshTokenFromRequest(request, options.refreshToken);

    if (!accessToken || !refreshToken) {
        const bodyTokens = await readJsonBodySessionTokens(request);
        if (!accessToken) {
            accessToken = bodyTokens.accessToken;
        }
        if (!refreshToken) {
            refreshToken = bodyTokens.refreshToken;
        }
    }

    let lastError = "Missing or invalid authorization token.";

    if (accessToken && !isOversizedBearerToken(accessToken)) {
        const accessResult = await verifyAccessTokenUserId(accessToken);
        if (accessResult.userId) {
            return accessResult;
        }
        lastError = accessResult.error || lastError;
    }

    if (refreshToken) {
        const refreshResult = await verifyRefreshTokenUserId(refreshToken);
        if (refreshResult.userId) {
            return refreshResult;
        }
        lastError = refreshResult.error || lastError;
    }

    if (isOversizedBearerToken(accessToken)) {
        return {
            userId: "",
            error: "Session access token is too large for API requests. Refresh your session and try again.",
        };
    }

    return { userId: "", error: lastError };
}

function logAuthValidation(
    route: string,
    queryUserId: string,
    authUserId: string,
    bearerTokenPresent: boolean,
    matched: boolean,
    error = "",
) {
    console.log(`[${route}] AUTH VALIDATION`, {
        queryUserId,
        authUserId,
        bearerTokenPresent,
        matched,
        error,
    });
}

export async function requireMatchingUserId(
    request: Request,
    route: string,
    claimedUserId: string,
    options: { refreshToken?: string; accessToken?: string } = {},
) {
    const cleanUserId = claimedUserId.trim();
    const bearerTokenPresent = Boolean(getBearerToken(request));
    if (!cleanUserId) {
        logAuthValidation(route, cleanUserId, "", bearerTokenPresent, false, "Missing user id.");
        return { ok: false as const, status: 401, error: "Missing user id." };
    }
    const { userId, error } = await resolveRequestUserId(request, options);
    if (!userId) {
        logAuthValidation(route, cleanUserId, "", bearerTokenPresent, false, error || "Missing or invalid Authorization bearer token.");
        return { ok: false as const, status: 401, error: error || "Missing or invalid Authorization bearer token." };
    }
    if (userId !== cleanUserId) {
        logAuthValidation(route, cleanUserId, userId, bearerTokenPresent, false, "Authorization bearer token user does not match requested user id.");
        return { ok: false as const, status: 403, error: "Authorization bearer token user does not match requested user id." };
    }
    logAuthValidation(route, cleanUserId, userId, bearerTokenPresent, true);
    return { ok: true as const, userId };
}

/** Desktop upload routes: bearer access token only — never consumes refresh tokens. */
export async function requireBearerOnlyMatchingUserId(
    request: Request,
    route: string,
    claimedUserId: string,
) {
    const cleanUserId = claimedUserId.trim();
    const bearerToken = getBearerToken(request);
    const bearerTokenPresent = Boolean(bearerToken);
    if (!cleanUserId) {
        logAuthValidation(route, cleanUserId, "", bearerTokenPresent, false, "Missing user id.");
        return { ok: false as const, status: 401, error: "Missing user id." };
    }
    if (!bearerToken) {
        logAuthValidation(route, cleanUserId, "", false, false, "Missing or invalid Authorization bearer token.");
        return { ok: false as const, status: 401, error: "Missing or invalid Authorization bearer token." };
    }
    const { userId, error } = await verifyAccessTokenUserId(bearerToken);
    if (!userId) {
        logAuthValidation(route, cleanUserId, "", bearerTokenPresent, false, error || "Missing or invalid Authorization bearer token.");
        return { ok: false as const, status: 401, error: error || "Missing or invalid Authorization bearer token." };
    }
    if (userId !== cleanUserId) {
        logAuthValidation(route, cleanUserId, userId, bearerTokenPresent, false, "Authorization bearer token user does not match requested user id.");
        return { ok: false as const, status: 403, error: "Authorization bearer token user does not match requested user id." };
    }
    logAuthValidation(route, cleanUserId, userId, bearerTokenPresent, true);
    return { ok: true as const, userId };
}

/** Read routes: verify session when present, but never surface 401 to the client. */
export async function optionalMatchingUserId(
    request: Request,
    claimedUserId: string,
    options: { refreshToken?: string; accessToken?: string; route?: string } = {},
) {
    const cleanUserId = claimedUserId.trim();
    const bearerTokenPresent = Boolean(getBearerToken(request));
    const route = options.route || "optional-auth";
    if (!cleanUserId) {
        logAuthValidation(route, cleanUserId, "", bearerTokenPresent, false, "Missing user id.");
        return { ok: false as const, userId: "" };
    }
    const { userId, error } = await resolveRequestUserId(request, options);
    const matched = Boolean(userId && userId === cleanUserId);
    logAuthValidation(route, cleanUserId, userId || "", bearerTokenPresent, matched, matched ? "" : (error || "Session user id does not match requested user id."));
    if (!matched) {
        return { ok: false as const, userId: "" };
    }
    return { ok: true as const, userId };
}
