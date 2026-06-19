import { NextResponse } from "next/server";
import { getErrorMessage, getSupabaseServerClient } from "@/lib/server-supabase";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
function jsonResponse(body: Record<string, unknown>, status = 200) {
    return NextResponse.json(body, { status });
}
export async function GET() {
    try {
        const supabase = getSupabaseServerClient();
        const initialResult = await supabase
            .from("songs")
            .select("id,title,artist,producer,producer_id,beat_id,album_id,category,type,audio_url,storage_path,cover_url,avatar_url,duration,plays,likes,created_at,user_id")
            .order("created_at", { ascending: false });
        let data = initialResult.data as Record<string, unknown>[] | null;
        let error = initialResult.error;
        if (error && getErrorMessage(error).toLowerCase().includes("user_id")) {
            const fallback = await supabase
                .from("songs")
                .select("id,title,artist,producer,producer_id,beat_id,album_id,category,type,audio_url,storage_path,cover_url,avatar_url,duration,plays,likes,created_at")
                .order("created_at", { ascending: false });
            data = fallback.data as Record<string, unknown>[] | null;
            error = fallback.error;
        }
        if (error && /producer|beat_id/i.test(getErrorMessage(error))) {
            const fallback = await supabase
                .from("songs")
                .select("id,title,artist,album_id,category,type,audio_url,storage_path,cover_url,avatar_url,duration,plays,likes,created_at,user_id")
                .order("created_at", { ascending: false });
            data = fallback.data as Record<string, unknown>[] | null;
            error = fallback.error;
        }
        if (error && getErrorMessage(error).toLowerCase().includes("album_id")) {
            const fallback = await supabase
                .from("songs")
                .select("id,title,artist,producer,producer_id,beat_id,category,type,audio_url,storage_path,cover_url,avatar_url,duration,plays,likes,created_at,user_id")
                .order("created_at", { ascending: false });
            data = fallback.data as Record<string, unknown>[] | null;
            error = fallback.error;
        }
        if (error && getErrorMessage(error).toLowerCase().includes("artist")) {
            const fallback = await supabase
                .from("songs")
                .select("id,title,description,producer,producer_id,beat_id,album_id,category,type,audio_url,storage_path,cover_url,avatar_url,duration,plays,likes,created_at")
                .order("created_at", { ascending: false });
            data = fallback.data as Record<string, unknown>[] | null;
            error = fallback.error;
        }
        if (error && getErrorMessage(error).toLowerCase().includes("description")) {
            const fallback = await supabase
                .from("songs")
                .select("id,title,album_id,category,type,audio_url,storage_path,cover_url,avatar_url,duration,plays,likes,created_at")
                .order("created_at", { ascending: false });
            data = fallback.data as Record<string, unknown>[] | null;
            error = fallback.error;
        }
        if (error) {
            console.error("[api/songs] load failed:", error);
            return jsonResponse({ error: getErrorMessage(error) }, 500);
        }
        return jsonResponse({ songs: data || [] });
    }
    catch (error) {
        console.error("[api/songs] server error:", error);
        return jsonResponse({ error: getErrorMessage(error) }, 500);
    }
}
