import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
function jsonResponse(body: Record<string, unknown>, status = 200) {
    return NextResponse.json(body, { status });
}
function getErrorMessage(error: unknown) {
    if (error instanceof Error)
        return error.message;
    if (typeof error === "string")
        return error;
    if (error && typeof error === "object") {
        const record = error as Record<string, unknown>;
        return String(record.message || record.error || JSON.stringify(record));
    }
    return "Unknown server error";
}
function getSupabaseServerClient() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    if (!supabaseUrl) {
        throw new Error("NEXT_PUBLIC_SUPABASE_URL is missing.");
    }
    if (!serviceRoleKey || serviceRoleKey === "your_service_role_key_here") {
        throw new Error("SUPABASE_SERVICE_ROLE_KEY is missing or still set to the placeholder value.");
    }
    return createClient(supabaseUrl, serviceRoleKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
        },
    });
}
function isUuid(value: string) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
export async function GET(request: Request) {
    try {
        const supabase = getSupabaseServerClient();
        const initialResult = await supabase
            .from("videos")
            .select("id,title,description,artist_name,artist_id,producer,producer_name,producer_id,producer_profile_id,beat_id,album_id,category,video_url,cover_url,storage_path,thumbnail_url,views,likes,created_at,user_id")
            .order("created_at", { ascending: false });
        let data = initialResult.data as Record<string, unknown>[] | null;
        let error = initialResult.error;
        if (error && getErrorMessage(error).toLowerCase().includes("user_id")) {
            const fallback = await supabase
                .from("videos")
                .select("id,title,description,artist_name,artist_id,producer,producer_name,producer_id,producer_profile_id,beat_id,album_id,category,video_url,cover_url,storage_path,thumbnail_url,views,likes,created_at")
                .order("created_at", { ascending: false });
            data = fallback.data as Record<string, unknown>[] | null;
            error = fallback.error;
        }
        if (error && /producer|artist|cover_url|beat_id/i.test(getErrorMessage(error))) {
            const fallback = await supabase
                .from("videos")
                .select("id,title,description,album_id,category,video_url,storage_path,thumbnail_url,views,likes,created_at,user_id")
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
        const videos = data || [];
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
