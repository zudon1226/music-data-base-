import { NextResponse } from "next/server";
import { getSessionTokensFromRecord, requireMatchingUserId } from "@/lib/request-auth";
import { getErrorMessage, getSupabaseLibraryClient, isUuid } from "@/lib/server-supabase";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
function jsonResponse(body: Record<string, unknown>, status = 200) {
    return NextResponse.json(body, { status });
}
function isValidPlaylistItemId(value: string) {
    return isUuid(value) && !value.startsWith("storage-");
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
        const rawItems = (itemsResult.data || []) as Array<{
            playlist_id: string;
            item_id: string;
            item_type: string;
        }>;
        const candidateSongIds = [...new Set(rawItems
            .filter((item) => item.item_type !== "video")
            .map((item) => String(item.item_id || "").trim())
            .filter(isValidPlaylistItemId))];
        const candidateVideoIds = [...new Set(rawItems
            .filter((item) => item.item_type === "video")
            .map((item) => String(item.item_id || "").trim())
            .filter(isValidPlaylistItemId))];
        const [songsResult, videosResult] = await Promise.all([
            candidateSongIds.length > 0
                ? supabase.from("songs").select("id").in("id", candidateSongIds)
                : Promise.resolve({ data: [], error: null }),
            candidateVideoIds.length > 0
                ? supabase.from("videos").select("id").in("id", candidateVideoIds)
                : Promise.resolve({ data: [], error: null }),
        ]);
        const validSongIds = new Set((songsResult.data || []).map((row) => String(row.id || "")));
        const validVideoIds = new Set((videosResult.data || []).map((row) => String(row.id || "")));
        const staleItems = rawItems.filter((item) => {
            const itemId = String(item.item_id || "").trim();
            if (!isValidPlaylistItemId(itemId))
                return true;
            if (item.item_type === "video")
                return !validVideoIds.has(itemId);
            return !validSongIds.has(itemId);
        });
        if (staleItems.length > 0) {
            await Promise.all(staleItems.map((item) => supabase
                .from("playlist_items")
                .delete()
                .eq("playlist_id", String(item.playlist_id || ""))
                .eq("item_id", String(item.item_id || ""))
                .eq("item_type", item.item_type === "video" ? "video" : "song")));
        }
        const itemsByPlaylist = new Map<string, {
            songIds: string[];
            videoIds: string[];
        }>();
        rawItems.forEach((item) => {
            const playlistId = String(item.playlist_id || "");
            const itemId = String(item.item_id || "").trim();
            const ids = itemsByPlaylist.get(playlistId) || { songIds: [], videoIds: [] };
            if (item.item_type === "video") {
                if (validVideoIds.has(itemId))
                    ids.videoIds.push(itemId);
            }
            else if (validSongIds.has(itemId)) {
                ids.songIds.push(itemId);
            }
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
        const auth = await requireMatchingUserId(request, "/api/playlists", userId, getSessionTokensFromRecord(body));
        if (!auth.ok) {
            return jsonResponse({ error: auth.error }, auth.status);
        }
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
export async function PATCH(request: Request) {
    try {
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const userId = typeof body.userId === "string" ? body.userId.trim() : "";
        const playlistId = typeof body.playlistId === "string" ? body.playlistId.trim() : "";
        const name = typeof body.name === "string" ? body.name.trim() : "";
        const cover = typeof body.cover === "string" ? body.cover.trim() : "";
        const playlistType = body.playlistType === undefined ? undefined : normalizePlaylistType(body.playlistType);
        if (!userId || !isUuid(userId))
            return jsonResponse({ error: "Log in before updating playlists." }, 401);
        const auth = await requireMatchingUserId(request, "/api/playlists", userId, getSessionTokensFromRecord(body));
        if (!auth.ok) {
            return jsonResponse({ error: auth.error }, auth.status);
        }
        if (!playlistId || !isUuid(playlistId))
            return jsonResponse({ error: "Choose a playlist first." }, 400);
        if (!name && !cover && playlistType === undefined)
            return jsonResponse({ error: "Nothing to update." }, 400);
        const supabase = getSupabaseLibraryClient();
        const existing = await supabase
            .from("playlists")
            .select("id,user_id,name,playlist_type,cover_url,created_at,updated_at")
            .eq("id", playlistId)
            .eq("user_id", userId)
            .maybeSingle();
        if (existing.error) {
            console.error("[api/playlists] patch lookup failed:", existing.error);
            return jsonResponse({ error: getErrorMessage(existing.error) }, 500);
        }
        if (!existing.data)
            return jsonResponse({ error: "Playlist not found for this user." }, 404);
        const now = new Date().toISOString();
        const updateRow: Record<string, unknown> = { updated_at: now };
        if (name)
            updateRow.name = name;
        if (cover)
            updateRow.cover_url = cover;
        if (playlistType !== undefined)
            updateRow.playlist_type = playlistType;
        const updateResult = await supabase
            .from("playlists")
            .update(updateRow)
            .eq("id", playlistId)
            .eq("user_id", userId)
            .select("id,user_id,name,playlist_type,cover_url,created_at,updated_at")
            .single();
        if (updateResult.error && isMissingColumn(updateResult.error, "playlist_type")) {
            const fallbackRow: Record<string, unknown> = { updated_at: now };
            if (name)
                fallbackRow.name = name;
            if (cover)
                fallbackRow.cover_url = cover;
            const fallbackResult = await supabase
                .from("playlists")
                .update(fallbackRow)
                .eq("id", playlistId)
                .eq("user_id", userId)
                .select("id,user_id,name,cover_url,created_at,updated_at")
                .single();
            if (fallbackResult.error) {
                console.error("[api/playlists] patch failed:", fallbackResult.error);
                return jsonResponse({ error: getErrorMessage(fallbackResult.error) }, 500);
            }
            const data = fallbackResult.data as Record<string, unknown>;
            return jsonResponse({
                playlist: {
                    id: String(data.id || playlistId),
                    name: String(data.name || name || existing.data.name || "Playlist"),
                    playlistType: playlistType ?? normalizePlaylistType(existing.data.playlist_type),
                    cover: typeof data.cover_url === "string" ? data.cover_url : cover,
                    createdAt: typeof data.created_at === "string" ? data.created_at : now,
                    updatedAt: typeof data.updated_at === "string" ? data.updated_at : now,
                },
            });
        }
        if (updateResult.error) {
            console.error("[api/playlists] patch failed:", updateResult.error);
            return jsonResponse({ error: getErrorMessage(updateResult.error) }, 500);
        }
        const data = updateResult.data as Record<string, unknown>;
        return jsonResponse({
            playlist: {
                id: String(data.id || playlistId),
                name: String(data.name || name || existing.data.name || "Playlist"),
                playlistType: normalizePlaylistType(data.playlist_type ?? existing.data.playlist_type),
                cover: typeof data.cover_url === "string" ? data.cover_url : cover,
                createdAt: typeof data.created_at === "string" ? data.created_at : now,
                updatedAt: typeof data.updated_at === "string" ? data.updated_at : now,
            },
        });
    }
    catch (error) {
        console.error("[api/playlists] patch server error:", error);
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
        const auth = await requireMatchingUserId(request, "/api/playlists", userId, getSessionTokensFromRecord(body));
        if (!auth.ok) {
            return jsonResponse({ error: auth.error }, auth.status);
        }
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
