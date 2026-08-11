import { resolveStrictRequestUserId } from "@/lib/request-auth";
import { isAdminUserId } from "@/lib/admin-auth";
import { isUuid } from "@/lib/server-supabase";

/**
 * Bind sales/license operations to the verified session user.
 * Client-supplied userId is never authoritative — mismatch => 403.
 */
export async function requireAuthenticatedSalesUser(
  request: Request,
  route: string,
  claimedUserId = "",
  options: { allowAdminTarget?: boolean } = {},
) {
  const resolved = await resolveStrictRequestUserId(request);
  if (!resolved.userId) {
    console.log(`[${route}] AUTH VALIDATION`, {
      authUserId: "",
      claimedUserId: claimedUserId || "",
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

  const claimed = String(claimedUserId || "").trim();
  if (claimed && !isUuid(claimed)) {
    return {
      ok: false as const,
      status: 400 as const,
      error: "Invalid user id.",
    };
  }

  if (claimed && claimed !== resolved.userId) {
    if (options.allowAdminTarget && (await isAdminUserId(resolved.userId))) {
      console.log(`[${route}] AUTH VALIDATION`, {
        authUserId: resolved.userId,
        claimedUserId: claimed,
        bearerTokenPresent: Boolean(request.headers.get("authorization")),
        matched: true,
        adminTarget: true,
        error: "",
      });
      return { ok: true as const, userId: claimed, actorUserId: resolved.userId, isAdminTarget: true as const };
    }
    console.log(`[${route}] AUTH VALIDATION`, {
      authUserId: resolved.userId,
      claimedUserId: claimed,
      bearerTokenPresent: Boolean(request.headers.get("authorization")),
      matched: false,
      error: "Authenticated user does not match requested user id.",
    });
    return {
      ok: false as const,
      status: 403 as const,
      error: "Authenticated user does not match requested user id.",
    };
  }

  console.log(`[${route}] AUTH VALIDATION`, {
    authUserId: resolved.userId,
    claimedUserId: claimed || resolved.userId,
    bearerTokenPresent: Boolean(request.headers.get("authorization")),
    matched: true,
    error: "",
  });
  return {
    ok: true as const,
    userId: resolved.userId,
    actorUserId: resolved.userId,
    isAdminTarget: false as const,
  };
}
