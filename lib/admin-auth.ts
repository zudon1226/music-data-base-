import { resolveStrictRequestUserId } from "@/lib/request-auth";
import { getErrorMessage, getSupabaseServerClient, isPlatformOwnerUserId, isUuid } from "@/lib/server-supabase";

/**
 * Platform Control Center privileged routes:
 * resolve the authenticated session user server-side, then require platform owner.
 * Never trusts client-supplied userId / owner flags for authorization.
 * Uses strict token verification (no unverified JWT claims fallback).
 */
export async function requireAuthenticatedPlatformOwner(
    request: Request,
    route: string,
    options: { refreshToken?: string; accessToken?: string } = {},
) {
    const resolved = await resolveStrictRequestUserId(request, options);
    if (!resolved.userId) {
        console.log(`[${route}] AUTH VALIDATION`, {
            authUserId: "",
            bearerTokenPresent: Boolean(request.headers.get("authorization")),
            matched: false,
            error: resolved.error || "Authentication required.",
        });
        return {
            ok: false as const,
            status: 401 as const,
            error: resolved.error || "Authentication required.",
        };
    }

    let owner: Awaited<ReturnType<typeof requirePlatformOwnerUserId>>;
    try {
        owner = await requirePlatformOwnerUserId(resolved.userId);
    } catch (error) {
        console.log(`[${route}] AUTH VALIDATION`, {
            authUserId: resolved.userId,
            bearerTokenPresent: Boolean(request.headers.get("authorization")),
            matched: false,
            error: getErrorMessage(error),
        });
        return {
            ok: false as const,
            status: 401 as const,
            error: "Authentication required.",
        };
    }
    if (!owner.ok) {
        console.log(`[${route}] AUTH VALIDATION`, {
            authUserId: resolved.userId,
            bearerTokenPresent: Boolean(request.headers.get("authorization")),
            matched: false,
            error: owner.error,
        });
        return {
            ok: false as const,
            status: 403 as const,
            error: owner.error,
        };
    }

    console.log(`[${route}] AUTH VALIDATION`, {
        authUserId: resolved.userId,
        bearerTokenPresent: Boolean(request.headers.get("authorization")),
        matched: true,
        error: "",
    });
    return { ok: true as const, userId: resolved.userId };
}

export async function isAdminUserId(userId: string) {
    if (!userId || !isUuid(userId)) return false;
    if (await isPlatformOwnerUserId(userId)) return true;

    const supabase = getSupabaseServerClient();
    const roleResult = await supabase
        .from("user_roles")
        .select("id")
        .eq("user_id", userId)
        .eq("role", "admin")
        .eq("status", "active")
        .limit(1);

    if (!roleResult.error && (roleResult.data || []).length > 0) return true;

    const profileResult = await supabase
        .from("profiles")
        .select("id")
        .or(`id.eq.${userId},user_id.eq.${userId}`)
        .or("is_admin.eq.true,account_type.eq.admin")
        .limit(1);

    return !profileResult.error && (profileResult.data || []).length > 0;
}

export async function requireAdminUserId(userId: string) {
    if (!(await isAdminUserId(userId))) {
        return { ok: false as const, status: 403, error: "Admin permission is required." };
    }
    return { ok: true as const, userId };
}

export async function requirePlatformOwnerUserId(userId: string) {
    if (!(await isPlatformOwnerUserId(userId))) {
        return { ok: false as const, status: 403, error: "Platform owner permission is required." };
    }
    return { ok: true as const, userId };
}

export function isMissingFoundingSetup(error: unknown) {
    const message = getErrorMessage(error).toLowerCase();
    const mentionsFoundingTable = message.includes("founding_invites") || message.includes("founding_members");
    const looksMissing = message.includes("does not exist")
        || message.includes("schema cache")
        || message.includes("could not find the table")
        || message.includes("could not find the relation");
    return mentionsFoundingTable && looksMissing;
}
