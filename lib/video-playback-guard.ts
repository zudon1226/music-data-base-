import { isAdminUserId } from "@/lib/admin-auth";
import { normalizeVideoStoragePath } from "@/lib/canonical-video";
import { bindCatalogObjectPath } from "@/lib/guarded-playback-url.mjs";
import { isCatalogItemPubliclyPlayable, isModerationHoldColumnError } from "@/lib/moderation-status.mjs";
import { getBearerToken, resolveStrictRequestUserId } from "@/lib/request-auth";
import { getErrorMessage, getSupabaseServerClient, isUuid } from "@/lib/server-supabase";

export type VideoPlaybackRow = {
    id: string;
    user_id: string | null;
    storage_path: string | null;
    video_url: string | null;
    moderation_state?: string | null;
};

export type VideoPlaybackViewer = {
    userId: string;
    isAdmin: boolean;
};

export const VIDEO_MODERATION_UNAVAILABLE_CODE = "MODERATION_UNAVAILABLE";

export const MODERATION_HOLD_MIGRATION_MESSAGE =
    "Catalog moderation_state is not available until migration 202610172000 is applied.";

export class VideoPlaybackGuardError extends Error {
    readonly code = VIDEO_MODERATION_UNAVAILABLE_CODE;

    constructor(message: string = MODERATION_HOLD_MIGRATION_MESSAGE) {
        super(message);
        this.name = "VideoPlaybackGuardError";
    }
}

const VIDEO_PLAYBACK_SELECT = "id,user_id,storage_path,video_url,moderation_state";

export function evaluateVideoPlaybackAccess(
    video: VideoPlaybackRow | null | undefined,
    viewer: VideoPlaybackViewer,
) {
    void viewer;
    if (!video) {
        return { ok: false as const, code: "NOT_FOUND" as const, error: "Video not found." };
    }
    if (!isCatalogItemPubliclyPlayable(video as Record<string, unknown>)) {
        return { ok: false as const, code: "NOT_FOUND" as const, error: "Video not found." };
    }
    return { ok: true as const, video };
}

export async function resolveVideoPlaybackViewer(request: Request): Promise<VideoPlaybackViewer> {
    const token = getBearerToken(request);
    if (!token) {
        return { userId: "", isAdmin: false };
    }
    const resolved = await resolveStrictRequestUserId(request, {});
    if (!resolved.userId) {
        return { userId: "", isAdmin: false };
    }
    const isAdmin = await isAdminUserId(resolved.userId);
    return { userId: resolved.userId, isAdmin };
}

async function loadVideoById(
    supabase: ReturnType<typeof getSupabaseServerClient>,
    videoId: string,
): Promise<VideoPlaybackRow | null> {
    const primary = await supabase
        .from("videos")
        .select(VIDEO_PLAYBACK_SELECT)
        .eq("id", videoId)
        .maybeSingle();
    if (primary.error) {
        if (isModerationHoldColumnError(primary.error)) {
            throw new VideoPlaybackGuardError();
        }
        throw new Error(getErrorMessage(primary.error));
    }
    return primary.data ? (primary.data as VideoPlaybackRow) : null;
}

export type CatalogVideoResolution = {
    video: VideoPlaybackRow | null;
    storagePath: string;
    pathError: "MISSING_PATH" | "PATH_MISMATCH" | "AMBIGUOUS" | null;
};

function requestedVideoObjectPath(rawPath: string) {
    const normalized = normalizeVideoStoragePath(rawPath);
    if (!normalized || /^https?:\/\//i.test(normalized) || normalized.startsWith("blob:") || normalized.startsWith("data:")) {
        return "";
    }
    return normalized;
}

function catalogVideoObjectPath(video: VideoPlaybackRow) {
    const fromStorage = requestedVideoObjectPath(video.storage_path || "");
    if (fromStorage) return fromStorage;
    return requestedVideoObjectPath(video.video_url || "");
}

export async function resolveCatalogVideoForPlayback(
    supabase: ReturnType<typeof getSupabaseServerClient>,
    input: { videoId?: string; rawPath?: string },
): Promise<CatalogVideoResolution> {
    const videoId = String(input.videoId || "").trim();
    const clientPath = requestedVideoObjectPath(input.rawPath || "");

    if (videoId && isUuid(videoId)) {
        const video = await loadVideoById(supabase, videoId);
        if (!video) {
            return { video: null, storagePath: "", pathError: null };
        }
        const bound = bindCatalogObjectPath(catalogVideoObjectPath(video), clientPath);
        if (!bound.ok) {
            return { video, storagePath: "", pathError: bound.code };
        }
        return { video, storagePath: bound.storagePath, pathError: null };
    }

    if (!clientPath) {
        return { video: null, storagePath: "", pathError: "MISSING_PATH" };
    }

    const byPath = await supabase
        .from("videos")
        .select(VIDEO_PLAYBACK_SELECT)
        .eq("storage_path", clientPath)
        .limit(2);
    if (byPath.error) {
        if (isModerationHoldColumnError(byPath.error)) {
            throw new VideoPlaybackGuardError();
        }
        throw new Error(getErrorMessage(byPath.error));
    }
    const rows = (byPath.data || []) as VideoPlaybackRow[];
    if (rows.length !== 1) {
        return { video: null, storagePath: "", pathError: rows.length > 1 ? "AMBIGUOUS" : null };
    }
    const bound = bindCatalogObjectPath(catalogVideoObjectPath(rows[0]), clientPath);
    if (!bound.ok) {
        return { video: rows[0], storagePath: "", pathError: bound.code };
    }
    return { video: rows[0], storagePath: bound.storagePath, pathError: null };
}
