import { isAdminUserId } from "@/lib/admin-auth";
import { normalizeCatalogModerationState } from "@/lib/moderation-status.mjs";
import { getBearerToken, resolveStrictRequestUserId } from "@/lib/request-auth";
import { isUuid } from "@/lib/server-supabase";

export type ModerationPreviewMediaType = "song" | "video";

export type ModerationPreviewViewer = {
    userId: string;
    isAdmin: boolean;
};

export type ModerationPreviewAccessResult =
    | { ok: true; reason: "held_owner" | "held_admin" | "removed_admin" }
    | { ok: false; code: "NOT_FOUND" | "FORBIDDEN" | "AUTH_REQUIRED" | "USE_STANDARD_PLAYBACK"; error: string };

export function evaluateModerationMediaPreviewAccess(
    record: Record<string, unknown> | null | undefined,
    viewer: ModerationPreviewViewer,
    mediaType: ModerationPreviewMediaType,
): ModerationPreviewAccessResult {
    if (!record) {
        return { ok: false, code: "NOT_FOUND", error: `${mediaType === "song" ? "Song" : "Video"} not found.` };
    }
    const state = normalizeCatalogModerationState(record.moderation_state);
    if (state === "clear") {
        return {
            ok: false,
            code: "USE_STANDARD_PLAYBACK",
            error: "Clear catalog media must use standard playback routes.",
        };
    }
    if (!viewer.userId) {
        return { ok: false, code: "AUTH_REQUIRED", error: "Authentication is required." };
    }
    const ownerId = String(record.user_id || record.userId || "").trim();
    const isOwner = Boolean(ownerId && viewer.userId === ownerId);
    if (state === "takedown_pending") {
        if (viewer.isAdmin) return { ok: true, reason: "held_admin" };
        if (isOwner) return { ok: true, reason: "held_owner" };
        return { ok: false, code: "FORBIDDEN", error: "Moderation preview is not permitted." };
    }
    if (state === "removed") {
        if (viewer.isAdmin) return { ok: true, reason: "removed_admin" };
        return { ok: false, code: "FORBIDDEN", error: "Moderation preview is not permitted." };
    }
    return { ok: false, code: "NOT_FOUND", error: `${mediaType === "song" ? "Song" : "Video"} not found.` };
}

export async function resolveModerationPreviewViewer(request: Request): Promise<ModerationPreviewViewer> {
    const token = getBearerToken(request);
    if (!token) {
        return { userId: "", isAdmin: false };
    }
    const resolved = await resolveStrictRequestUserId(request, {});
    if (!resolved.userId || !isUuid(resolved.userId)) {
        return { userId: "", isAdmin: false };
    }
    return {
        userId: resolved.userId,
        isAdmin: await isAdminUserId(resolved.userId),
    };
}

export function logModerationMediaPreviewAccess(input: {
    route: string;
    mediaType: ModerationPreviewMediaType;
    mediaId: string;
    viewerUserId: string;
    moderationState: string;
    reason: string;
}) {
    console.info("[moderation-media-preview]", {
        route: input.route,
        mediaType: input.mediaType,
        mediaId: input.mediaId,
        viewerUserId: input.viewerUserId,
        moderationState: input.moderationState,
        reason: input.reason,
        auditedAt: new Date().toISOString(),
    });
}
