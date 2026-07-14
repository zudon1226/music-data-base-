import { NextResponse } from "next/server";
import { getErrorMessage, getSupabaseLibraryClient } from "@/lib/server-supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FULL_SELECT =
    "id,title,description,artist_name,artist_id,producer,producer_name,producer_id,producer_profile_id,beat_id,album_id,category,video_url,cover_url,storage_path,thumbnail_url,video_codec,audio_codec,mobile_compatible,views,likes,created_at,user_id";

const SELECT_FALLBACKS = [
    "id,title,description,artist_name,artist_id,producer,producer_name,producer_id,producer_profile_id,beat_id,album_id,category,video_url,cover_url,storage_path,thumbnail_url,video_codec,audio_codec,mobile_compatible,views,likes,created_at",
    "id,title,description,album_id,category,video_url,storage_path,thumbnail_url,video_codec,audio_codec,mobile_compatible,views,likes,created_at,user_id",
    "id,title,description,artist_name,artist_id,producer,producer_name,producer_id,producer_profile_id,beat_id,category,video_url,cover_url,storage_path,thumbnail_url,video_codec,audio_codec,mobile_compatible,views,likes,created_at,user_id",
    "id,title,description,artist_name,artist_id,producer,producer_name,producer_id,producer_profile_id,beat_id,album_id,category,video_url,cover_url,storage_path,thumbnail_url,views,likes,created_at,user_id",
    "id,title,description,category,video_url,storage_path,thumbnail_url,views,likes,created_at,user_id",
    "id,title,video_url,storage_path,thumbnail_url,created_at",
] as const;

function jsonResponse(body: Record<string, unknown>, status = 200) {
    return NextResponse.json(body, { status });
}

function isUuid(value: string) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function getSupabaseVideoPublicUrl(storagePath: string) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/+$/, "")
        || "https://aehuszoadgqtbkxsliyy.supabase.co";
    const cleanPath = normalizeVideoStoragePath(storagePath);
    if (!supabaseUrl || !cleanPath) return "";
    return `${supabaseUrl}/storage/v1/object/public/videos/${cleanPath.split("/").map(encodeURIComponent).join("/")}`;
}

function getVideoStoragePathFromPublicUrl(value: string) {
    try {
        const url = new URL(value.trim());
        const marker = "/storage/v1/object/public/videos/";
        const markerIndex = url.pathname.indexOf(marker);
        if (markerIndex < 0) return "";
        return decodeURIComponent(url.pathname.slice(markerIndex + marker.length));
    }
    catch {
        return "";
    }
}

function normalizeVideoStoragePath(value: string) {
    let cleanPath = (getVideoStoragePathFromPublicUrl(value) || value).trim().replace(/^\/+/, "");
    cleanPath = cleanPath.replace(/^videos\/+/i, "");
    cleanPath = cleanPath.replace(/^public\/videos\/+/i, "");
    cleanPath = cleanPath.replace(/^object\/public\/videos\/+/i, "");
    cleanPath = cleanPath.replace(/^storage-(?=\d{10,}-)/i, "");
    return cleanPath;
}

function isLikelyStoragePath(value: string) {
    const trimmed = value.trim();
    return Boolean(
        trimmed
        && !/^https?:\/\//i.test(trimmed)
        && !trimmed.startsWith("blob:")
        && !trimmed.startsWith("data:")
        && !trimmed.startsWith("/"),
    );
}

function isPublicSupabaseVideoUrl(value: string) {
    try {
        const url = new URL(value.trim());
        return url.protocol === "https:"
            && url.hostname.endsWith(".supabase.co")
            && url.pathname.toLowerCase().includes("/storage/v1/object/public/videos/");
    }
    catch {
        return false;
    }
}

function isBlockedVideoPlaybackUrl(value: string) {
    const trimmed = value.trim();
    if (!trimmed) return true;
    if (trimmed.includes("/api/video-upload") || trimmed.includes("/api/upload-video")) return true;
    try {
        const url = new URL(trimmed);
        const path = url.pathname.toLowerCase();
        return path.includes("/storage/v1/object/sign/")
            || path.includes("/storage/v1/object/upload/")
            || path.includes("/storage/v1/upload/");
    }
    catch {
        return false;
    }
}

function normalizeVideoUrl(row: Record<string, unknown>) {
    const videoUrl = typeof row.video_url === "string" ? row.video_url.trim() : "";
    const storagePath = typeof row.storage_path === "string" ? row.storage_path.trim() : "";
    if (videoUrl) {
        if (isPublicSupabaseVideoUrl(videoUrl)) {
            return getSupabaseVideoPublicUrl(storagePath || videoUrl);
        }
        if (isLikelyStoragePath(videoUrl)) {
            return getSupabaseVideoPublicUrl(videoUrl);
        }
        if (!isBlockedVideoPlaybackUrl(videoUrl)) {
            return videoUrl;
        }
    }
    if (storagePath) {
        return getSupabaseVideoPublicUrl(storagePath);
    }
    return videoUrl;
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
        lastError = result.error;
        console.warn("[api/videos] select fallback:", getErrorMessage(result.error));
    }

    throw lastError || new Error("Could not load videos from Supabase.");
}

/**
 * Shallow storage recovery only — never recursively walk owner folders.
 * Recursive listing previously stalled the Video Library request.
 */
async function listShallowStorageVideos() {
    const supabase = getSupabaseLibraryClient();
    const listed = await withTimeout(
        Promise.resolve(
            supabase.storage.from("videos").list("", {
                limit: 200,
                sortBy: { column: "updated_at", order: "desc" },
            }),
        ),
        5_000,
        "[api/videos] storage.list",
    );
    if (listed.error) {
        console.error("[api/videos] storage fallback failed:", listed.error);
        return [] as Record<string, unknown>[];
    }

    const rows: Record<string, unknown>[] = [];
    for (const item of listed.data || []) {
        if (!item?.name || item.name === ".emptyFolderPlaceholder") continue;
        const size = Number(item.metadata?.size || 0);
        const isFolder = !item.id && !size && !item.metadata?.mimetype;
        if (isFolder) continue;
        if (!/\.(mp4|webm|mov|m4v)$/i.test(item.name)) continue;
        const path = item.name;
        rows.push({
            id: `storage-${path}`,
            title: path.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim() || "Recovered video",
            description: "Recovered from Supabase video storage.",
            artist_name: "Recovered Upload",
            category: "Recovered Video",
            video_url: getSupabaseVideoPublicUrl(path),
            storage_path: path,
            thumbnail_url: "",
            views: 0,
            likes: 0,
            created_at: item.updated_at || item.created_at || new Date().toISOString(),
            user_id: "",
            recovered_from_storage: true,
        });
    }
    return rows;
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
            console.error("[api/videos] database load failed:", error);
            rows = [];
        }

        if (rows.length === 0) {
            rows = await listShallowStorageVideos();
        }

        const videos = rows.map((video) => ({
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
