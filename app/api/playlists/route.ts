import { NextResponse } from "next/server";
import { getErrorMessage, getSupabaseLibraryClient } from "@/lib/server-supabase";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
function jsonResponse(body: Record<string, unknown>, status = 200) {
    return NextResponse.json(body, { status });
}
function isUuid(value: string) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
function isMissingColumn(error: unknown, columnName: string) {
    const message = getErrorMessage(error).toLowerCase();
    return message.includes(columnName.toLowerCase()) || message.includes("schema cache") || message.includes("column");
}
function normalizePlaylistType(value: unknown) {
    return value === "song" || value === "video" || value === "mixed" ? value : "mixed";
}
function inferPlaylistType(nameValue: unknown, songIds: string[], videoIds: string[], playlistTypeValue?: unknown) {
    if (playlistTypeValue === "song" || playlistTypeValue === "video" || playlistTypeValue === "mixed") {
        return normalizePlaylistType(playlistTypeValue);
    }
    const name = typeof nameValue === "string" ? nameValue.trim().toLowerCase() : "";
    if (name === "videos" || name === "video" || name.includes("video playlist"))
        return "video";
    if (name === "songs" || name === "song" || name.includes("song playlist"))
        return "song";
    if (videoIds.length > 0 && songIds.length === 0)
        return "video";
    if (songIds.length > 0 && videoIds.length === 0)
        return "song";
    return "mixed";
}
export async function GET(request: Request) {
    try {
        const userId = new URL(request.url).searchParams.get("userId")?.trim() || "";
        if (!userId || !isUuid(userId))
            return jsonResponse({ playlists: [] });
        const supabase = getSupabaseLibraryClient();
        const loadPlaylists = async (selectColumns: string, orderColumn: string) => supabase.from("playlists").select(selectColumns).eq("user_id", userId).order(orderColumn, { ascending: false });
        const attempts = [
            { select: "id,user_id,name,playlist_type,cover_url,created_at,updated_at", order: "updated_at" },
            { select: "id,user_id,name,cover_url,created_at,updated_at", order: "updated_at" },
            { select: "id,user_id,name,created_at,updated_at", order: "updated_at" },
            { select: "id,user_id,name,playlist_type,cover_url,created_at", order: "created_at" },
            { select: "id,user_id,name,cover_url,created_at", order: "created_at" },
            { select: "id,user_id,name,created_at", order: "created_at" },
            { select: "id,user_id,name", order: "id" },
        ];
        let playlists: Record<string, unknown>[] | null = [];
        let error: unknown = null;
        for (const attempt of attempts) {
            const result = await loadPlaylists(attempt.select, attempt.order);
            playlists = result.data as Record<string, unknown>[] | null;
            error = result.error;
            if (!error)
                break;
            if (!isMissingColumn(error, "playlist_type") &&
                !isMissingColumn(error, "cover_url") &&
                !isMissingColumn(error, "updated_at") &&
                !isMissingColumn(error, "created_at")) {
                break;
            }
        }
        if (error) {
            console.error("[api/playlists] load failed:", error);
            return jsonResponse({ error: getErrorMessage(error), playlists: [] }, 500);
        }
        const playlistIds = (playlists || []).map((playlist) => String(playlist.id || "")).filter(Boolean);
        const itemsResult = playlistIds.length > 0
            ? await supabase.from("playlist_items").select("playlist_id,item_id,item_type").in("playlist_id", playlistIds)
            : { data: [], error: null };
        if (itemsResult.error) {
        }
        const itemsByPlaylist = new Map<string, {
            songIds: string[];
            videoIds: string[];
        }>();
        (itemsResult.data || []).forEach((item) => {
            const playlistId = String(item.playlist_id || "");
            const ids = itemsByPlaylist.get(playlistId) || { songIds: [], videoIds: [] };
            if (item.item_type === "video")
                ids.videoIds.push(String(item.item_id));
            else
                ids.songIds.push(String(item.item_id));
            itemsByPlaylist.set(playlistId, ids);
        });
        return jsonResponse({
            playlists: (playlists || []).map((playlist) => {
                const id = String(playlist.id || "");
                const ids = itemsByPlaylist.get(id) || { songIds: [], videoIds: [] };
                const createdAt = typeof playlist.created_at === "string" ? playlist.created_at : "";
                const updatedAt = typeof playlist.updated_at === "string" ? playlist.updated_at : createdAt;
                const playlistType = inferPlaylistType(playlist.name, ids.songIds, ids.videoIds, playlist.playlist_type);
                return {
                    id,
                    name: String(playlist.name || "Playlist"),
                    playlistType,
                    cover: typeof playlist.cover_url === "string" ? playlist.cover_url : "",
                    songIds: ids.songIds,
                    videoIds: ids.videoIds,
                    createdAt,
                    updatedAt,
                };
            }),
        });
    }
    catch (error) {
        console.error("[api/playlists] server error:", error);
        return jsonResponse({ error: getErrorMessage(error), playlists: [] }, 500);
    }
}
export async function POST(request: Request) {
    try {
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const userId = typeof body.userId === "string" ? body.userId.trim() : "";
        const name = typeof body.name === "string" ? body.name.trim() : "";
        const cover = typeof body.cover === "string" ? body.cover.trim() : "";
        const playlistType = normalizePlaylistType(body.playlistType);
        const id = typeof body.id === "string" && isUuid(body.id.trim()) ? body.id.trim() : crypto.randomUUID();
        if (!userId || !isUuid(userId))
            return jsonResponse({ error: "Log in before creating playlists." }, 401);
        if (!name)
            return jsonResponse({ error: "Playlist name is required." }, 400);
        const supabase = getSupabaseLibraryClient();
        const now = new Date().toISOString();
        const insertPlaylist = async (row: Record<string, unknown>, selectColumns: string) => supabase.from("playlists").insert(row).select(selectColumns).single();
        const attempts = [
            {
                row: { id, user_id: userId, name, playlist_type: playlistType, cover_url: cover, created_at: now, updated_at: now },
                select: "id,user_id,name,playlist_type,cover_url,created_at,updated_at",
            },
            {
                row: { id, user_id: userId, name, cover_url: cover, created_at: now, updated_at: now },
                select: "id,user_id,name,cover_url,created_at,updated_at",
            },
            { row: { id, user_id: userId, name, created_at: now, updated_at: now }, select: "id,user_id,name,created_at,updated_at" },
            {
                row: { id, user_id: userId, name, playlist_type: playlistType, cover_url: cover, created_at: now },
                select: "id,user_id,name,playlist_type,cover_url,created_at",
            },
            { row: { id, user_id: userId, name, cover_url: cover, created_at: now }, select: "id,user_id,name,cover_url,created_at" },
            { row: { id, user_id: userId, name, created_at: now }, select: "id,user_id,name,created_at" },
            { row: { id, user_id: userId, name }, select: "id,user_id,name" },
        ];
        let data: Record<string, unknown> | null = null;
        let error: unknown = null;
        for (const attempt of attempts) {
            const result = await insertPlaylist(attempt.row, attempt.select);
            data = result.data as Record<string, unknown> | null;
            error = result.error;
            if (!error)
                break;
            if (!isMissingColumn(error, "playlist_type") &&
                !isMissingColumn(error, "cover_url") &&
                !isMissingColumn(error, "updated_at") &&
                !isMissingColumn(error, "created_at")) {
                break;
            }
        }
        if (error) {
            console.error("[api/playlists] create failed:", error);
            return jsonResponse({ error: getErrorMessage(error) }, 500);
        }
        if (!data)
            return jsonResponse({ error: "Playlist was not returned after save." }, 500);
        return jsonResponse({
            playlist: {
                id: String(data.id || id),
                name: String(data.name || name),
                playlistType: normalizePlaylistType(data.playlist_type || playlistType),
                cover: typeof data.cover_url === "string" ? data.cover_url : cover,
                songIds: [],
                videoIds: [],
                createdAt: typeof data.created_at === "string" ? data.created_at : now,
                updatedAt: typeof data.updated_at === "string" ? data.updated_at : now,
            },
        });
    }
    catch (error) {
        console.error("[api/playlists] post server error:", error);
        return jsonResponse({ error: getErrorMessage(error) }, 500);
    }
}
export async function DELETE(request: Request) {
    try {
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const userId = typeof body.userId === "string" ? body.userId.trim() : "";
        const playlistId = typeof body.playlistId === "string" ? body.playlistId.trim() : "";
        if (!userId || !isUuid(userId))
            return jsonResponse({ error: "Log in before deleting playlists." }, 401);
        if (!playlistId || !isUuid(playlistId))
            return jsonResponse({ error: "Choose a playlist first." }, 400);
        const supabase = getSupabaseLibraryClient();
        const result = await supabase.from("playlists").delete().eq("id", playlistId).eq("user_id", userId);
        if (result.error) {
            console.error("[api/playlists] delete failed:", result.error);
            return jsonResponse({ error: getErrorMessage(result.error) }, 500);
        }
        return jsonResponse({ ok: true });
    }
    catch (error) {
        console.error("[api/playlists] delete server error:", error);
        return jsonResponse({ error: getErrorMessage(error) }, 500);
    }
}
