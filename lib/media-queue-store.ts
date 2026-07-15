import type { SupabaseClient } from "@supabase/supabase-js";
import { getErrorMessage, getSupabaseLibraryClient, getSupabaseServerClient } from "@/lib/server-supabase";
import {
    isMediaQueueItem,
    uniqueMediaQueueItems,
    type MediaQueueItem,
} from "@/lib/desktop-media-queue";

const QUEUE_BUCKET = "user-media-queues";
const QUEUE_OBJECT = "queue.json";

function isMissingQueueTable(error: unknown) {
    const code = error && typeof error === "object" ? String((error as Record<string, unknown>).code || "") : "";
    return code === "42P01" || code === "PGRST205";
}

function rowToItem(row: Record<string, unknown>): MediaQueueItem | null {
    const mediaType = String(row.media_type || "").trim();
    if (mediaType !== "song" && mediaType !== "video") return null;
    const artistName = String(row.artist_name || "").trim() || "Unknown";
    const artworkUrl = row.artwork_url == null ? null : String(row.artwork_url);
    const item = {
        id: String(row.media_source_id || "").trim(),
        mediaType,
        title: String(row.title || "").trim() || (mediaType === "video" ? "Untitled video" : "Untitled song"),
        artistName,
        artist: artistName,
        artworkUrl,
        thumbnail: artworkUrl,
        playableUrl: String(row.playable_url || "").trim(),
        storagePath: row.storage_path == null ? null : String(row.storage_path),
        ownerId: row.owner_id == null ? null : String(row.owner_id),
        albumId: row.album_id == null ? null : String(row.album_id),
        duration: typeof row.duration_seconds === "number" ? row.duration_seconds : null,
        createdAt: row.source_created_at == null ? null : String(row.source_created_at),
    } as MediaQueueItem;
    return isMediaQueueItem(item) ? item : null;
}

async function ensureQueueBucket() {
    const supabase = getSupabaseLibraryClient();
    const { data: buckets, error } = await supabase.storage.listBuckets();
    if (error) {
        console.warn("[media-queue-store] listBuckets failed:", error.message);
    }
    const exists = (buckets || []).some((bucket) => bucket.name === QUEUE_BUCKET || bucket.id === QUEUE_BUCKET);
    if (exists) return;
    const create = await supabase.storage.createBucket(QUEUE_BUCKET, {
        public: false,
        fileSizeLimit: 2 * 1024 * 1024,
        allowedMimeTypes: ["application/json"],
    });
    if (create.error && !String(create.error.message || "").toLowerCase().includes("already exists")) {
        throw create.error;
    }
}

function queueObjectPath(userId: string) {
    return `${userId}/${QUEUE_OBJECT}`;
}

function queueAfterMediaRemoval(
    items: MediaQueueItem[],
    activeIndex: number,
    mediaType: "song" | "video",
    mediaId: string,
) {
    const cleanItems = uniqueMediaQueueItems(items);
    const activeItem = activeIndex >= 0 ? cleanItems[activeIndex] : null;
    const nextItems = cleanItems.filter((item) => !(item.mediaType === mediaType && item.id === mediaId));
    if (nextItems.length === cleanItems.length) {
        return { changed: false, items: cleanItems, activeIndex };
    }
    const removedActiveItem = Boolean(activeItem && activeItem.mediaType === mediaType && activeItem.id === mediaId);
    const removedBeforeActive = cleanItems
        .slice(0, Math.max(0, activeIndex))
        .filter((item) => item.mediaType === mediaType && item.id === mediaId)
        .length;
    const nextActiveIndex = removedActiveItem
        ? Math.min(Math.max(0, activeIndex - removedBeforeActive), nextItems.length - 1)
        : activeItem
            ? nextItems.findIndex((item) => item.mediaType === activeItem.mediaType && item.id === activeItem.id)
            : Math.min(activeIndex, nextItems.length - 1);
    return {
        changed: true,
        items: nextItems,
        activeIndex: nextItems.length === 0 ? -1 : Math.max(-1, nextActiveIndex),
    };
}

async function listAllQueueStorageUsers(supabase: SupabaseClient) {
    const users: string[] = [];
    const limit = 100;
    for (let offset = 0; ; offset += limit) {
        const { data, error } = await supabase.storage.from(QUEUE_BUCKET).list("", {
            limit,
            offset,
            sortBy: { column: "name", order: "asc" },
        });
        if (error) {
            const message = getErrorMessage(error).toLowerCase();
            if (message.includes("not found")) return [];
            throw error;
        }
        const rows = data || [];
        users.push(...rows
            .map((entry) => String(entry.name || "").trim())
            .filter((name) => /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(name)));
        if (rows.length < limit) break;
    }
    return [...new Set(users)];
}

async function loadMediaQueueFromStorageWithClient(supabase: SupabaseClient, userId: string) {
    const { data, error } = await supabase.storage.from(QUEUE_BUCKET).download(queueObjectPath(userId));
    if (error || !data) {
        const message = getErrorMessage(error).toLowerCase();
        if (message.includes("not found") || message.includes("404") || message.includes("object")) {
            return { items: [] as MediaQueueItem[], activeIndex: -1 };
        }
        throw error || new Error("Failed to download queue.");
    }
    const parsed = JSON.parse(await data.text() || "{}") as {
        items?: unknown[];
        activeIndex?: number;
    };
    return {
        items: uniqueMediaQueueItems(Array.isArray(parsed.items) ? parsed.items : []),
        activeIndex: typeof parsed.activeIndex === "number" ? parsed.activeIndex : -1,
    };
}

async function saveMediaQueueToStorageWithClient(
    supabase: SupabaseClient,
    userId: string,
    items: MediaQueueItem[],
    activeIndex: number,
) {
    const payload = new Blob([JSON.stringify({
        userId,
        items,
        activeIndex,
        updatedAt: new Date().toISOString(),
    })], { type: "application/json" });
    const { error } = await supabase.storage.from(QUEUE_BUCKET).upload(queueObjectPath(userId), payload, {
        upsert: true,
        contentType: "application/json",
        cacheControl: "0",
    });
    if (error) throw error;
}

export async function loadMediaQueueFromStorage(userId: string): Promise<{
    items: MediaQueueItem[];
    activeIndex: number;
    backend: "storage";
}> {
    await ensureQueueBucket();
    const supabase = getSupabaseLibraryClient();
    const { data, error } = await supabase.storage.from(QUEUE_BUCKET).download(queueObjectPath(userId));
    if (error || !data) {
        const message = String(error?.message || "").toLowerCase();
        if (message.includes("not found") || message.includes("404") || message.includes("object")) {
            return { items: [], activeIndex: -1, backend: "storage" };
        }
        throw error || new Error("Failed to download queue.");
    }
    const text = await data.text();
    const parsed = JSON.parse(text || "{}") as {
        items?: unknown[];
        activeIndex?: number;
    };
    const items = uniqueMediaQueueItems(Array.isArray(parsed.items) ? parsed.items : []);
    const activeIndex = typeof parsed.activeIndex === "number" ? parsed.activeIndex : -1;
    return { items, activeIndex, backend: "storage" };
}

export async function saveMediaQueueToStorage(
    userId: string,
    items: MediaQueueItem[],
    activeIndex: number,
): Promise<{ backend: "storage" }> {
    await ensureQueueBucket();
    const supabase = getSupabaseLibraryClient();
    const payload = JSON.stringify({
        userId,
        items,
        activeIndex,
        updatedAt: new Date().toISOString(),
    });
    const blob = new Blob([payload], { type: "application/json" });
    const { error } = await supabase.storage
        .from(QUEUE_BUCKET)
        .upload(queueObjectPath(userId), blob, {
            upsert: true,
            contentType: "application/json",
            cacheControl: "0",
        });
    if (error) throw error;
    return { backend: "storage" };
}

export async function loadMediaQueue(userId: string): Promise<{
    items: MediaQueueItem[];
    activeIndex: number;
    backend: "database" | "storage";
    setupRequired?: boolean;
}> {
    const supabase = getSupabaseLibraryClient();
    const [itemsResult, stateResult] = await Promise.all([
        supabase
            .from("user_media_queue_items")
            .select("media_source_id,media_type,position,title,artist_name,artwork_url,playable_url,storage_path,owner_id,album_id,duration_seconds,source_created_at")
            .eq("user_id", userId)
            .order("position", { ascending: true }),
        supabase
            .from("user_media_queue_state")
            .select("active_index")
            .eq("user_id", userId)
            .maybeSingle(),
    ]);

    if (itemsResult.error && isMissingQueueTable(itemsResult.error)) {
        const fromStorage = await loadMediaQueueFromStorage(userId);
        return { ...fromStorage, setupRequired: true };
    }
    if (itemsResult.error) {
        throw itemsResult.error;
    }
    if (stateResult.error && !isMissingQueueTable(stateResult.error)) {
        throw stateResult.error;
    }

    const items = uniqueMediaQueueItems(
        (itemsResult.data || [])
            .map((row) => rowToItem(row as Record<string, unknown>))
            .filter(Boolean),
    );
    const activeIndex = typeof stateResult.data?.active_index === "number"
        ? stateResult.data.active_index
        : -1;
    return { items, activeIndex, backend: "database" };
}

export async function saveMediaQueue(
    userId: string,
    items: MediaQueueItem[],
    activeIndex: number,
): Promise<{ backend: "database" | "storage"; setupRequired?: boolean }> {
    const supabase = getSupabaseLibraryClient();
    const { error: deleteError } = await supabase
        .from("user_media_queue_items")
        .delete()
        .eq("user_id", userId);

    if (deleteError && isMissingQueueTable(deleteError)) {
        const saved = await saveMediaQueueToStorage(userId, items, activeIndex);
        return { ...saved, setupRequired: true };
    }
    if (deleteError) {
        throw deleteError;
    }

    if (items.length > 0) {
        const rows = items.map((item, position) => ({
            user_id: userId,
            media_source_id: item.id,
            media_type: item.mediaType,
            position,
            title: item.title,
            artist_name: item.artistName,
            artwork_url: item.artworkUrl,
            playable_url: item.playableUrl,
            storage_path: item.storagePath,
            owner_id: item.ownerId,
            album_id: item.albumId,
            duration_seconds: item.duration,
            source_created_at: item.createdAt,
            updated_at: new Date().toISOString(),
        }));
        const { error: insertError } = await supabase
            .from("user_media_queue_items")
            .insert(rows);
        if (insertError) {
            if (isMissingQueueTable(insertError)) {
                const saved = await saveMediaQueueToStorage(userId, items, activeIndex);
                return { ...saved, setupRequired: true };
            }
            throw insertError;
        }
    }

    const { error: stateError } = await supabase
        .from("user_media_queue_state")
        .upsert({
            user_id: userId,
            active_index: activeIndex,
            updated_at: new Date().toISOString(),
        }, { onConflict: "user_id" });
    if (stateError && !isMissingQueueTable(stateError)) {
        throw stateError;
    }

    return { backend: "database" };
}

/**
 * Remove a media id from every persisted queue.
 * Handles both the database backend and the Storage fallback, and verifies
 * that no queue still contains the deleted item before returning.
 */
export async function removeMediaFromAllStoredQueues(
    mediaType: "song" | "video",
    mediaId: string,
): Promise<{ backends: Array<"database" | "storage">; queuesUpdated: number }> {
    const cleanId = String(mediaId || "").trim();
    if (!cleanId) throw new Error("Queue cleanup requires a media id.");
    const supabase = getSupabaseServerClient();
    const queueRows: Array<{ user_id: unknown }> = [];
    let queueTablesMissing = false;
    const queuePageSize = 500;
    for (let offset = 0; ; offset += queuePageSize) {
        const { data, error } = await supabase
            .from("user_media_queue_items")
            .select("user_id")
            .eq("media_source_id", cleanId)
            .eq("media_type", mediaType)
            .order("user_id", { ascending: true })
            .range(offset, offset + queuePageSize - 1);
        if (error) {
            if (isMissingQueueTable(error)) {
                queueTablesMissing = true;
                break;
            }
            throw error;
        }
        const page = (data || []) as Array<{ user_id: unknown }>;
        queueRows.push(...page);
        if (page.length < queuePageSize) break;
    }
    const backends: Array<"database" | "storage"> = [];
    let queuesUpdated = 0;
    if (!queueTablesMissing) {
        const userIds = [...new Set((queueRows || [])
            .map((row) => String(row.user_id || "").trim())
            .filter(Boolean))];
        for (const userId of userIds) {
            const [itemsResult, stateResult] = await Promise.all([
                supabase
                    .from("user_media_queue_items")
                    .select("media_source_id,media_type,position,title,artist_name,artwork_url,playable_url,storage_path,owner_id,album_id,duration_seconds,source_created_at")
                    .eq("user_id", userId)
                    .order("position", { ascending: true }),
                supabase
                    .from("user_media_queue_state")
                    .select("active_index")
                    .eq("user_id", userId)
                    .maybeSingle(),
            ]);
            if (itemsResult.error) throw itemsResult.error;
            if (stateResult.error && !isMissingQueueTable(stateResult.error)) throw stateResult.error;
            const loaded = {
                items: uniqueMediaQueueItems((itemsResult.data || [])
                    .map((row) => rowToItem(row as Record<string, unknown>))
                    .filter(Boolean)),
                activeIndex: typeof stateResult.data?.active_index === "number"
                    ? stateResult.data.active_index
                    : -1,
            };
            const next = queueAfterMediaRemoval(loaded.items, loaded.activeIndex, mediaType, cleanId);
            if (!next.changed) continue;
            const { error: deleteError } = await supabase
                .from("user_media_queue_items")
                .delete()
                .eq("user_id", userId);
            if (deleteError) throw deleteError;
            if (next.items.length > 0) {
                const { error: insertError } = await supabase.from("user_media_queue_items").insert(
                    next.items.map((item, position) => ({
                        user_id: userId,
                        media_source_id: item.id,
                        media_type: item.mediaType,
                        position,
                        title: item.title,
                        artist_name: item.artistName,
                        artwork_url: item.artworkUrl,
                        playable_url: item.playableUrl,
                        storage_path: item.storagePath,
                        owner_id: item.ownerId,
                        album_id: item.albumId,
                        duration_seconds: item.duration,
                        source_created_at: item.createdAt,
                        updated_at: new Date().toISOString(),
                    })),
                );
                if (insertError) throw insertError;
            }
            const { error: stateError } = await supabase.from("user_media_queue_state").upsert({
                user_id: userId,
                active_index: next.activeIndex,
                updated_at: new Date().toISOString(),
            }, { onConflict: "user_id" });
            if (stateError && !isMissingQueueTable(stateError)) throw stateError;
            queuesUpdated += 1;
        }
        const { count, error: verifyError } = await supabase
            .from("user_media_queue_items")
            .select("media_source_id", { count: "exact", head: true })
            .eq("media_source_id", cleanId)
            .eq("media_type", mediaType);
        if (verifyError) throw verifyError;
        if ((count || 0) !== 0) {
            throw new Error(`Queue cleanup verification failed for ${mediaType}:${cleanId}.`);
        }
        backends.push("database");
    }

    const userIds = await listAllQueueStorageUsers(supabase);
    for (const userId of userIds) {
        const loaded = await loadMediaQueueFromStorageWithClient(supabase, userId);
        const next = queueAfterMediaRemoval(loaded.items, loaded.activeIndex, mediaType, cleanId);
        if (!next.changed) continue;
        await saveMediaQueueToStorageWithClient(supabase, userId, next.items, next.activeIndex);
        const verified = await loadMediaQueueFromStorageWithClient(supabase, userId);
        if (verified.items.some((item) => item.mediaType === mediaType && item.id === cleanId)) {
            throw new Error(`Storage queue cleanup verification failed for ${mediaType}:${cleanId} in ${userId}.`);
        }
        queuesUpdated += 1;
    }
    backends.push("storage");
    return { backends, queuesUpdated };
}
