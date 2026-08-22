import { requirePodcastCreator } from "@/lib/podcast-access";
import { getSessionTokensFromRecord, requireMatchingUserId } from "@/lib/request-auth";
import { isUuid } from "@/lib/server-supabase";
import { requireUploadAllowedForUserId } from "@/lib/upload-lock-server";

function readUserId(body: Record<string, unknown>) {
    return String(body.userId || body.user_id || body.sessionUserId || body.session_user_id || "").trim();
}

export async function requirePodcastRequestUser(
    request: Request,
    body: Record<string, unknown>,
    route: string,
) {
    const userId = readUserId(body);
    if (!isUuid(userId)) {
        return { ok: false as const, status: 401, error: "Sign in again to manage Podcast content." };
    }
    const auth = await requireMatchingUserId(request, route, userId, getSessionTokensFromRecord(body));
    if (!auth.ok) return auth;
    return { ok: true as const, userId: auth.userId };
}

export async function requirePodcastRequestCreator(
    request: Request,
    body: Record<string, unknown>,
    route: string,
    options: { requireUploadUnlocked?: boolean } = {},
) {
    const auth = await requirePodcastRequestUser(request, body, route);
    if (!auth.ok) return auth;
    if (options.requireUploadUnlocked) {
        const uploadLock = await requireUploadAllowedForUserId(auth.userId);
        if (!uploadLock.ok) {
            return { ok: false as const, status: uploadLock.status, error: uploadLock.error };
        }
    }
    const creator = await requirePodcastCreator(auth.userId);
    if (!creator.ok) return creator;
    return { ok: true as const, userId: auth.userId };
}
