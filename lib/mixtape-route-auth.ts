import { requireMixtapeCreator } from "@/lib/mixtape-access";
import { getSessionTokensFromRecord, requireMatchingUserId } from "@/lib/request-auth";
import { isUuid } from "@/lib/server-supabase";
import { requireUploadAllowedForUserId } from "@/lib/upload-lock-server";

function readUserId(body: Record<string, unknown>) {
    return String(body.userId || body.user_id || body.sessionUserId || body.session_user_id || "").trim();
}

export async function requireMixtapeRequestUser(
    request: Request,
    body: Record<string, unknown>,
    route: string,
) {
    const userId = readUserId(body);
    if (!isUuid(userId)) {
        return { ok: false as const, status: 401, error: "Sign in again to manage Mixtape content." };
    }
    const auth = await requireMatchingUserId(request, route, userId, getSessionTokensFromRecord(body));
    if (!auth.ok) return auth;
    return { ok: true as const, userId: auth.userId };
}

export async function requireMixtapeRequestCreator(
    request: Request,
    body: Record<string, unknown>,
    route: string,
    options: { requireUploadUnlocked?: boolean } = {},
) {
    const auth = await requireMixtapeRequestUser(request, body, route);
    if (!auth.ok) return auth;
    if (options.requireUploadUnlocked) {
        const uploadLock = await requireUploadAllowedForUserId(auth.userId);
        if (!uploadLock.ok) {
            return { ok: false as const, status: uploadLock.status, error: uploadLock.error };
        }
    }
    const creator = await requireMixtapeCreator(auth.userId);
    if (!creator.ok) return creator;
    return { ok: true as const, userId: auth.userId };
}