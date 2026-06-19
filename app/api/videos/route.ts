import { NextResponse } from "next/server";
import { getErrorMessage, getSupabaseServerClient } from "@/lib/server-supabase";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
function jsonResponse(body: Record<string, unknown>, status = 200) {
    return NextResponse.json(body, { status });
}
function isUuid(value: string) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
function getSupabaseVideoPublicUrl(storagePath: string) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/+$/, "");
    const cleanPath = normalizeVideoStoragePath(storagePath);
    if (!supabaseUrl || !cleanPath)
        return "";
    return `${supabaseUrl}/storage/v1/object/public/videos/${cleanPath.split("/").map(encodeURIComponent).join("/")}`;
}
function getVideoStoragePathFromPublicUrl(value: string) {
    try {
        const url = new URL(value.trim());
        const marker = "/storage/v1/object/public/videos/";
        const markerIndex = url.pathname.indexOf(marker);
        if (markerIndex < 0)
            return "";
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
    return Boolean(trimmed && !/^https?:\/\//i.test(trimmed) && !trimmed.startsWith("blob:") && !trimmed.startsWith("data:") && !trimmed.startsWith("/"));
}
function isPublicSupabaseVideoUrl(value: string) {
    try {
        const url = new URL(value.trim());
        return url.protocol === "https:" &&
            url.hostname.endsWith(".supabase.co") &&
            url.pathname.toLowerCase().includes("/storage/v1/object/public/videos/");
    }
    catch {
        return false;
    }
}
function isBlockedVideoPlaybackUrl(value: string) {
    const trimmed = value.trim();
    if (!trimmed)
        return true;
    if (trimmed.includes("/api/video-upload") || trimmed.includes("/api/upload-video"))
        return true;
    try {
        const url = new URL(trimmed);
        const path = url.pathname.toLowerCase();
        return path.includes("/storage/v1/object/sign/") || path.includes("/storage/v1/object/upload/") || path.includes("/storage/v1/upload/");
    }
    catch {
        return false;
    }
}
function normalizeVideoUrl(row: Record<string, unknown>) {
    const videoUrl = typeof row.video_url === "string" ? row.video_url.trim() : "";
    const storagePath = typeof row.storage_path === "string" ? row.storage_path.trim() : "";
    if (videoUrl) {
        if (isPublicSupabaseVideoUrl(videoUrl))
            return getSupabaseVideoPublicUrl(storagePath || videoUrl);
        if (isLikelyStoragePath(videoUrl))
            return getSupabaseVideoPublicUrl(videoUrl);
        if (!isBlockedVideoPlaybackUrl(videoUrl))
            return videoUrl;
    }
    if (storagePath)
        return getSupabaseVideoPublicUrl(storagePath);
    console.warn("[api/videos] video has no playable URL", {
        id: row.id,
        title: row.title,
        video_url: videoUrl,
        storage_path: storagePath,
    });
    return videoUrl;
}
function makeStorageVideoTitle(path: string) {
    const fileName = path.split("/").filter(Boolean).pop() || "Recovered video";
    return fileName
        .replace(/\.[^.]+$/, "")
        .replace(/^[0-9a-f-]{8,}-/i, "")
        .replace(/^\d{10,}-/, "")
        .replace(/[-_]+/g, " ")
        .replace(/\s+/g, " ")
        .trim() || "Recovered video";
}
async function listStorageVideos(supabase: ReturnType<typeof getSupabaseServerClient>, prefix = ""): Promise<Record<string, unknown>[]> {
    const { data, error } = await supabase.storage.from("videos").list(prefix, {
        limit: 1000,
        sortBy: { column: "updated_at", order: "desc" },
    });
    if (error) {
        console.error("[api/videos] storage fallback failed:", error);
        return [];
    }
    const rows: Record<string, unknown>[] = [];
    for (const item of data || []) {
        const path = prefix ? `${prefix}/${item.name}` : item.name;
        const size = Number(item.metadata?.size || 0);
        const isFolder = !item.id && !size && !item.metadata?.mimetype;
        if (isFolder) {
            rows.push(...await listStorageVideos(supabase, path));
            continue;
        }
        if (item.name === ".emptyFolderPlaceholder")
            continue;
        rows.push({
            id: `storage-${path}`,
            title: makeStorageVideoTitle(path),
            description: "Recovered from Supabase video storage.",
            artist_name: "Recovered Upload",
            artist_id: "",
            producer: "",
            producer_name: "",
            producer_id: "",
            producer_profile_id: "",
            beat_id: "",
            album_id: "",
            category: "Recovered Video",
            video_url: getSupabaseVideoPublicUrl(path),
            cover_url: "",
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
export async function GET(request: Request) {
    try {
        const supabase = getSupabaseServerClient();
        const initialResult = await supabase
            .from("videos")
            .select("id,title,description,artist_name,artist_id,producer,producer_name,producer_id,producer_profile_id,beat_id,album_id,category,video_url,cover_url,storage_path,thumbnail_url,video_codec,audio_codec,mobile_compatible,views,likes,created_at,user_id")
            .order("created_at", { ascending: false });
        let data = initialResult.data as Record<string, unknown>[] | null;
        let error = initialResult.error;
        if (error && getErrorMessage(error).toLowerCase().includes("user_id")) {
            const fallback = await supabase
                .from("videos")
                .select("id,title,description,artist_name,artist_id,producer,producer_name,producer_id,producer_profile_id,beat_id,album_id,category,video_url,cover_url,storage_path,thumbnail_url,video_codec,audio_codec,mobile_compatible,views,likes,created_at")
                .order("created_at", { ascending: false });
            data = fallback.data as Record<string, unknown>[] | null;
            error = fallback.error;
        }
        if (error && /producer|artist|cover_url|beat_id/i.test(getErrorMessage(error))) {
            const fallback = await supabase
                .from("videos")
                .select("id,title,description,album_id,category,video_url,storage_path,thumbnail_url,video_codec,audio_codec,mobile_compatible,views,likes,created_at,user_id")
                .order("created_at", { ascending: false });
            data = fallback.data as Record<string, unknown>[] | null;
            error = fallback.error;
        }
        if (error && getErrorMessage(error).toLowerCase().includes("album_id")) {
            const fallback = await supabase
                .from("videos")
                .select("id,title,description,artist_name,artist_id,producer,producer_name,producer_id,producer_profile_id,beat_id,category,video_url,cover_url,storage_path,thumbnail_url,video_codec,audio_codec,mobile_compatible,views,likes,created_at,user_id")
                .order("created_at", { ascending: false });
            data = fallback.data as Record<string, unknown>[] | null;
            error = fallback.error;
        }
        if (error && /video_codec|audio_codec|mobile_compatible/i.test(getErrorMessage(error))) {
            const fallback = await supabase
                .from("videos")
                .select("id,title,description,artist_name,artist_id,producer,producer_name,producer_id,producer_profile_id,beat_id,album_id,category,video_url,cover_url,storage_path,thumbnail_url,views,likes,created_at,user_id")
                .order("created_at", { ascending: false });
            data = fallback.data as Record<string, unknown>[] | null;
            error = fallback.error;
        }
        if (error && getErrorMessage(error).toLowerCase().includes("album_id")) {
            const fallback = await supabase
                .from("videos")
                .select("id,title,description,artist_name,artist_id,producer,producer_name,producer_id,producer_profile_id,beat_id,category,video_url,cover_url,storage_path,thumbnail_url,views,likes,created_at,user_id")
                .order("created_at", { ascending: false });
            data = fallback.data as Record<string, unknown>[] | null;
            error = fallback.error;
        }
        if (error) {
            console.error("[api/videos] load failed:", error);
            return jsonResponse({ error: getErrorMessage(error) }, 500);
        }
        let videos: Record<string, unknown>[] = (data || []).map((video) => ({
            ...video,
            video_url: normalizeVideoUrl(video),
        }));
        if (videos.length === 0) {
            videos = await listStorageVideos(supabase);
        }
        const userId = new URL(request.url).searchParams.get("userId")?.trim() || "";
        if (!userId || !isUuid(userId) || videos.length === 0) {
            return jsonResponse({ videos });
        }
        const videoIds = videos.map((video) => video.id).filter(Boolean);
        const { data: likes, error: likesError } = await supabase
            .from("video_likes")
            .select("video_id")
            .eq("user_id", userId)
            .in("video_id", videoIds);
        if (likesError) {
            return jsonResponse({ videos });
        }
        const likedIds = new Set((likes || []).map((like) => like.video_id));
        return jsonResponse({
            videos: videos.map((video) => ({
                ...video,
                liked_by_user: likedIds.has(video.id),
            })),
        });
    }
    catch (error) {
        console.error("[api/videos] server error:", error);
        return jsonResponse({ error: getErrorMessage(error) }, 500);
    }
}
