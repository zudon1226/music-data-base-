import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { isPlatformOwnerUserId } from "@/lib/server-supabase";
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
function isUuid(value: string) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.trim());
}
function isMissingTable(error: unknown) {
    const message = getErrorMessage(error).toLowerCase();
    const code = error && typeof error === "object" ? String((error as Record<string, unknown>).code || "") : "";
    return code === "42P01" || code === "PGRST205" || message.includes("albums") || message.includes("album_items") || message.includes("album_tracks") || message.includes("does not exist") || message.includes("schema cache");
}
function isMissingOptionalTableError(error: unknown, tableName: string) {
    const message = getErrorMessage(error).toLowerCase();
    const code = error && typeof error === "object" ? String((error as Record<string, unknown>).code || "") : "";
    return code === "42P01" || code === "PGRST205" || message.includes(tableName) || message.includes("does not exist") || message.includes("schema cache");
}
function normalizeOwnerType(value: unknown) {
    return value === "producer" ? "producer" : "artist";
}
function getString(value: unknown) {
    return typeof value === "string" ? value.trim() : "";
}
function getBodyUserId(body: Record<string, unknown>) {
    const nestedUser = body.user && typeof body.user === "object" ? (body.user as Record<string, unknown>) : {};
    return getString(body.userId) || getString(body.user_id) || getString(nestedUser.id);
}
function getSupabaseServerClient() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    if (!supabaseUrl)
        throw new Error("NEXT_PUBLIC_SUPABASE_URL is missing.");
    if (!serviceRoleKey || serviceRoleKey === "your_service_role_key_here") {
        throw new Error("SUPABASE_SERVICE_ROLE_KEY is missing or still set to the placeholder value.");
    }
    return createClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
    });
}
type SupabaseServerClient = ReturnType<typeof getSupabaseServerClient>;
async function loadAlbumItemBuckets(supabase: SupabaseServerClient, albumIds: string[]) {
    const itemBuckets: Record<string, {
        songIds: string[];
        videoIds: string[];
    }> = {};
    if (albumIds.length === 0) {
        return { itemBuckets, error: null };
    }
    const addRowsToBuckets = (rows: Record<string, unknown>[]) => {
        rows.forEach((item) => {
            const albumId = String(item.album_id || "");
            const itemId = String(item.item_id || "");
            if (!albumId || !itemId)
                return;
            const bucket = itemBuckets[albumId] || { songIds: [], videoIds: [] };
            if (item.item_type === "video") {
                if (!bucket.videoIds.includes(itemId))
                    bucket.videoIds.push(itemId);
            }
            else if (!bucket.songIds.includes(itemId)) {
                bucket.songIds.push(itemId);
            }
            itemBuckets[albumId] = bucket;
        });
    };
    const itemsResult = await supabase
        .from("album_items")
        .select("album_id,item_id,item_type,position,created_at")
        .in("album_id", albumIds)
        .order("position", { ascending: true });
    if (itemsResult.error && !isMissingTable(itemsResult.error)) {
        return { itemBuckets, error: itemsResult.error };
    }
    addRowsToBuckets((itemsResult.data || []) as Record<string, unknown>[]);
    const tracksResult = await supabase
        .from("album_tracks")
        .select("album_id,item_id,item_type,position,created_at")
        .in("album_id", albumIds)
        .order("position", { ascending: true });
    if (tracksResult.error && !isMissingTable(tracksResult.error)) {
        return { itemBuckets, error: tracksResult.error };
    }
    addRowsToBuckets((tracksResult.data || []) as Record<string, unknown>[]);
    return { itemBuckets, error: null };
}
function mapAlbumRow(row: Record<string, unknown>, items: Record<string, {
    songIds: string[];
    videoIds: string[];
}>) {
    const id = String(row.id || "");
    const albumItems = items[id] || { songIds: [], videoIds: [] };
    return {
        id,
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
        songIds: albumItems.songIds,
        videoIds: albumItems.videoIds,
    };
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
async function insertAlbumItems(supabase: SupabaseServerClient, albumId: string, items: AlbumItemInput[], createdAt = new Date().toISOString()) {
    if (items.length === 0) {
        return { error: null };
    }
    const itemRows = items.map((item, index) => ({
        id: crypto.randomUUID(),
        album_id: albumId,
        item_id: item.itemId,
        item_type: item.itemType,
        position: index + 1,
        created_at: createdAt,
    }));
    const result = await supabase.from("album_items").upsert(itemRows, {
        onConflict: "album_id,item_id,item_type",
    });
    if (result.error) {
        return result;
    }
    const tracksResult = await supabase.from("album_tracks").upsert(itemRows, {
        onConflict: "album_id,item_id,item_type",
    });
    if (tracksResult.error && !isMissingTable(tracksResult.error)) {
        return tracksResult;
    }
    return result;
}
async function deleteOptionalAlbumRows(supabase: SupabaseServerClient, tableName: string, albumId: string) {
    const { error } = await supabase.from(tableName).delete().eq("album_id", albumId);
    if (error && !isMissingOptionalTableError(error, tableName)) {
        throw error;
    }
}
async function deleteOptionalTypedAlbumRows(supabase: SupabaseServerClient, tableName: string, albumId: string) {
    const { error } = await supabase.from(tableName).delete().eq("item_id", albumId).eq("item_type", "album");
    if (error && !isMissingOptionalTableError(error, tableName)) {
        throw error;
    }
}
type AlbumRepairCandidate = {
    id: string;
    itemType: "song" | "video";
    userId: string;
    creatorName: string;
    category: string;
    coverUrl: string;
    createdAt: string;
    albumId: string;
};
function getTimeValue(value: unknown) {
    const time = Date.parse(getString(value));
    return Number.isFinite(time) ? time : 0;
}
function normalizeMatchText(value: unknown) {
    return getString(value).toLowerCase();
}
function isDefaultCover(value: string) {
    return !value || value === "/music-data-base-logo.png";
}
function mapSongRepairCandidate(row: Record<string, unknown>): AlbumRepairCandidate {
    return {
        id: getString(row.id),
        itemType: "song",
        userId: getString(row.user_id),
        creatorName: getString(row.artist) || getString(row.description),
        category: getString(row.type) || getString(row.category),
        coverUrl: getString(row.cover_url),
        createdAt: getString(row.created_at),
        albumId: getString(row.album_id),
    };
}
function mapVideoRepairCandidate(row: Record<string, unknown>): AlbumRepairCandidate {
    return {
        id: getString(row.id),
        itemType: "video",
        userId: getString(row.user_id) || getString(row.artist_id),
        creatorName: getString(row.artist_name) ||
            getString(row.producer_name) ||
            getString(row.producer) ||
            getString(row.description),
        category: getString(row.category),
        coverUrl: getString(row.cover_url) || getString(row.thumbnail_url),
        createdAt: getString(row.created_at),
        albumId: getString(row.album_id),
    };
}
async function loadAlbumRepairCandidates(supabase: SupabaseServerClient) {
    const songsResult = await supabase
        .from("songs")
        .select("id,user_id,artist,description,type,category,cover_url,created_at,album_id")
        .order("created_at", { ascending: true });
    let songRows = (songsResult.data || []) as Record<string, unknown>[];
    let songError = songsResult.error;
    if (songError && getErrorMessage(songError).toLowerCase().includes("album_id")) {
        const fallback = await supabase
            .from("songs")
            .select("id,user_id,artist,description,type,category,cover_url,created_at")
            .order("created_at", { ascending: true });
        songRows = (fallback.data || []) as Record<string, unknown>[];
        songError = fallback.error;
    }
    if (songError)
        return { candidates: [] as AlbumRepairCandidate[], error: songError };
    const videosResult = await supabase
        .from("videos")
        .select("id,user_id,artist_name,artist_id,producer,producer_name,description,category,cover_url,thumbnail_url,created_at,album_id")
        .order("created_at", { ascending: true });
    let videoRows = (videosResult.data || []) as Record<string, unknown>[];
    let videoError = videosResult.error;
    if (videoError && getErrorMessage(videoError).toLowerCase().includes("album_id")) {
        const fallback = await supabase
            .from("videos")
            .select("id,user_id,artist_name,artist_id,producer,producer_name,description,category,cover_url,thumbnail_url,created_at")
            .order("created_at", { ascending: true });
        videoRows = (fallback.data || []) as Record<string, unknown>[];
        videoError = fallback.error;
    }
    if (videoError)
        return { candidates: [] as AlbumRepairCandidate[], error: videoError };
    return {
        candidates: [
            ...songRows.map(mapSongRepairCandidate),
            ...videoRows.map(mapVideoRepairCandidate),
        ].filter((item) => item.id && isUuid(item.id)),
        error: null,
    };
}
function candidateLooksLikeAlbumTrack(album: Record<string, unknown>, candidate: AlbumRepairCandidate, nextAlbumTime: number) {
    const albumId = getString(album.id);
    if (candidate.albumId === albumId)
        return true;
    const albumCreatedAt = getTimeValue(album.created_at);
    const candidateCreatedAt = getTimeValue(candidate.createdAt);
    if (!albumCreatedAt || !candidateCreatedAt)
        return false;
    const maxRepairWindow = albumCreatedAt + 2 * 60 * 60 * 1000;
    const repairWindowEnd = nextAlbumTime > albumCreatedAt ? Math.min(nextAlbumTime, maxRepairWindow) : maxRepairWindow;
    if (candidateCreatedAt < albumCreatedAt - 60 * 1000 || candidateCreatedAt > repairWindowEnd)
        return false;
    const albumUserId = getString(album.user_id);
    if (albumUserId && candidate.userId && albumUserId !== candidate.userId)
        return false;
    const albumCreatorNames = [
        normalizeMatchText(album.creator_name),
        normalizeMatchText(album.artist_name),
        normalizeMatchText(album.producer_name),
    ].filter(Boolean);
    const creatorMatches = albumCreatorNames.length === 0 || albumCreatorNames.includes(normalizeMatchText(candidate.creatorName));
    if (!creatorMatches)
        return false;
    const albumCover = getString(album.cover_url);
    const coverMatches = isDefaultCover(albumCover) || albumCover === candidate.coverUrl || isDefaultCover(candidate.coverUrl);
    if (!coverMatches)
        return false;
    const albumCategory = normalizeMatchText(album.category);
    const categoryMatches = !albumCategory ||
        albumCategory === "album" ||
        normalizeMatchText(candidate.category) === albumCategory ||
        normalizeMatchText(candidate.category) === "new releases";
    return categoryMatches;
}
function candidateMatchesAlbumIdentity(album: Record<string, unknown>, candidate: AlbumRepairCandidate) {
    const albumUserId = getString(album.user_id);
    if (albumUserId && candidate.userId && albumUserId !== candidate.userId)
        return false;
    const albumCreatorNames = [
        normalizeMatchText(album.creator_name),
        normalizeMatchText(album.artist_name),
        normalizeMatchText(album.producer_name),
    ].filter(Boolean);
    const creatorMatches = albumCreatorNames.length === 0 || albumCreatorNames.includes(normalizeMatchText(candidate.creatorName));
    if (!creatorMatches)
        return false;
    const albumCategory = normalizeMatchText(album.category);
    return (!albumCategory ||
        albumCategory === "album" ||
        normalizeMatchText(candidate.category) === albumCategory ||
        normalizeMatchText(candidate.category) === "new releases");
}
function findLatestPriorAlbumGroup(album: Record<string, unknown>, candidates: AlbumRepairCandidate[]) {
    const albumCreatedAt = getTimeValue(album.created_at);
    if (!albumCreatedAt)
        return [];
    const priorCandidates = candidates
        .filter((candidate) => {
        const candidateCreatedAt = getTimeValue(candidate.createdAt);
        return (candidateCreatedAt > 0 &&
            candidateCreatedAt < albumCreatedAt + 60 * 1000 &&
            candidateCreatedAt >= albumCreatedAt - 48 * 60 * 60 * 1000 &&
            !candidate.albumId &&
            candidateMatchesAlbumIdentity(album, candidate));
    })
        .sort((left, right) => getTimeValue(right.createdAt) - getTimeValue(left.createdAt));
    const newestCandidateTime = getTimeValue(priorCandidates[0]?.createdAt);
    if (!newestCandidateTime)
        return [];
    return priorCandidates.filter((candidate) => Math.abs(getTimeValue(candidate.createdAt) - newestCandidateTime) <= 10 * 60 * 1000);
}
async function repairEmptyAlbumItemBuckets(supabase: SupabaseServerClient, albumRows: Record<string, unknown>[], itemBuckets: Record<string, {
    songIds: string[];
    videoIds: string[];
}>) {
    const emptyAlbums = albumRows.filter((album) => {
        const albumId = getString(album.id);
        const bucket = itemBuckets[albumId] || { songIds: [], videoIds: [] };
        return albumId && bucket.songIds.length === 0 && bucket.videoIds.length === 0;
    });
    if (emptyAlbums.length === 0)
        return;
    const { candidates, error } = await loadAlbumRepairCandidates(supabase);
    if (error) {
        return;
    }
    for (const album of emptyAlbums) {
        const albumId = getString(album.id);
        const albumCreatedAt = getTimeValue(album.created_at);
        const nextAlbumTime = albumRows
            .filter((item) => getString(item.id) !== albumId &&
            getString(item.user_id) === getString(album.user_id) &&
            getTimeValue(item.created_at) > albumCreatedAt)
            .map((item) => getTimeValue(item.created_at))
            .sort((left, right) => left - right)[0] || 0;
        const matchedItems = candidates
            .filter((candidate) => candidateLooksLikeAlbumTrack(album, candidate, nextAlbumTime))
            .map((candidate) => ({ itemId: candidate.id, itemType: candidate.itemType }));
        const priorAlbumGroup = matchedItems.length === 0
            ? findLatestPriorAlbumGroup(album, candidates).map((candidate) => ({
                itemId: candidate.id,
                itemType: candidate.itemType,
            }))
            : [];
        const itemsToRepair = matchedItems.length > 0 ? matchedItems : priorAlbumGroup;
        if (itemsToRepair.length === 0)
            continue;
        const insertResult = await insertAlbumItems(supabase, albumId, itemsToRepair, new Date().toISOString());
        if (insertResult.error) {
            continue;
        }
        itemBuckets[albumId] = {
            songIds: itemsToRepair.filter((item) => item.itemType === "song").map((item) => item.itemId),
            videoIds: itemsToRepair.filter((item) => item.itemType === "video").map((item) => item.itemId),
        };
    }
}
async function selectAlbumById(supabase: SupabaseServerClient, albumId: string) {
    const albumResult = await supabase.from("albums").select(ALBUM_SELECT).eq("id", albumId).single();
    if (albumResult.error || !albumResult.data) {
        return { album: null, error: albumResult.error || new Error("Album not found.") };
    }
    const { itemBuckets, error: itemsError } = await loadAlbumItemBuckets(supabase, [albumId]);
    if (itemsError) {
        return { album: null, error: itemsError };
    }
    return { album: mapAlbumRow(albumResult.data as Record<string, unknown>, itemBuckets), error: null };
}
export async function GET(request: Request) {
    try {
        const requestUrl = new URL(request.url);
        const recentUserId = getString(requestUrl.searchParams.get("userId"));
        const supabase = getSupabaseServerClient();
        const albumsResult = await supabase
            .from("albums")
            .select(ALBUM_SELECT)
            .order("created_at", { ascending: false });
        if (albumsResult.error) {
            console.error("[api/albums] load failed:", albumsResult.error);
            return jsonResponse({ error: getErrorMessage(albumsResult.error), albums: [], setupRequired: isMissingTable(albumsResult.error) }, isMissingTable(albumsResult.error) ? 409 : 500);
        }
        const albumRows = (albumsResult.data || []) as Record<string, unknown>[];
        const albumIds = albumRows.map((album) => String(album.id || "")).filter((id) => isUuid(id));
        const { itemBuckets, error: itemsError } = await loadAlbumItemBuckets(supabase, albumIds);
        if (itemsError) {
            console.error("[api/albums] item load failed:", itemsError);
            return jsonResponse({ error: getErrorMessage(itemsError), albums: [], setupRequired: isMissingTable(itemsError) }, isMissingTable(itemsError) ? 409 : 500);
        }
        await repairEmptyAlbumItemBuckets(supabase, albumRows, itemBuckets);
        const mappedAlbums = albumRows.map((album) => mapAlbumRow(album, itemBuckets));
        const recentAlbums = recentUserId
            ? mappedAlbums.filter((album) => album.userId === recentUserId ||
                album.artistId === recentUserId ||
                album.producerId === recentUserId ||
                album.producerProfileId === recentUserId)
            : mappedAlbums;
        return jsonResponse({ albums: mappedAlbums, recentAlbums });
    }
    catch (error) {
        console.error("[api/albums] server error:", error);
        return jsonResponse({ error: getErrorMessage(error), albums: [] }, 500);
    }
}
export async function POST(request: Request) {
    try {
        const body = await readJsonBody(request);
        const action = getString(body.action);
        const userId = getBodyUserId(body);
        const supabase = getSupabaseServerClient();
        if (action === "add-items") {
            const albumId = getString(body.albumId) || getString(body.album_id) || getString(body.id);
            const items = getAlbumItemsFromBody(body);
            if (!userId || !isUuid(userId))
                return jsonResponse({ error: "Log in before updating an album." }, 401);
            if (!albumId || !isUuid(albumId))
                return jsonResponse({ error: "Album id is required." }, 400);
            if (items.length === 0)
                return jsonResponse({ error: "Add songs or videos before saving album items." }, 400);
            const existingAlbum = await supabase.from("albums").select("id,user_id").eq("id", albumId).single();
            if (existingAlbum.error || !existingAlbum.data) {
                console.error("[api/albums] add-items album lookup failed:", existingAlbum.error);
                return jsonResponse({ error: getErrorMessage(existingAlbum.error) || "Album not found." }, isMissingTable(existingAlbum.error) ? 409 : 404);
            }
            if (String(existingAlbum.data.user_id || "") !== userId) {
                return jsonResponse({ error: "Only the album owner can update album items." }, 403);
            }
            const insertItems = await insertAlbumItems(supabase, albumId, items);
            if (insertItems.error) {
                console.error("[api/albums] item insert failed:", insertItems.error);
                return jsonResponse({ error: getErrorMessage(insertItems.error), setupRequired: isMissingTable(insertItems.error) }, isMissingTable(insertItems.error) ? 409 : 500);
            }
            const selectedAlbum = await selectAlbumById(supabase, albumId);
            if (selectedAlbum.error || !selectedAlbum.album) {
                console.error("[api/albums] album reload after item insert failed:", selectedAlbum.error);
                return jsonResponse({ error: getErrorMessage(selectedAlbum.error), setupRequired: isMissingTable(selectedAlbum.error) }, isMissingTable(selectedAlbum.error) ? 409 : 500);
            }
            return jsonResponse({ album: selectedAlbum.album });
        }
        const title = getString(body.title);
        const creatorName = getString(body.creatorName);
        const ownerType = normalizeOwnerType(body.ownerType);
        const coverUrl = getString(body.coverUrl) || "/music-data-base-logo.png";
        const category = getString(body.category) || "Album";
        const releaseDate = getString(body.releaseDate);
        const artistName = getString(body.artistName);
        const artistId = getString(body.artistId);
        const producerName = getString(body.producerName);
        const producerId = getString(body.producerId);
        const producerProfileId = getString(body.producerProfileId) || producerId;
        const items = getAlbumItemsFromBody(body);
        if (!userId || !isUuid(userId)) {
            console.error("ALBUM INSERT ERROR", "Missing or invalid user id.");
            return jsonResponse({ error: "Log in before creating an album." }, 401);
        }
        if (!title)
            return jsonResponse({ error: "Album title is required." }, 400);
        if (!creatorName)
            return jsonResponse({ error: "Artist or producer name is required." }, 400);
        if (action !== "create-album" && items.filter((item) => item.itemType === "song").length === 0) {
            return jsonResponse({ error: "Upload at least one song for the album." }, 400);
        }
        const now = new Date().toISOString();
        const albumId = crypto.randomUUID();
        const albumRow = {
            id: albumId,
            user_id: userId,
            title,
            creator_name: creatorName,
            owner_type: ownerType,
            artist_name: ownerType === "artist" ? artistName || creatorName : null,
            artist_id: ownerType === "artist" && isUuid(artistId) ? artistId : null,
            producer_name: ownerType === "producer" ? producerName || creatorName : null,
            producer_id: ownerType === "producer" && isUuid(producerId) ? producerId : null,
            producer_profile_id: ownerType === "producer" && isUuid(producerProfileId) ? producerProfileId : null,
            cover_url: coverUrl,
            category,
            release_date: releaseDate || null,
            created_at: now,
            updated_at: now,
        };
        const tableCheck = await supabase.from("albums").select("id", { count: "exact", head: true });
        if (tableCheck.error) {
            console.error("ALBUM INSERT ERROR", tableCheck.error);
            return jsonResponse({ error: `Albums table check failed: ${getErrorMessage(tableCheck.error)}` }, 500);
        }
        const insertAlbum = await supabase
            .from("albums")
            .insert(albumRow)
            .select(ALBUM_SELECT)
            .single();
        if (insertAlbum.error || !insertAlbum.data) {
            console.error("ALBUM INSERT ERROR", insertAlbum.error);
            return jsonResponse({ error: getErrorMessage(insertAlbum.error), setupRequired: isMissingTable(insertAlbum.error) }, isMissingTable(insertAlbum.error) ? 409 : 500);
        }
        const savedAlbumId = String(insertAlbum.data.id || albumId);
        const insertItems = await insertAlbumItems(supabase, savedAlbumId, items, now);
        if (insertItems.error) {
            console.error("[api/albums] item insert failed:", insertItems.error);
            await supabase.from("albums").delete().eq("id", savedAlbumId);
            return jsonResponse({ error: getErrorMessage(insertItems.error), setupRequired: isMissingTable(insertItems.error) }, isMissingTable(insertItems.error) ? 409 : 500);
        }
        const itemBuckets = {
            [savedAlbumId]: {
                songIds: items.filter((item) => item.itemType === "song").map((item) => item.itemId),
                videoIds: items.filter((item) => item.itemType === "video").map((item) => item.itemId),
            },
        };
        return jsonResponse({ album: mapAlbumRow(insertAlbum.data as Record<string, unknown>, itemBuckets) });
    }
    catch (error) {
        console.error("[api/albums] server error:", error);
        return jsonResponse({ error: getErrorMessage(error) }, 500);
    }
}
export async function PATCH(request: Request) {
    try {
        const body = await readJsonBody(request);
        const id = getString(body.id);
        const userId = getBodyUserId(body);
        const title = getString(body.title);
        const creatorName = getString(body.creatorName);
        const coverUrl = getString(body.coverUrl) || "/music-data-base-logo.png";
        const category = getString(body.category) || "Album";
        const releaseDate = getString(body.releaseDate);
        if (!id || !isUuid(id))
            return jsonResponse({ error: "Album id is required." }, 400);
        if (!userId || !isUuid(userId))
            return jsonResponse({ error: "Log in before editing albums." }, 401);
        if (!title)
            return jsonResponse({ error: "Album title is required." }, 400);
        if (!creatorName)
            return jsonResponse({ error: "Artist or producer name is required." }, 400);
        const supabase = getSupabaseServerClient();
        const existingAlbum = await supabase.from("albums").select("id,user_id,owner_type").eq("id", id).single();
        if (existingAlbum.error || !existingAlbum.data) {
            console.error("[api/albums] edit lookup failed:", existingAlbum.error);
            return jsonResponse({ error: getErrorMessage(existingAlbum.error) || "Album not found." }, isMissingTable(existingAlbum.error) ? 409 : 404);
        }
        if (String(existingAlbum.data.user_id || "") !== userId) {
            return jsonResponse({ error: "Only the album owner can edit this album." }, 403);
        }
        const ownerType = normalizeOwnerType(existingAlbum.data.owner_type);
        const now = new Date().toISOString();
        const albumUpdate: Record<string, unknown> = {
            title,
            creator_name: creatorName,
            cover_url: coverUrl,
            category,
            release_date: releaseDate || null,
            updated_at: now,
        };
        if (ownerType === "producer")
            albumUpdate.producer_name = creatorName;
        else
            albumUpdate.artist_name = creatorName;
        const updateAlbum = await supabase.from("albums").update(albumUpdate).eq("id", id).select(ALBUM_SELECT).single();
        if (updateAlbum.error || !updateAlbum.data) {
            console.error("[api/albums] update failed:", updateAlbum.error);
            return jsonResponse({ error: getErrorMessage(updateAlbum.error), setupRequired: isMissingTable(updateAlbum.error) }, isMissingTable(updateAlbum.error) ? 409 : 500);
        }
        const { itemBuckets, error: itemsError } = await loadAlbumItemBuckets(supabase, [id]);
        if (itemsError) {
            console.error("[api/albums] item reload after update failed:", itemsError);
            return jsonResponse({ error: getErrorMessage(itemsError), setupRequired: isMissingTable(itemsError) }, isMissingTable(itemsError) ? 409 : 500);
        }
        return jsonResponse({ album: mapAlbumRow(updateAlbum.data as Record<string, unknown>, itemBuckets) });
    }
    catch (error) {
        console.error("[api/albums] server error:", error);
        return jsonResponse({ error: getErrorMessage(error) }, 500);
    }
}
export async function DELETE(request: Request) {
    try {
        const body = await readJsonBody(request);
        const id = getString(body.id);
        const userId = getBodyUserId(body);
        if (!id || !isUuid(id))
            return jsonResponse({ error: "Album id is required." }, 400);
        if (!userId || !isUuid(userId))
            return jsonResponse({ error: "Log in before deleting albums." }, 401);
        const isOwnerAdmin = await isPlatformOwnerUserId(userId);
        const supabase = getSupabaseServerClient();
        const existingAlbum = await supabase.from("albums").select("id,user_id").eq("id", id).single();
        if (existingAlbum.error || !existingAlbum.data) {
            console.error("[api/albums] delete lookup failed:", existingAlbum.error);
            return jsonResponse({ error: getErrorMessage(existingAlbum.error) || "Album not found." }, isMissingTable(existingAlbum.error) ? 409 : 404);
        }
        if (!isOwnerAdmin && String(existingAlbum.data.user_id || "") !== userId) {
            return jsonResponse({ error: "Only the album owner can delete this album." }, 403);
        }
        try {
            await Promise.all([
                deleteOptionalTypedAlbumRows(supabase, "library_saves", id),
                deleteOptionalTypedAlbumRows(supabase, "playlist_items", id),
                deleteOptionalTypedAlbumRows(supabase, "recent_plays", id),
                deleteOptionalTypedAlbumRows(supabase, "comments", id),
                deleteOptionalTypedAlbumRows(supabase, "moderation_reports", id),
                deleteOptionalAlbumRows(supabase, "album_tracks", id),
            ]);
        }
        catch (relatedDeleteError) {
            console.error("[api/albums] related record delete failed:", relatedDeleteError);
            return jsonResponse({ error: getErrorMessage(relatedDeleteError) }, 500);
        }
        const itemsDelete = await supabase.from("album_items").delete().eq("album_id", id);
        if (itemsDelete.error) {
            console.error("[api/albums] item delete failed:", itemsDelete.error);
            return jsonResponse({ error: getErrorMessage(itemsDelete.error), setupRequired: isMissingTable(itemsDelete.error) }, isMissingTable(itemsDelete.error) ? 409 : 500);
        }
        const albumDelete = await supabase.from("albums").delete().eq("id", id);
        if (albumDelete.error) {
            console.error("[api/albums] delete failed:", albumDelete.error);
            return jsonResponse({ error: getErrorMessage(albumDelete.error), setupRequired: isMissingTable(albumDelete.error) }, isMissingTable(albumDelete.error) ? 409 : 500);
        }
        return jsonResponse({ ok: true, deletedAlbumId: id });
    }
    catch (error) {
        console.error("[api/albums] server error:", error);
        return jsonResponse({ error: getErrorMessage(error) }, 500);
    }
}
