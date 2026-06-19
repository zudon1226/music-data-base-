import { NextResponse } from "next/server";
import { requireMatchingUserId } from "@/lib/request-auth";
import { getSupabaseLibraryClient } from "@/lib/server-supabase";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
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
    return getString(body.user_id) || getString(body.userId) || getString(body.artistId) || getString(body.producerId) || getString(nestedUser.id);
}
function getBodyAlbumId(body: Record<string, unknown>) {
    return getString(body.album_id) || getString(body.albumId) || getString(body.id);
}
function isUuid(value: string) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.trim());
}
function normalizeOwnerType(value: unknown) {
    return value === "producer" ? "producer" : "artist";
}
function getSupabaseServerClient() {
    return getSupabaseLibraryClient();
}
function mapAlbumRow(row: Record<string, unknown>) {
    const id = String(row.id || "");
    return {
        id,
        albumId: id,
        album_id: id,
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
        songIds: [],
        videoIds: [],
    };
}
export async function POST(request: Request) {
    try {
        const body = await readJsonBody(request);
        const ownerId = getBodyUserId(body);
        const requestedAlbumId = getBodyAlbumId(body);
        const albumId = isUuid(requestedAlbumId) ? requestedAlbumId : crypto.randomUUID();
        const title = getString(body.title);
        const creatorName = getString(body.creatorName);
        const ownerType = normalizeOwnerType(body.ownerType);
        const coverUrl = getString(body.coverUrl) || getString(body.cover_url) || "/music-data-base-logo.png";
        const category = getString(body.category) || "Album";
        const releaseDate = getString(body.releaseDate);
        const artistName = getString(body.artistName);
        const artistId = getString(body.artistId);
        const producerName = getString(body.producerName);
        const producerId = getString(body.producerId);
        const producerProfileId = getString(body.producerProfileId) || producerId;
        if (!ownerId) {
            console.error("ALBUM INSERT ERROR", "Missing user id.");
            return jsonResponse({ error: "Log in before creating an album." }, 401);
        }
        const auth = await requireMatchingUserId(request, "/api/albums/create", ownerId);
        if (!auth.ok) {
            return jsonResponse({ error: auth.error }, auth.status);
        }
        if (!title)
            return jsonResponse({ error: "Album title is required." }, 400);
        if (!creatorName)
            return jsonResponse({ error: "Artist or producer name is required." }, 400);
        const now = new Date().toISOString();
        const albumRow = {
            id: albumId,
            user_id: ownerId,
            title,
            creator_name: creatorName,
            owner_type: ownerType,
            artist_name: ownerType === "artist" ? artistName || creatorName : null,
            artist_id: artistId || null,
            producer_name: ownerType === "producer" ? producerName || creatorName : null,
            producer_id: producerId || null,
            producer_profile_id: producerProfileId || null,
            cover_url: coverUrl,
            category,
            release_date: releaseDate || null,
            created_at: now,
            updated_at: now,
        };
        const supabase = getSupabaseServerClient();
        const tableCheck = await supabase.from("albums").select("id", { count: "exact", head: true });
        if (tableCheck.error) {
            console.error("ALBUM INSERT ERROR", tableCheck.error);
            return jsonResponse({ error: `Albums table check failed: ${getErrorMessage(tableCheck.error)}` }, 500);
        }
        const result = await supabase.from("albums").insert(albumRow).select(ALBUM_SELECT).single();
        if (result.error || !result.data) {
            console.error("ALBUM INSERT ERROR", result.error);
            return jsonResponse({ error: getErrorMessage(result.error) }, 500);
        }
        const recentAlbumsResult = await supabase
            .from("albums")
            .select(ALBUM_SELECT)
            .or(`user_id.eq.${ownerId},artist_id.eq.${ownerId},producer_id.eq.${ownerId},producer_profile_id.eq.${ownerId}`)
            .order("created_at", { ascending: false })
            .limit(5);
        if (recentAlbumsResult.error) {
            console.error("ALBUM INSERT ERROR", recentAlbumsResult.error);
        }
        return jsonResponse({
            album: mapAlbumRow(result.data as Record<string, unknown>),
            albumId: result.data.id,
            album_id: result.data.id,
            recentAlbums: (recentAlbumsResult.data || []).map((album) => mapAlbumRow(album as Record<string, unknown>)),
        });
    }
    catch (error) {
        console.error("ALBUM INSERT ERROR", error);
        return jsonResponse({ error: getErrorMessage(error) }, 500);
    }
}
