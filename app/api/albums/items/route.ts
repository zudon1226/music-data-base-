import { NextResponse } from "next/server";
import { requireMatchingUserId } from "@/lib/request-auth";
import { getSupabaseLibraryClient } from "@/lib/server-supabase";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type AlbumItemInput = {
    itemId: string;
    itemType: "song" | "video";
};
const ALBUM_SELECT = "id,user_id,title,creator_name,owner_type,artist_name,artist_id,producer_name,producer_id,producer_profile_id,cover_url,category,release_date,created_at,updated_at";
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
async function readJsonBody(request: Request) {
    const rawBody = await request.text().catch(() => "");
    if (!rawBody.trim())
        return {};
    try {
        return JSON.parse(rawBody) as Record<string, unknown>;
    }
    catch {
        return {};
    }
}
function getString(value: unknown) {
    return typeof value === "string" ? value.trim() : "";
}
function getBodyUserId(body: Record<string, unknown>) {
    const nestedUser = body.user && typeof body.user === "object" ? (body.user as Record<string, unknown>) : {};
    return getString(body.userId) || getString(body.user_id) || getString(nestedUser.id);
}
function isUuid(value: string) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.trim());
}
function isMissingTable(error: unknown) {
    const message = getErrorMessage(error).toLowerCase();
    const code = error && typeof error === "object" ? String((error as Record<string, unknown>).code || "") : "";
    return code === "42P01" || code === "PGRST205" || message.includes("does not exist") || message.includes("schema cache");
}
function normalizeOwnerType(value: unknown) {
    return value === "producer" ? "producer" : "artist";
}
function getSupabaseServerClient() {
    return getSupabaseLibraryClient();
}
function getAlbumItemsFromBody(body: Record<string, unknown>) {
    const rawItems = Array.isArray(body.items) ? body.items : [];
    return rawItems
        .map((item) => {
        if (!item || typeof item !== "object")
            return null;
        const record = item as Record<string, unknown>;
        const itemId = getString(record.itemId) || getString(record.item_id);
        const rawItemType = record.itemType || record.item_type;
        const itemType = rawItemType === "video" ? "video" : rawItemType === "song" ? "song" : "";
        return itemId && isUuid(itemId) && itemType ? { itemId, itemType } : null;
    })
        .filter((item): item is AlbumItemInput => Boolean(item));
}
function mapAlbumRow(row: Record<string, unknown>, songIds: string[], videoIds: string[]) {
    return {
        id: String(row.id || ""),
        userId: String(row.user_id || ""),
        title: String(row.title || "Untitled album"),
        creatorName: String(row.creator_name || row.artist_name || row.producer_name || "Unknown creator"),
        ownerType: normalizeOwnerType(row.owner_type),
        artistName: String(row.artist_name || ""),
        artistId: String(row.artist_id || ""),
        producerName: String(row.producer_name || ""),
        producerId: String(row.producer_id || ""),
        producerProfileId: String(row.producer_profile_id || ""),
        cover: String(row.cover_url || "/music-data-base-logo.png"),
        category: String(row.category || "Album"),
        releaseDate: String(row.release_date || ""),
        createdAt: String(row.created_at || ""),
        updatedAt: String(row.updated_at || row.created_at || ""),
        songIds,
        videoIds,
    };
}
function dedupeAlbumItemRows(rows: Record<string, unknown>[]) {
    const seen = new Set<string>();
    return rows.filter((row) => {
        const albumId = getString(row.album_id);
        const itemId = getString(row.item_id);
        const itemType = row.item_type === "video" ? "video" : row.item_type === "song" ? "song" : "";
        const key = `${albumId}:${itemId}:${itemType}`;
        if (!albumId || !itemId || !itemType || seen.has(key))
            return false;
        seen.add(key);
        return true;
    });
}
async function loadAlbumItemRows(supabase: ReturnType<typeof getSupabaseServerClient>, albumId: string) {
    const rows: Record<string, unknown>[] = [];
    const itemsResult = await supabase
        .from("album_items")
        .select("album_id,item_id,item_type,position,created_at")
        .eq("album_id", albumId)
        .order("position", { ascending: true });
    if (itemsResult.error && !isMissingTable(itemsResult.error)) {
        return { rows, error: itemsResult.error };
    }
    rows.push(...((itemsResult.data || []) as Record<string, unknown>[]));
    const tracksResult = await supabase
        .from("album_tracks")
        .select("album_id,item_id,item_type,position,created_at")
        .eq("album_id", albumId)
        .order("position", { ascending: true });
    if (tracksResult.error && !isMissingTable(tracksResult.error)) {
        return { rows, error: tracksResult.error };
    }
    rows.push(...((tracksResult.data || []) as Record<string, unknown>[]));
    return { rows: dedupeAlbumItemRows(rows), error: null };
}
export async function GET(request: Request) {
    try {
        const requestUrl = new URL(request.url);
        const albumId = getString(requestUrl.searchParams.get("albumId")) || getString(requestUrl.searchParams.get("album_id"));
        if (!albumId || !isUuid(albumId))
            return jsonResponse({ error: "Album id is required.", album: null, items: [], songs: [], videos: [] }, 400);
        const supabase = getSupabaseServerClient();
        const albumResult = await supabase.from("albums").select(ALBUM_SELECT).eq("id", albumId).single();
        if (albumResult.error || !albumResult.data) {
            console.error("ALBUM ITEMS GET ALBUM LOOKUP ERROR", albumResult.error);
            return jsonResponse({ error: getErrorMessage(albumResult.error) || "Album row was not found.", album: null, items: [], songs: [], videos: [] }, isMissingTable(albumResult.error) ? 409 : 404);
        }
        const itemResult = await loadAlbumItemRows(supabase, albumId);
        if (itemResult.error) {
            console.error("ALBUM ITEMS GET ERROR", itemResult.error);
            return jsonResponse({ error: getErrorMessage(itemResult.error), album: null, items: [], songs: [], videos: [] }, isMissingTable(itemResult.error) ? 409 : 500);
        }
        const songIds = itemResult.rows
            .filter((item) => item.item_type === "song")
            .map((item) => getString(item.item_id))
            .filter(Boolean);
        const videoIds = itemResult.rows
            .filter((item) => item.item_type === "video")
            .map((item) => getString(item.item_id))
            .filter(Boolean);
        const songsResult = songIds.length > 0
            ? await supabase.from("songs").select("*").in("id", songIds)
            : { data: [], error: null };
        if (songsResult.error) {
            console.error("ALBUM ITEMS GET SONGS ERROR", songsResult.error);
            return jsonResponse({ error: getErrorMessage(songsResult.error), album: null, items: [], songs: [], videos: [] }, 500);
        }
        const videosResult = videoIds.length > 0
            ? await supabase.from("videos").select("*").in("id", videoIds)
            : { data: [], error: null };
        if (videosResult.error) {
            console.error("ALBUM ITEMS GET VIDEOS ERROR", videosResult.error);
            return jsonResponse({ error: getErrorMessage(videosResult.error), album: null, items: [], songs: [], videos: [] }, 500);
        }
        return jsonResponse({
            album: mapAlbumRow(albumResult.data as Record<string, unknown>, songIds, videoIds),
            items: itemResult.rows,
            songIds,
            videoIds,
            songs: songsResult.data || [],
            videos: videosResult.data || [],
        });
    }
    catch (error) {
        console.error("ALBUM ITEMS GET ERROR", error);
        return jsonResponse({ error: getErrorMessage(error), album: null, items: [], songs: [], videos: [] }, 500);
    }
}
export async function POST(request: Request) {
    try {
        const body = await readJsonBody(request);
        const userId = getBodyUserId(body);
        const albumId = getString(body.albumId) || getString(body.album_id);
        const items = getAlbumItemsFromBody(body);
        if (!userId || !isUuid(userId))
            return jsonResponse({ error: "Log in before saving album items." }, 401);
        const auth = await requireMatchingUserId(request, "/api/albums/items", userId);
        if (!auth.ok) {
            return jsonResponse({ error: auth.error }, auth.status);
        }
        if (!albumId || !isUuid(albumId))
            return jsonResponse({ error: "Album id is required before saving album items." }, 400);
        if (items.length === 0)
            return jsonResponse({ error: "Add songs or videos before saving album items." }, 400);
        const supabase = getSupabaseServerClient();
        const albumResult = await supabase.from("albums").select(ALBUM_SELECT).eq("id", albumId).single();
        if (albumResult.error || !albumResult.data) {
            console.error("ALBUM ITEMS ALBUM LOOKUP ERROR", albumResult.error);
            return jsonResponse({ error: getErrorMessage(albumResult.error) || "Album row was not found." }, 404);
        }
        if (String(albumResult.data.user_id || "") !== userId) {
            return jsonResponse({ error: "Only the album owner can add album items." }, 403);
        }
        const now = new Date().toISOString();
        const itemRows = items.map((item, index) => ({
            id: crypto.randomUUID(),
            album_id: albumId,
            item_id: item.itemId,
            item_type: item.itemType,
            position: index + 1,
            created_at: now,
        }));
        const insertResult = await supabase.from("album_items").upsert(itemRows, {
            onConflict: "album_id,item_id,item_type",
        });
        if (insertResult.error) {
            console.error("ALBUM ITEMS INSERT ERROR", insertResult.error);
            return jsonResponse({ error: getErrorMessage(insertResult.error) }, 500);
        }
        const tracksResult = await supabase.from("album_tracks").upsert(itemRows, {
            onConflict: "album_id,item_id,item_type",
        });
        if (tracksResult.error && !isMissingTable(tracksResult.error)) {
            console.error("ALBUM TRACKS INSERT ERROR", tracksResult.error);
            return jsonResponse({ error: getErrorMessage(tracksResult.error) }, 500);
        }
        return jsonResponse({
            album: mapAlbumRow(albumResult.data as Record<string, unknown>, items.filter((item) => item.itemType === "song").map((item) => item.itemId), items.filter((item) => item.itemType === "video").map((item) => item.itemId)),
        });
    }
    catch (error) {
        console.error("ALBUM ITEMS INSERT ERROR", error);
        return jsonResponse({ error: getErrorMessage(error) }, 500);
    }
}
