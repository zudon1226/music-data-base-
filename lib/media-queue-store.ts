import { getErrorMessage, getSupabaseLibraryClient } from "@/lib/server-supabase";
import {
    isMediaQueueItem,
    uniqueMediaQueueItems,
    type MediaQueueItem,
} from "@/lib/desktop-media-queue";

const QUEUE_BUCKET = "user-media-queues";
const QUEUE_OBJECT = "queue.json";

function isMissingQueueTable(error: unknown) {
    const message = getErrorMessage(error).toLowerCase();
    const code = error && typeof error === "object" ? String((error as Record<string, unknown>).code || "") : "";
    return code === "42P01"
        || code === "PGRST205"
        || message.includes("user_media_queue_items")
        || message.includes("user_media_queue_state")
        || message.includes("does not exist")
        || message.includes("schema cache");
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
