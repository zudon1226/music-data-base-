import type { SupabaseClient } from "@supabase/supabase-js";

export type AlbumVideoRefRepairStats = {
    deadFound: number;
    removed: number;
    repaired: number;
};

type AlbumItemBucket = {
    songIds: string[];
    videoIds: string[];
};

function getString(value: unknown) {
    return typeof value === "string" ? value.trim() : "";
}

function isMissingTable(error: unknown) {
    const message = error instanceof Error ? error.message.toLowerCase() : String(error || "").toLowerCase();
    const code = error && typeof error === "object" ? String((error as Record<string, unknown>).code || "") : "";
    return code === "42P01" || code === "PGRST205" || message.includes("does not exist") || message.includes("schema cache");
}

function albumUsesBroadVideoRepair(album: Record<string, unknown>) {
    return /video/i.test(getString(album.title));
}

async function loadValidVideoRows(supabase: SupabaseClient) {
    const result = await supabase
        .from("videos")
        .select("id,album_id,user_id,created_at")
        .order("created_at", { ascending: true });
    if (result.error) {
        return [] as Record<string, unknown>[];
    }
    return (result.data || []) as Record<string, unknown>[];
}

async function deleteAlbumVideoReference(supabase: SupabaseClient, albumId: string, videoId: string) {
    const itemsDelete = await supabase
        .from("album_items")
        .delete()
        .eq("album_id", albumId)
        .eq("item_id", videoId)
        .eq("item_type", "video");
    if (itemsDelete.error && !isMissingTable(itemsDelete.error)) {
        throw itemsDelete.error;
    }
    const tracksDelete = await supabase
        .from("album_tracks")
        .delete()
        .eq("album_id", albumId)
        .eq("item_id", videoId)
        .eq("item_type", "video");
    if (tracksDelete.error && !isMissingTable(tracksDelete.error)) {
        throw tracksDelete.error;
    }
}

function findRepairVideoCandidates(album: Record<string, unknown>, validVideoRows: Record<string, unknown>[], linkedVideoIds: string[], removedCount: number) {
    const albumId = getString(album.id);
    const albumUserId = getString(album.user_id);
    const linked = new Set(linkedVideoIds);
    const broadRepair = albumUsesBroadVideoRepair(album);
    const candidates = validVideoRows.filter((row) => {
        const id = getString(row.id);
        if (!id || linked.has(id))
            return false;
        if (getString(row.album_id) === albumId)
            return true;
        if (!albumUserId || getString(row.user_id) !== albumUserId)
            return false;
        return broadRepair;
    });
    const limit = broadRepair ? candidates.length : Math.min(removedCount, candidates.length);
    return candidates.slice(0, limit);
}

async function insertAlbumVideoReference(supabase: SupabaseClient, albumId: string, videoId: string, position: number) {
    const row = {
        id: crypto.randomUUID(),
        album_id: albumId,
        item_id: videoId,
        item_type: "video",
        position,
        created_at: new Date().toISOString(),
    };
    const itemsInsert = await supabase.from("album_items").upsert(row, {
        onConflict: "album_id,item_id,item_type",
    });
    if (itemsInsert.error) {
        return itemsInsert;
    }
    const tracksInsert = await supabase.from("album_tracks").upsert(row, {
        onConflict: "album_id,item_id,item_type",
    });
    if (tracksInsert.error && !isMissingTable(tracksInsert.error)) {
        return tracksInsert;
    }
    return itemsInsert;
}

export async function repairDeadAlbumVideoReferences(supabase: SupabaseClient, albumRows: Record<string, unknown>[], itemBuckets: Record<string, AlbumItemBucket>) {
    const stats: AlbumVideoRefRepairStats = { deadFound: 0, removed: 0, repaired: 0 };
    const validVideoRows = await loadValidVideoRows(supabase);
    const validVideoIds = new Set(validVideoRows.map((row) => getString(row.id)).filter(Boolean));
    for (const album of albumRows) {
        const albumId = getString(album.id);
        if (!albumId)
            continue;
        const bucket = itemBuckets[albumId] || { songIds: [], videoIds: [] };
        const deadVideoIds = bucket.videoIds.filter((videoId) => !validVideoIds.has(videoId));
        stats.deadFound += deadVideoIds.length;
        if (deadVideoIds.length === 0)
            continue;
        for (const deadVideoId of deadVideoIds) {
            await deleteAlbumVideoReference(supabase, albumId, deadVideoId);
            stats.removed += 1;
        }
        bucket.videoIds = bucket.videoIds.filter((videoId) => validVideoIds.has(videoId));
        const repairCandidates = findRepairVideoCandidates(album, validVideoRows, bucket.videoIds, deadVideoIds.length);
        for (const candidate of repairCandidates) {
            const videoId = getString(candidate.id);
            if (!videoId || bucket.videoIds.includes(videoId))
                continue;
            const position = bucket.songIds.length + bucket.videoIds.length + 1;
            const insertResult = await insertAlbumVideoReference(supabase, albumId, videoId, position);
            if (insertResult.error)
                continue;
            bucket.videoIds.push(videoId);
            stats.repaired += 1;
        }
        itemBuckets[albumId] = bucket;
    }
    return stats;
}
