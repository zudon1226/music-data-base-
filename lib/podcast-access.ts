import { isAdminUserId } from "@/lib/admin-auth";
import { resolvePodcastAccess } from "@/lib/billing/plan-entitlements";
import { loadResolvedAccountCapabilities } from "@/lib/resolved-account-role";
import { isUuid } from "@/lib/server-supabase";

/** One Studio grant for Artist, Producer, Podcaster, or any combination. No duplicate Podcast permission. */
export function podcastStudioGrantedForRoles(input: {
    isArtist?: boolean;
    isProducer?: boolean;
    isPodcaster?: boolean;
    isAdmin?: boolean;
}) {
    return resolvePodcastAccess(input).studioAllowedByRole;
}

export async function canUserManagePodcasts(userId: string, email = "") {
    if (!isUuid(userId)) return false;
    if (await isAdminUserId(userId)) return true;
    const capabilities = await loadResolvedAccountCapabilities(userId, email);
    return podcastStudioGrantedForRoles({
        isArtist: capabilities.isArtist,
        isProducer: capabilities.isProducer,
        isPodcaster: capabilities.isPodcaster,
        isAdmin: capabilities.isAdmin,
    });
}

export async function requirePodcastCreator(userId: string, email = "") {
    if (!(await canUserManagePodcasts(userId, email))) {
        return {
            ok: false as const,
            status: 403,
            error: "Podcast Studio is available for Artist, Producer, and Podcaster accounts only.",
        };
    }
    return { ok: true as const, userId };
}

export async function canManagePodcastOwner(userId: string, ownerId: unknown) {
    if (!isUuid(userId)) return false;
    if (String(ownerId || "") === userId) return true;
    return isAdminUserId(userId);
}

export async function requirePodcastOwner(userId: string, ownerId: unknown) {
    if (!(await canManagePodcastOwner(userId, ownerId))) {
        return {
            ok: false as const,
            status: 403,
            error: "Only the podcast owner or a platform admin can manage this content.",
        };
    }
    return { ok: true as const, userId };
}
