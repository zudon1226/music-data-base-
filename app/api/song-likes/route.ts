import { NextResponse } from "next/server";
import { logRouteAuth, requireMatchingUserId } from "@/lib/request-auth";
import { getSupabaseLibraryClient } from "@/lib/server-supabase";
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
function isMissingSongLikesTableError(error: unknown) {
    const message = getErrorMessage(error).toLowerCase();
    const code = error && typeof error === "object" ? String((error as Record<string, unknown>).code || "") : "";
    return code === "42P01" || message.includes("song_likes") || message.includes("does not exist");
}
function isUuid(value: string) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
function getSupabaseServerClient() {
    return getSupabaseLibraryClient();
}
async function syncSongLikeCount(supabase: ReturnType<typeof getSupabaseServerClient>, songId: string) {
    const { count, error: countError } = await supabase
        .from("song_likes")
        .select("id", { count: "exact", head: true })
        .eq("song_id", songId);
    if (countError)
        throw countError;
    const likes = count || 0;
    if (!isUuid(songId))
        return likes;
    const { error: updateError } = await supabase.from("songs").update({ likes }).eq("id", songId);
    if (updateError)
        throw updateError;
    return likes;
}
export async function GET(request: Request) {
    try {
        const userId = new URL(request.url).searchParams.get("userId")?.trim() || "";
        if (!userId || !isUuid(userId))
            return jsonResponse({ likedSongIds: [] });
        const auth = await requireMatchingUserId(request, "/api/song-likes", userId);
        if (!auth.ok) {
            return jsonResponse({ error: auth.error, likedSongIds: [] }, auth.status);
        }
        const supabase = getSupabaseServerClient();
        const { data, error } = await supabase
            .from("song_likes")
            .select("song_id")
            .eq("user_id", userId)
            .order("created_at", { ascending: false });
        if (error) {
            if (isMissingSongLikesTableError(error)) {
                return jsonResponse({ likedSongIds: [], setupRequired: true, error: getErrorMessage(error) });
            }
            console.error("[api/song-likes] load failed:", error);
            return jsonResponse({ error: getErrorMessage(error) }, 500);
        }
        return jsonResponse({ likedSongIds: (data || []).map((row) => row.song_id).filter(Boolean) });
    }
    catch (error) {
        console.error("[api/song-likes] server error:", error);
        return jsonResponse({ error: getErrorMessage(error) }, 500);
    }
}
export async function POST(request: Request) {
    try {
        const body = (await request.json().catch(() => ({}))) as {
            songId?: unknown;
            userId?: unknown;
            like?: unknown;
        };
        const songId = typeof body.songId === "string" ? body.songId.trim() : "";
        const userId = typeof body.userId === "string" ? body.userId.trim() : "";
        if (!songId)
            return jsonResponse({ error: "Missing song id." }, 400);
        if (!userId || !isUuid(userId))
            return jsonResponse({ error: "Log in before liking songs." }, 401);
        const auth = await requireMatchingUserId(request, "/api/song-likes", userId);
        if (!auth.ok) {
            return jsonResponse({ error: auth.error }, auth.status);
        }
        const supabase = getSupabaseServerClient();
        if (body.like === false) {
            const { error } = await supabase.from("song_likes").delete().eq("song_id", songId).eq("user_id", userId);
            if (error) {
                if (isMissingSongLikesTableError(error))
                    return jsonResponse({ error: "Song likes table is not ready yet." }, 500);
                console.error("[api/song-likes] unlike failed:", error);
                return jsonResponse({ error: getErrorMessage(error) }, 500);
            }
            const likes = await syncSongLikeCount(supabase, songId);
            return jsonResponse({ ok: true, likedByUser: false, likes });
        }
        const { error } = await supabase.from("song_likes").insert({ song_id: songId, user_id: userId });
        const duplicateLike = error &&
            (error.code === "23505" ||
                String(error.message || "").toLowerCase().includes("duplicate") ||
                String(error.message || "").toLowerCase().includes("unique"));
        if (error && !duplicateLike) {
            if (isMissingSongLikesTableError(error))
                return jsonResponse({ error: "Song likes table is not ready yet." }, 500);
            console.error("[api/song-likes] like failed:", error);
            return jsonResponse({ error: getErrorMessage(error) }, 500);
        }
        const likes = await syncSongLikeCount(supabase, songId);
        return jsonResponse({ ok: true, likedByUser: true, duplicateLike: Boolean(duplicateLike), likes });
    }
    catch (error) {
        console.error("[api/song-likes] post server error:", error);
        return jsonResponse({ error: getErrorMessage(error) }, 500);
    }
}
