import type { SupabaseClient } from "@supabase/supabase-js";
import { getErrorMessage } from "@/lib/server-supabase";
import { removeMediaFromAllStoredQueues } from "@/lib/media-queue-store";

export type DeletedMediaType = "song" | "video";

function isMissingOptionalTable(error: unknown) {
    const code = error && typeof error === "object"
        ? String((error as Record<string, unknown>).code || "")
        : "";
    return code === "42P01" || code === "PGRST205";
}

function normalizeStorageObjectPath(rawValue: string, bucket: string) {
    const raw = String(rawValue || "").trim();
    if (!raw) return "";
    let path = raw;
    try {
        path = decodeURIComponent(new URL(raw).pathname);
    }
    catch {
        try {
            path = decodeURIComponent(raw);
        }
        catch {
            path = raw;
        }
    }
    path = path.replace(/^\/+/, "");
    const markers = [
        `storage/v1/object/public/${bucket}/`,
        `storage/v1/object/sign/${bucket}/`,
        `storage/v1/object/authenticated/${bucket}/`,
        `object/public/${bucket}/`,
        `object/sign/${bucket}/`,
        `object/authenticated/${bucket}/`,
        `${bucket}/`,
    ];
    for (const marker of markers) {
        if (path.toLowerCase().startsWith(marker.toLowerCase())) {
            path = path.slice(marker.length);
            break;
        }
    }
    return path.replace(/^\/+/, "").split("?")[0].split("#")[0];
}

export async function deleteStorageObjectStrict(
    supabase: SupabaseClient,
    bucket: string,
    rawPath: string,
) {
    const storagePath = normalizeStorageObjectPath(rawPath, bucket);
    if (!storagePath) {
        console.error("[media-delete-lifecycle] storage delete failed", {
            bucket,
            storagePath: "",
            error: "Stored object path is missing.",
        });
        throw new Error(`Storage delete failed for ${bucket}: stored object path is missing.`);
    }
    const { error: removeError } = await supabase.storage.from(bucket).remove([storagePath]);
    if (removeError) {
        console.error("[media-delete-lifecycle] storage delete failed", {
            bucket,
            storagePath,
            error: getErrorMessage(removeError),
        });
        throw new Error(`Storage delete failed for ${bucket}/${storagePath}: ${getErrorMessage(removeError)}`);
    }

    const slash = storagePath.lastIndexOf("/");
    const folder = slash >= 0 ? storagePath.slice(0, slash) : "";
    const fileName = slash >= 0 ? storagePath.slice(slash + 1) : storagePath;
    const limit = 100;
    for (let offset = 0; ; offset += limit) {
        const { data: remaining, error: verifyError } = await supabase.storage.from(bucket).list(folder, {
            limit,
            offset,
            search: fileName,
            sortBy: { column: "name", order: "asc" },
        });
        if (verifyError) {
            console.error("[media-delete-lifecycle] storage delete verification failed", {
                bucket,
                storagePath,
                error: getErrorMessage(verifyError),
            });
            throw new Error(`Storage delete verification failed for ${bucket}/${storagePath}: ${getErrorMessage(verifyError)}`);
        }
        if ((remaining || []).some((entry) => entry.name === fileName)) {
            console.error("[media-delete-lifecycle] storage object still exists after delete", {
                bucket,
                storagePath,
            });
            throw new Error(`Storage object still exists after delete: ${bucket}/${storagePath}`);
        }
        if ((remaining || []).length < limit) break;
    }
    return { storagePath, deleted: true };
}

function recentEntryMatches(entry: unknown, mediaType: DeletedMediaType, mediaId: string) {
    if (!entry || typeof entry !== "object") return false;
    const record = entry as Record<string, unknown>;
    if (mediaType === "song" && String(record.songId || "") === mediaId) return true;
    if (mediaType === "video" && String(record.videoId || "") === mediaId) return true;
    return String(record.itemType || "") === mediaType && String(record.itemId || "") === mediaId;
}

function playlistContainsMedia(playlist: unknown, mediaType: DeletedMediaType, mediaId: string) {
    if (!playlist || typeof playlist !== "object") return false;
    const record = playlist as Record<string, unknown>;
    const idKey = mediaType === "song" ? "songIds" : "videoIds";
    return Array.isArray(record[idKey]) && record[idKey].includes(mediaId);
}

async function loadAllUserMusicState(supabase: SupabaseClient) {
    const rows: Array<Record<string, unknown>> = [];
    const limit = 500;
    for (let offset = 0; ; offset += limit) {
        const { data, error } = await supabase
            .from("user_music_state")
            .select("user_id,library_ids,recently_played,playlists")
            .order("user_id", { ascending: true })
            .range(offset, offset + limit - 1);
        if (error) {
            if (isMissingOptionalTable(error)) return [];
            throw error;
        }
        const page = (data || []) as Array<Record<string, unknown>>;
        rows.push(...page);
        if (page.length < limit) break;
    }
    return rows;
}

export async function removeMediaFromUserMusicState(
    supabase: SupabaseClient,
    mediaType: DeletedMediaType,
    mediaId: string,
) {
    const data = await loadAllUserMusicState(supabase);
    let rowsUpdated = 0;
    for (const row of data) {
        const libraryIds = Array.isArray(row.library_ids)
            ? row.library_ids.filter((id) => id !== mediaId)
            : [];
        const recentlyPlayed = Array.isArray(row.recently_played)
            ? row.recently_played.filter((entry) => !recentEntryMatches(entry, mediaType, mediaId))
            : [];
        const playlists = Array.isArray(row.playlists)
            ? row.playlists.map((playlist) => {
                if (!playlist || typeof playlist !== "object") return playlist;
                const record = playlist as Record<string, unknown>;
                const idKey = mediaType === "song" ? "songIds" : "videoIds";
                return {
                    ...record,
                    [idKey]: Array.isArray(record[idKey])
                        ? record[idKey].filter((id) => id !== mediaId)
                        : record[idKey],
                    updatedAt: new Date().toISOString(),
                };
            })
            : [];
        const changed = JSON.stringify(libraryIds) !== JSON.stringify(row.library_ids || [])
            || JSON.stringify(recentlyPlayed) !== JSON.stringify(row.recently_played || [])
            || JSON.stringify(playlists) !== JSON.stringify(row.playlists || []);
        if (!changed) continue;
        const { error: updateError } = await supabase
            .from("user_music_state")
            .update({
                library_ids: libraryIds,
                recently_played: recentlyPlayed,
                playlists,
                updated_at: new Date().toISOString(),
            })
            .eq("user_id", row.user_id);
        if (updateError) throw updateError;
        rowsUpdated += 1;
    }
    const verifiedRows = await loadAllUserMusicState(supabase);
    const staleRow = verifiedRows.find((row) => {
        const libraryIds = Array.isArray(row.library_ids) ? row.library_ids : [];
        const recentlyPlayed = Array.isArray(row.recently_played) ? row.recently_played : [];
        const playlists = Array.isArray(row.playlists) ? row.playlists : [];
        return libraryIds.includes(mediaId)
            || recentlyPlayed.some((entry) => recentEntryMatches(entry, mediaType, mediaId))
            || playlists.some((playlist) => playlistContainsMedia(playlist, mediaType, mediaId));
    });
    if (staleRow) {
        throw new Error(`user_music_state cleanup verification failed for ${mediaType}:${mediaId}.`);
    }
    return { rowsUpdated };
}

function legacyRowMatchesMedia(row: Record<string, unknown>, mediaType: DeletedMediaType, mediaId: string) {
    const typedItemMatches = String(row.item_id || "") === mediaId
        && (!row.item_type || String(row.item_type) === mediaType);
    const mediaMatches = String(row.media_id || "") === mediaId
        && (!row.media_type || String(row.media_type) === mediaType);
    const directMatches = mediaType === "song"
        ? String(row.song_id || "") === mediaId
        : String(row.video_id || "") === mediaId;
    return typedItemMatches || mediaMatches || directMatches;
}

async function loadAllOptionalTableRows(supabase: SupabaseClient, tableName: string) {
    const rows: Array<Record<string, unknown>> = [];
    const limit = 500;
    for (let offset = 0; ; offset += limit) {
        const { data, error } = await supabase
            .from(tableName)
            .select("*")
            .range(offset, offset + limit - 1);
        if (error) {
            if (isMissingOptionalTable(error)) return null;
            throw error;
        }
        const page = (data || []) as Array<Record<string, unknown>>;
        rows.push(...page);
        if (page.length < limit) break;
    }
    return rows;
}

/**
 * Clean legacy tables without assuming a historical column layout.
 * The table is scanned with service-role access, matching reference columns
 * are observed from real rows, and the table is re-scanned for verification.
 */
export async function deleteOptionalLegacyMediaRows(
    supabase: SupabaseClient,
    tableName: string,
    mediaType: DeletedMediaType,
    mediaId: string,
) {
    const rows = await loadAllOptionalTableRows(supabase, tableName);
    if (rows === null) return { tableMissing: true, rowsDeleted: 0 };
    const matches = rows.filter((row) => legacyRowMatchesMedia(row, mediaType, mediaId));
    const referenceColumns = [...new Set(matches.flatMap((row) => {
        const columns: string[] = [];
        if (String(row.item_id || "") === mediaId) columns.push("item_id");
        if (String(row.media_id || "") === mediaId) columns.push("media_id");
        if (mediaType === "song" && String(row.song_id || "") === mediaId) columns.push("song_id");
        if (mediaType === "video" && String(row.video_id || "") === mediaId) columns.push("video_id");
        return columns;
    }))];
    for (const column of referenceColumns) {
        let query = supabase.from(tableName).delete().eq(column, mediaId);
        const tableUsesType = matches.some((row) => (
            (column === "item_id" && "item_type" in row)
            || (column === "media_id" && "media_type" in row)
        ));
        if (tableUsesType) {
            query = column === "item_id"
                ? query.eq("item_type", mediaType)
                : query.eq("media_type", mediaType);
        }
        const { error } = await query;
        if (error) throw error;
    }
    const verifiedRows = await loadAllOptionalTableRows(supabase, tableName);
    if (verifiedRows?.some((row) => legacyRowMatchesMedia(row, mediaType, mediaId))) {
        throw new Error(`${tableName} cleanup verification failed for ${mediaType}:${mediaId}.`);
    }
    return { tableMissing: false, rowsDeleted: matches.length };
}

export async function cleanupPersistedMediaQueues(mediaType: DeletedMediaType, mediaId: string) {
    try {
        return await removeMediaFromAllStoredQueues(mediaType, mediaId);
    }
    catch (error) {
        console.error("[media-delete-lifecycle] queue cleanup failed", {
            mediaType,
            mediaId,
            error: getErrorMessage(error),
        });
        throw new Error(`Queue cleanup failed for ${mediaType}:${mediaId}: ${getErrorMessage(error)}`);
    }
}
