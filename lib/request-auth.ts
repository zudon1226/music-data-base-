import { createClient } from "@supabase/supabase-js";
import { SUPABASE_PROJECT_URL } from "./supabase-config";

export function getBearerToken(request: Request) {
    const authorization = request.headers.get("authorization") || "";
    const [scheme, token] = authorization.split(/\s+/);
    if (scheme?.toLowerCase() !== "bearer" || !token?.trim()) {
        return "";
    }
    return token.trim();
}

export function describeRouteAuth(request: Request, route: string, userId = "") {
    const queryUserId = new URL(request.url).searchParams.get("userId")?.trim()
        || new URL(request.url).searchParams.get("user_id")?.trim()
        || "";
    const token = getBearerToken(request);
    return {
        route,
        hasAuthorizationHeader: Boolean(request.headers.get("authorization")),
        bearerTokenPresent: Boolean(token),
        bearerTokenLength: token.length,
        queryUserId,
        claimedUserId: userId || queryUserId,
    };
}

export function logRouteAuth(request: Request, route: string, userId = "") {
    const debug = describeRouteAuth(request, route, userId);
    console.log(`[${route}] AUTH DEBUG`, debug);
    return debug;
}

function getAuthClient() {
    const anonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim().replace(/^["']|["']$/g, "");
    if (!anonKey) {
        throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY is missing.");
    }
    return createClient(SUPABASE_PROJECT_URL, anonKey, {
        auth: { autoRefreshToken: false, persistSession: false },
    });
}

export async function verifyBearerUserId(request: Request) {
    const token = getBearerToken(request);
    if (!token) {
        return { userId: "", error: "Missing Authorization bearer token." };
    }
    const authClient = getAuthClient();
    const { data, error } = await authClient.auth.getUser(token);
    if (error || !data.user?.id) {
        return { userId: "", error: error?.message || "Invalid session token." };
    }
    return { userId: data.user.id, error: "" };
}

export async function requireMatchingUserId(request: Request, route: string, claimedUserId: string) {
    logRouteAuth(request, route, claimedUserId);
    const cleanUserId = claimedUserId.trim();
    if (!cleanUserId) {
        return { ok: false as const, status: 401, error: "Missing user id." };
    }
    const { userId, error } = await verifyBearerUserId(request);
    if (!userId) {
        return { ok: false as const, status: 401, error: error || "Missing or invalid authorization token." };
    }
    if (userId !== cleanUserId) {
        return { ok: false as const, status: 403, error: "User id does not match session token." };
    }
    return { ok: true as const, userId };
}
