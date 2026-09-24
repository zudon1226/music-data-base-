/**
 * Generic orphan media-reference pruning.
 * Keeps only refs whose IDs exist in the current legitimate catalog.
 * Does not hardcode titles or test-track names.
 */

export type OrphanPrunableRecentEntry = {
    itemType?: string;
    itemId?: string;
    songId?: string;
    videoId?: string;
    song?: { id?: string } | null;
    video?: { id?: string } | null;
    album?: { id?: string } | null;
    podcast?: unknown;
    [key: string]: unknown;
};

export type OrphanPrunablePlaylist = {
    songIds?: string[];
    videoIds?: string[];
    [key: string]: unknown;
};

export type CatalogIdSets = {
    songIds: Set<string>;
    videoIds: Set<string>;
    albumIds: Set<string>;
};

export function buildCatalogIdSets(
    songs: Array<{ id?: string | null }>,
    videos: Array<{ id?: string | null }> = [],
    albums: Array<{ id?: string | null }> = [],
): CatalogIdSets {
    return {
        songIds: new Set(songs.map((item) => String(item?.id || "").trim()).filter(Boolean)),
        videoIds: new Set(videos.map((item) => String(item?.id || "").trim()).filter(Boolean)),
        albumIds: new Set(albums.map((item) => String(item?.id || "").trim()).filter(Boolean)),
    };
}

function recentItemId(entry: OrphanPrunableRecentEntry) {
    return String(entry.itemId || entry.songId || entry.videoId || "").trim();
}

/**
 * Drop song/video/album history whose underlying catalog row no longer exists.
 * Podcast entries are preserved (separate catalog lifecycle).
 */
export function pruneOrphanRecentEntries<T extends OrphanPrunableRecentEntry>(
    entries: T[],
    catalog: CatalogIdSets,
): T[] {
    if (!Array.isArray(entries)) return [];
    return entries.filter((entry) => {
        const itemType = String(entry.itemType || "song");
        const itemId = recentItemId(entry);
        if (!itemId) return false;
        if (itemType === "podcast" || itemType === "podcast_episode") {
            return Boolean(entry.podcast) || Boolean(itemId);
        }
        if (itemType === "video") return catalog.videoIds.has(itemId);
        if (itemType === "album") return catalog.albumIds.has(itemId);
        return catalog.songIds.has(itemId);
    }).map((entry) => {
        const itemType = String(entry.itemType || "song");
        const itemId = recentItemId(entry);
        if (itemType === "song") {
            return {
                ...entry,
                itemId,
                songId: itemId,
                song: catalog.songIds.has(itemId) ? (entry.song && entry.song.id === itemId ? entry.song : { id: itemId }) : undefined,
                video: undefined,
                album: undefined,
            };
        }
        if (itemType === "video") {
            return {
                ...entry,
                itemId,
                video: catalog.videoIds.has(itemId) ? (entry.video && entry.video.id === itemId ? entry.video : { id: itemId }) : undefined,
                song: undefined,
                album: undefined,
            };
        }
        if (itemType === "album") {
            return {
                ...entry,
                itemId,
                album: catalog.albumIds.has(itemId) ? (entry.album && entry.album.id === itemId ? entry.album : { id: itemId }) : undefined,
                song: undefined,
                video: undefined,
            };
        }
        return entry;
    }) as T[];
}

export function pruneOrphanIdList(ids: unknown, validIds: Set<string>) {
    if (!Array.isArray(ids)) return [] as string[];
    const seen = new Set<string>();
    const next: string[] = [];
    for (const value of ids) {
        const id = String(value || "").trim();
        if (!id || seen.has(id) || !validIds.has(id)) continue;
        seen.add(id);
        next.push(id);
    }
    return next;
}

export function pruneOrphanPlaylists<T extends OrphanPrunablePlaylist>(
    playlists: T[],
    catalog: CatalogIdSets,
): T[] {
    if (!Array.isArray(playlists)) return [];
    return playlists.map((playlist) => ({
        ...playlist,
        songIds: pruneOrphanIdList(playlist.songIds, catalog.songIds),
        videoIds: pruneOrphanIdList(playlist.videoIds, catalog.videoIds),
    }));
}

export function pruneOrphanQueueItems<T extends { mediaType?: string; id?: string }>(
    items: T[],
    catalog: CatalogIdSets,
): T[] {
    if (!Array.isArray(items)) return [];
    return items.filter((item) => {
        const id = String(item?.id || "").trim();
        if (!id) return false;
        const mediaType = String(item?.mediaType || "song");
        if (mediaType === "video") return catalog.videoIds.has(id);
        return catalog.songIds.has(id);
    });
}

/**
 * Server JSON shape for user_music_state.recently_played entries.
 */
export function pruneUserMusicStateRecentlyPlayed(
    recentlyPlayed: unknown,
    catalog: CatalogIdSets,
) {
    if (!Array.isArray(recentlyPlayed)) return [];
    return recentlyPlayed.filter((entry) => {
        if (!entry || typeof entry !== "object") return false;
        const record = entry as Record<string, unknown>;
        const itemType = String(record.itemType || record.media_type || "song");
        const itemId = String(record.itemId || record.songId || record.media_id || record.id || "").trim();
        if (!itemId) return false;
        if (itemType === "podcast" || itemType === "podcast_episode") return true;
        if (itemType === "video") return catalog.videoIds.has(itemId);
        if (itemType === "album") return catalog.albumIds.has(itemId);
        return catalog.songIds.has(itemId);
    });
}

export function pruneUserMusicStatePlaylists(
    playlists: unknown,
    catalog: CatalogIdSets,
) {
    if (!Array.isArray(playlists)) return [];
    return playlists.map((playlist) => {
        if (!playlist || typeof playlist !== "object") return playlist;
        const record = playlist as Record<string, unknown>;
        return {
            ...record,
            songIds: pruneOrphanIdList(record.songIds, catalog.songIds),
            videoIds: pruneOrphanIdList(record.videoIds, catalog.videoIds),
        };
    });
}
