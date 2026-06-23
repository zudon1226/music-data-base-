import { NextResponse } from "next/server";
import { getSessionTokensFromRecord, requireMatchingUserId } from "@/lib/request-auth";
import { getErrorMessage, getSupabaseLibraryClient, isUuid } from "@/lib/server-supabase";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const LIBRARY_SAVE_TABLE = "library_saves";
function jsonResponse(body: Record<string, unknown>, status = 200) {
    return NextResponse.json(body, { status });
}
function normalizeItemType(value: unknown) {
    if (value === "album")
        return "album";
    return value === "video" ? "video" : "song";
}
function isMissingTable(error: unknown) {
    const message = getErrorMessage(error).toLowerCase();
    const code = error && typeof error === "object" ? String((error as Record<string, unknown>).code || "") : "";
    return code === "42P01" || message.includes("library_saves") || message.includes("does not exist");
}
export async function GET(request: Request) {
    try {
        const userId = new URL(request.url).searchParams.get("userId")?.trim() || "";
        if (!userId || !isUuid(userId)) {
            return jsonResponse({
                songIds: [],
                videoIds: [],
                albumIds: [],
                songs: [],
                videos: [],
                albums: [],
                savedSongs: [],
                savedVideos: [],
                savedAlbums: [],
                saveCount: 0,
            });
        }
        const auth = await requireMatchingUserId(request, "/api/library-saves", userId);
        if (!auth.ok) {
            return jsonResponse({
                error: auth.error,
                songIds: [],
                videoIds: [],
                albumIds: [],
                songs: [],
                videos: [],
                albums: [],
                savedSongs: [],
                savedVideos: [],
                savedAlbums: [],
                saveCount: 0,
            }, auth.status);
        }
        const supabase = getSupabaseLibraryClient();
        const savesResult = await supabase
            .from(LIBRARY_SAVE_TABLE)
            .select("id,user_id,item_id,item_type,created_at")
            .eq("user_id", userId)
            .order("created_at", { ascending: false });
        const saves = (savesResult.data || []) as Record<string, unknown>[];
        if (savesResult.error) {
            console.error("LIBRARY ERROR:", savesResult.error);
            return jsonResponse({
                error: getErrorMessage(savesResult.error),
                rows: [],
                songIds: [],
                videoIds: [],
                albumIds: [],
                songs: [],
                videos: [],
                albums: [],
                saveCount: 0,
                setupRequired: isMissingTable(savesResult.error),
            }, isMissingTable(savesResult.error) ? 409 : 500);
        }
        for (const row of saves) {
        }
        const splitIds: {
            songIds: string[];
            videoIds: string[];
            albumIds: string[];
        } = {
            songIds: [],
            videoIds: [],
            albumIds: [],
        };
        saves.forEach((row) => {
            const itemType = String(row.item_type || "").trim().toLowerCase();
            const itemId = String(row.item_id || "").trim();
            if (!itemId || !isUuid(itemId))
                return;
            if (itemType === "video")
                splitIds.videoIds.push(itemId);
            else if (itemType === "album")
                splitIds.albumIds.push(itemId);
            else if (itemType === "song")
                splitIds.songIds.push(itemId);
        });
        const uniqueSongIds = [...new Set(splitIds.songIds)];
        const uniqueVideoIds = [...new Set(splitIds.videoIds)];
        const uniqueAlbumIds = [...new Set(splitIds.albumIds)];
        const songsResult = uniqueSongIds.length > 0 ? await supabase.from("songs").select("*").in("id", uniqueSongIds) : { data: [], error: null };
        if (songsResult.error) {
            console.error("LIBRARY ERROR:", songsResult.error);
            return jsonResponse({ error: getErrorMessage(songsResult.error), rows: saves, songIds: uniqueSongIds, videoIds: uniqueVideoIds, albumIds: uniqueAlbumIds, songs: [], videos: [], albums: [], savedSongs: [], savedVideos: [], savedAlbums: [], saveCount: saves.length }, 500);
        }
        const videosResult = uniqueVideoIds.length > 0 ? await supabase.from("videos").select("*").in("id", uniqueVideoIds) : { data: [], error: null };
        if (videosResult.error) {
            console.error("LIBRARY ERROR:", videosResult.error);
            return jsonResponse({ error: getErrorMessage(videosResult.error), rows: saves, songIds: uniqueSongIds, videoIds: uniqueVideoIds, albumIds: uniqueAlbumIds, songs: [], videos: [], albums: [], savedSongs: [], savedVideos: [], savedAlbums: [], saveCount: saves.length }, 500);
        }
        const albumsResult = uniqueAlbumIds.length > 0 ? await supabase.from("albums").select("*").in("id", uniqueAlbumIds) : { data: [], error: null };
        if (albumsResult.error) {
            console.error("LIBRARY ERROR:", albumsResult.error);
            return jsonResponse({ error: getErrorMessage(albumsResult.error), rows: saves, songIds: uniqueSongIds, videoIds: uniqueVideoIds, albumIds: uniqueAlbumIds, songs: [], videos: [], albums: [], savedSongs: [], savedVideos: [], savedAlbums: [], saveCount: saves.length }, 500);
        }
        const albumItemsResult = uniqueAlbumIds.length > 0
            ? await supabase
                .from("album_items")
                .select("album_id,item_id,item_type,position,created_at")
                .in("album_id", uniqueAlbumIds)
                .order("position", { ascending: true })
            : { data: [], error: null };
        if (albumItemsResult.error) {
            console.error("LIBRARY ERROR:", albumItemsResult.error);
            return jsonResponse({ error: getErrorMessage(albumItemsResult.error), rows: saves, songIds: uniqueSongIds, videoIds: uniqueVideoIds, albumIds: uniqueAlbumIds, songs: [], videos: [], albums: [], savedSongs: [], savedVideos: [], savedAlbums: [], saveCount: saves.length }, 500);
        }
        const albumItemBuckets = new Map<string, {
            songIds: string[];
            videoIds: string[];
        }>();
        (albumItemsResult.data || []).forEach((item) => {
            const albumId = String(item.album_id || "");
            const itemId = String(item.item_id || "");
            if (!albumId || !itemId)
                return;
            const bucket = albumItemBuckets.get(albumId) || { songIds: [], videoIds: [] };
            if (item.item_type === "video")
                bucket.videoIds.push(itemId);
            else if (item.item_type === "song")
                bucket.songIds.push(itemId);
            albumItemBuckets.set(albumId, bucket);
        });
        const uniqueSongs = [...new Map((songsResult.data || []).map((song) => [String(song.id), song as Record<string, unknown>])).values()];
        const uniqueVideos = [...new Map((videosResult.data || []).map((video) => [String(video.id), video as Record<string, unknown>])).values()];
        const uniqueAlbums = [
            ...new Map((albumsResult.data || []).map((album) => {
                const albumId = String(album.id || "");
                const bucket = albumItemBuckets.get(albumId) || { songIds: [], videoIds: [] };
                return [
                    albumId,
                    {
                        ...(album as Record<string, unknown>),
                        songIds: bucket.songIds,
                        videoIds: bucket.videoIds,
                    },
                ];
            })).values(),
        ];
        return jsonResponse({
            rows: saves,
            songIds: uniqueSongIds,
            videoIds: uniqueVideoIds,
            albumIds: uniqueAlbumIds,
            songs: uniqueSongs,
            videos: uniqueVideos,
            albums: uniqueAlbums,
            savedSongs: uniqueSongs,
            savedVideos: uniqueVideos,
            savedAlbums: uniqueAlbums,
            saveCount: saves.length,
        });
    }
    catch (error) {
        console.error("LIBRARY ERROR:", error);
        return jsonResponse({ error: getErrorMessage(error), songIds: [], videoIds: [], albumIds: [], songs: [], videos: [], albums: [], savedSongs: [], savedVideos: [], savedAlbums: [], saveCount: 0 }, 500);
    }
}
export async function POST(request: Request) {
    try {
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const userId = typeof body.userId === "string" ? body.userId.trim() : "";
        const itemId = typeof body.itemId === "string" ? body.itemId.trim() : "";
        const itemType = normalizeItemType(body.itemType);
        if (!userId || !isUuid(userId))
            return jsonResponse({ error: "Log in before saving to Library." }, 401);
        const auth = await requireMatchingUserId(request, "/api/library-saves", userId, getSessionTokensFromRecord(body));
        if (!auth.ok) {
            return jsonResponse({ error: auth.error }, auth.status);
        }
        if (!itemId || !isUuid(itemId))
            return jsonResponse({ error: "Saved Library requires a real Supabase item id." }, 400);
        const supabase = getSupabaseLibraryClient();
        const payload = {
            user_id: userId,
            item_id: itemId,
            item_type: itemType,
            created_at: typeof body.createdAt === "string" ? body.createdAt : new Date().toISOString(),
        };
        const upsertResult = await supabase
            .from(LIBRARY_SAVE_TABLE)
            .upsert(payload, {
            onConflict: "user_id,item_id,item_type",
            ignoreDuplicates: true,
        })
            .select("id,user_id,item_id,item_type,created_at");
        const { data, error } = upsertResult;
        if (error) {
            console.error("SAVE INSERT ERROR:", error);
            return jsonResponse({ error: getErrorMessage(error) }, isMissingTable(error) ? 409 : 500);
        }
        const savedRow = data?.[0];
        if (savedRow) {
            return jsonResponse({ ok: true, row: savedRow });
        }
        const existingResult = await supabase
            .from(LIBRARY_SAVE_TABLE)
            .select("id,user_id,item_id,item_type,created_at")
            .eq("user_id", userId)
            .eq("item_id", itemId)
            .eq("item_type", itemType)
            .limit(1);
        if (existingResult.error) {
            console.error("SAVE INSERT ERROR:", existingResult.error);
            return jsonResponse({ error: getErrorMessage(existingResult.error) }, isMissingTable(existingResult.error) ? 409 : 500);
        }
        const existingRow = existingResult.data?.[0] || null;
        return jsonResponse({ ok: true, duplicate: true, row: existingRow });
    }
    catch (error) {
        console.error("SAVE INSERT ERROR:", error);
        return jsonResponse({ error: getErrorMessage(error) }, 500);
    }
}
export async function DELETE(request: Request) {
    try {
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const userId = typeof body.userId === "string" ? body.userId.trim() : "";
        const itemId = typeof body.itemId === "string" ? body.itemId.trim() : "";
        const itemType = normalizeItemType(body.itemType);
        if (!userId || !isUuid(userId))
            return jsonResponse({ error: "Log in before removing from Library." }, 401);
        const auth = await requireMatchingUserId(request, "/api/library-saves", userId, getSessionTokensFromRecord(body));
        if (!auth.ok) {
            return jsonResponse({ error: auth.error }, auth.status);
        }
        if (!itemId)
            return jsonResponse({ error: "Choose an item first." }, 400);
        const supabase = getSupabaseLibraryClient();
        const { error } = await supabase
            .from(LIBRARY_SAVE_TABLE)
            .delete()
            .eq("user_id", userId)
            .eq("item_id", itemId)
            .eq("item_type", itemType);
        if (error) {
            console.error("LIBRARY ERROR:", error);
            return jsonResponse({ error: getErrorMessage(error) }, isMissingTable(error) ? 409 : 500);
        }
        return jsonResponse({ ok: true });
    }
    catch (error) {
        console.error("LIBRARY ERROR:", error);
        return jsonResponse({ error: getErrorMessage(error) }, 500);
    }
}
