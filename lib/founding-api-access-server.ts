import { getFoundingAccessForUser } from "@/lib/founding-access";
import {
    FOUNDING_INVITE_REQUIRED_MESSAGE,
    FOUNDING_PENDING_MESSAGE,
    FOUNDING_REJECTED_MESSAGE,
    isFoundingBetaLocked,
} from "@/lib/founding-onboarding";
import { resolveRequestUserId } from "@/lib/request-auth";
import { getSupabaseServerClient, isPlatformOwnerEmail } from "@/lib/server-supabase";

const EXACT_BYPASS_PATHS = new Set([
    "/api/founding-invites/validate",
    "/api/founding-invites/redeem",
    "/api/founding-members/me",
    "/api/auth/repair-metadata",
    "/api/platform/repair-auth-metadata",
]);

const PREFIX_BYPASS_PATHS = [
    "/api/launch/",
];

function isBypassPath(pathname: string) {
    if (EXACT_BYPASS_PATHS.has(pathname)) return true;
    return PREFIX_BYPASS_PATHS.some((prefix) => pathname.startsWith(prefix));
}

function foundingAccessDeniedMessage(access: Awaited<ReturnType<typeof getFoundingAccessForUser>>) {
    if (!access.isFoundingMember) return FOUNDING_INVITE_REQUIRED_MESSAGE;
    if (access.approvalStatus === "pending") return FOUNDING_PENDING_MESSAGE;
    if (access.approvalStatus === "rejected") return FOUNDING_REJECTED_MESSAGE;
    return FOUNDING_INVITE_REQUIRED_MESSAGE;
}

export function shouldEnforceFoundingApiAccess(pathname: string) {
    if (!isFoundingBetaLocked()) return false;
    if (!pathname.startsWith("/api/")) return false;
    return !isBypassPath(pathname);
}

export async function evaluateFoundingApiAccess(request: Request, pathname: string) {
    if (!shouldEnforceFoundingApiAccess(pathname)) {
        return { ok: true as const };
    }

    const resolved = await resolveRequestUserId(request);
    const userId = resolved.userId;
    if (!userId) {
        return { ok: true as const };
    }

    const supabase = getSupabaseServerClient();
    const userLookup = await supabase.auth.admin.getUserById(userId);
    const email = userLookup.data.user?.email || "";
    if (isPlatformOwnerEmail(email)) {
        return { ok: true as const };
    }

    const access = await getFoundingAccessForUser(supabase, userId, email);
    if (access.canAccessApp) {
        return { ok: true as const };
    }

    return {
        ok: false as const,
        status: 403,
        error: foundingAccessDeniedMessage(access),
        foundingAccessDenied: true,
    };
}
