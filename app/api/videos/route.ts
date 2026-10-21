import { NextResponse } from "next/server";
import {
    filterPublicCatalogRows,
    isModerationHoldColumnError,
} from "@/lib/moderation-status.mjs";
import { getErrorMessage, getSupabaseLibraryClient } from "@/lib/server-supabase";
import { getVideoPlaybackUrl } from "@/lib/canonical-video";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FULL_SELECT =
    "id,title,description,artist_name,artist_id,producer,producer_name,producer_id,producer_profile_id,beat_id,album_id,category,video_url,cover_url,storage_path,thumbnail_url,video_codec,audio_codec,mobile_compatible,views,likes,created_at,user_id,moderation_state";

const MODERATION_HOLD_MIGRATION_MESSAGE =
    "Catalog moderation_state is not available until migration 202610172000 is applied.";

const SELECT_FALLBACKS = [
    "id,title,description,artist_name,artist_id,producer,producer_name,producer_id,producer_profile_id,beat_id,album_id,category,video_url,cover_url,storage_path,thumbnail_url,video_codec,audio_codec,mobile_compatible,views,likes,created_at,moderation_state",
    "id,title,description,album_id,category,video_url,storage_path,thumbnail_url,video_codec,audio_codec,mobile_compatible,views,likes,created_at,user_id,moderation_state",
    "id,title,description,artist_name,artist_id,producer,producer_name,producer_id,producer_profile_id,beat_id,category,video_url,cover_url,storage_path,thumbnail_url,video_codec,audio_codec,mobile_compatible,views,likes,created_at,user_id,moderation_state",
    "id,title,description,artist_name,artist_id,producer,producer_name,producer_id,producer_profile_id,beat_id,album_id,category,video_url,cover_url,storage_path,thumbnail_url,views,likes,created_at,user_id,moderation_state",
    "id,title,description,category,video_url,storage_path,thumbnail_url,views,likes,created_at,user_id,moderation_state",
    "id,title,video_url,storage_path,thumbnail_url,created_at,moderation_state",
] as const;

function jsonResponse(body: Record<string, unknown>, status = 200) {
    return NextResponse.json(body, { status });
}

function isUuid(value: string) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function normalizeVideoUrl(row: Record<string, unknown>) {
    return getVideoPlaybackUrl({
        video_url: row.video_url,
        videoUrl: row.video_url,
        storage_path: row.storage_path,
        storagePath: row.storage_path,
        playableUrl: row.playableUrl || row.video_url,
    });
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
        return await Promise.race([
            promise,
            new Promise<T>((_, reject) => {
                timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
            }),
        ]);
    }
    finally {
        if (timer) clearTimeout(timer);
    }
}

async function loadVideosFromDatabase() {
    const supabase = getSupabaseLibraryClient();
    const selects = [FULL_SELECT, ...SELECT_FALLBACKS];
    let lastError: unknown = null;

    for (const columns of selects) {
        const result = await withTimeout(
            Promise.resolve(
                supabase
                    .from("videos")
                    .select(columns)
                    .order("created_at", { ascending: false }),
            ),
            8_000,
            `[api/videos] select(${columns.split(",").length} cols)`,
        );
        if (!result.error) {
            return ((result.data || []) as unknown as Record<string, unknown>[]);
        }
        if (isModerationHoldColumnError(result.error)) {
            throw new Error(MODERATION_HOLD_MIGRATION_MESSAGE);
        }
        lastError = result.error;
        console.warn("[api/videos] select fallback:", getErrorMessage(result.error));
    }

    throw lastError || new Error("Could not load videos from Supabase.");
}

async function attachLikedByUser(videos: Record<string, unknown>[], userId: string) {
    if (!userId || !isUuid(userId) || videos.length === 0) {
        return videos;
    }
    try {
        const supabase = getSupabaseLibraryClient();
        const videoIds = videos
            .map((video) => String(video.id || "").trim())
            .filter((id) => id && isUuid(id));
        if (videoIds.length === 0) {
            return videos;
        }
        const likesResult = await withTimeout(
            Promise.resolve(
                supabase
                    .from("video_likes")
                    .select("video_id")
                    .eq("user_id", userId)
                    .in("video_id", videoIds),
            ),
            4_000,
            "[api/videos] video_likes",
        );
        if (likesResult.error) {
            console.warn("[api/videos] likes skipped:", getErrorMessage(likesResult.error));
            return videos;
        }
        const likedIds = new Set((likesResult.data || []).map((like) => like.video_id));
        return videos.map((video) => ({
            ...video,
            liked_by_user: likedIds.has(video.id),
        }));
    }
    catch (error) {
        console.warn("[api/videos] likes skipped:", getErrorMessage(error));
        return videos;
    }
}

export async function GET(request: Request) {
    try {
        let rows: Record<string, unknown>[] = [];
        try {
            rows = await loadVideosFromDatabase();
        }
        catch (error) {
            const message = getErrorMessage(error);
            if (message === MODERATION_HOLD_MIGRATION_MESSAGE) {
                return jsonResponse({ error: message, videos: [] }, 500);
            }
            console.error("[api/videos] database load failed:", error);
            return jsonResponse({ error: message, videos: [] }, 500);
        }

        const videos = filterPublicCatalogRows(rows).map((video) => ({
            ...video,
            video_url: normalizeVideoUrl(video),
        }));

        const userId = new URL(request.url).searchParams.get("userId")?.trim() || "";
        const withLikes = await attachLikedByUser(videos, userId);

        return jsonResponse({
            videos: withLikes,
            count: withLikes.length,
        });
    }
    catch (error) {
        console.error("[api/videos] server error:", error);
        return jsonResponse({ error: getErrorMessage(error), videos: [] }, 500);
    }
}
