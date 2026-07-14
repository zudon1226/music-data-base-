import { SUPABASE_PROJECT_URL } from "./supabase-config";
import { resolveVideoPlaybackUrl as resolveCanonicalPlaybackUrl } from "./canonical-video";

export type MediaQueueType = "song" | "video";

type MediaQueueItemBase = {
    id: string;
    title: string;
    /** Canonical artist/creator display name */
    artistName: string;
    /** Alias required by Queue UI contract */
    artist: string;
    artworkUrl: string | null;
    /** Alias required by Queue UI contract */
    thumbnail: string | null;
    playableUrl: string;
    storagePath: string | null;
    ownerId: string | null;
    albumId: string | null;
    duration: number | null;
    createdAt: string | null;
};

export type SongQueueItem = MediaQueueItemBase & { mediaType: "song" };
export type VideoQueueItem = MediaQueueItemBase & { mediaType: "video" };
export type MediaQueueItem = SongQueueItem | VideoQueueItem;

export type MediaQueueState = {
    userId: string;
    items: MediaQueueItem[];
    activeIndex: number;
    authResolved: boolean;
    queueHydrated: boolean;
    isLoadingQueue: boolean;
    isSavingQueue: boolean;
};

export type EnqueueResult = {
    items: MediaQueueItem[];
    added: boolean;
    alreadyQueued: boolean;
    message: string;
    toastKind: "success" | "info" | "error";
};

export type NormalizeVideoResult = {
    item: MediaQueueItem | null;
    playableUrl: string;
    storagePath: string | null;
    sourceUrls: Record<string, string>;
    error: string | null;
};

export type NormalizeSongResult = {
    item: MediaQueueItem | null;
    playableUrl: string;
    storagePath: string | null;
    error: string | null;
};

const VIDEOS_BUCKET = "videos";
const SONGS_BUCKET = "songs";

function clean(value: unknown) {
    return typeof value === "string" ? value.trim() : "";
}

function firstNonEmpty(record: Record<string, unknown>, keys: string[]) {
    for (const key of keys) {
        const value = clean(record[key]);
        if (value) return value;
    }
    return "";
}

function isUuid(value: string) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function parseDuration(value: unknown): number | null {
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
        return value;
    }
    const text = clean(value);
    if (!text) return null;
    if (/^\d+(\.\d+)?$/.test(text)) {
        return Number(text);
    }
    const parts = text.split(":").map((part) => Number(part));
    if (parts.some((part) => !Number.isFinite(part))) return null;
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    return null;
}

function readSupabaseProjectUrl() {
    if (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_SUPABASE_URL) {
        return clean(process.env.NEXT_PUBLIC_SUPABASE_URL).replace(/\/+$/, "");
    }
    return SUPABASE_PROJECT_URL.replace(/\/+$/, "");
}

function normalizeStoragePath(value: string, bucket: string) {
    let path = value.trim().replace(/^\/+/, "");
    path = path.replace(new RegExp(`^${bucket}/+`, "i"), "");
    path = path.replace(/^public\/+/i, "");
    path = path.replace(new RegExp(`^object\\/public\\/${bucket}\\/+`, "i"), "");
    return path;
}

function publicUrlFromStoragePath(storagePath: string, bucket: string) {
    const projectUrl = readSupabaseProjectUrl();
    const path = normalizeStoragePath(storagePath, bucket);
    if (!projectUrl || !path) return "";
    const encoded = path
        .split("/")
        .filter(Boolean)
        .map((segment) => encodeURIComponent(decodeURIComponent(segment)))
        .join("/");
    return `${projectUrl}/storage/v1/object/public/${bucket}/${encoded}`;
}

function extractStoragePathFromPublicUrl(url: string, bucket: string) {
    const marker = `/storage/v1/object/public/${bucket}/`;
    try {
        const parsed = new URL(url.trim());
        const index = parsed.pathname.indexOf(marker);
        if (index < 0) return "";
        return decodeURIComponent(parsed.pathname.slice(index + marker.length));
    }
    catch {
        const index = url.indexOf(marker);
        if (index < 0) return "";
        return decodeURIComponent(url.slice(index + marker.length).split("?")[0] || "");
    }
}

function isUploadApiUrl(url: string) {
    return url.includes("/api/video-upload") || url.includes("/api/upload-video") || url.includes("/api/upload-audio");
}

function isHttpUrl(url: string) {
    return /^https?:\/\//i.test(url);
}

/**
 * Resolve a durable video playable URL via the canonical resolver.
 * Prefer public storage rebuild when storagePath is known so signed URLs are not required.
 * Never drop a valid source videoUrl when no storage path rebuild is possible.
 */
export function resolveVideoPlayableUrl(input: Record<string, unknown>): {
    playableUrl: string;
    storagePath: string | null;
    sourceUrls: Record<string, string>;
} {
    const sourceUrls: Record<string, string> = {};
    const urlKeys = [
        "playableUrl",
        "videoUrl",
        "video_url",
        "publicUrl",
        "public_url",
        "url",
        "fileUrl",
        "file_url",
    ];
    for (const key of urlKeys) {
        const value = clean(input[key]);
        if (value) sourceUrls[key] = value;
    }
    const rawStorage = firstNonEmpty(input, ["storagePath", "storage_path"]);
    let storagePath = rawStorage ? normalizeStoragePath(rawStorage, VIDEOS_BUCKET) : "";

    const resolved = resolveCanonicalPlaybackUrl({
        ...input,
        storagePath,
        storage_path: storagePath,
    });

    if (resolved.ok) {
        if (!storagePath) {
            const fromPublic = extractStoragePathFromPublicUrl(resolved.playableUrl, VIDEOS_BUCKET);
            if (fromPublic) storagePath = normalizeStoragePath(fromPublic, VIDEOS_BUCKET);
        }
        return {
            playableUrl: resolved.playableUrl,
            storagePath: storagePath || null,
            sourceUrls,
        };
    }

    // Fallback: keep any durable non-blocked HTTP URL so enqueue never loses a valid videoUrl.
    for (const candidate of urlKeys.map((key) => clean(input[key])).filter(Boolean)) {
        if (isUploadApiUrl(candidate) || candidate.startsWith("blob:") || candidate.startsWith("data:")) {
            continue;
        }
        if (isHttpUrl(candidate) || candidate.startsWith("/")) {
            if (!storagePath) {
                const fromPublic = extractStoragePathFromPublicUrl(candidate, VIDEOS_BUCKET);
                if (fromPublic) storagePath = normalizeStoragePath(fromPublic, VIDEOS_BUCKET);
            }
            return {
                playableUrl: candidate,
                storagePath: storagePath || null,
                sourceUrls,
            };
        }
    }

    if (storagePath) {
        const publicUrl = publicUrlFromStoragePath(storagePath, VIDEOS_BUCKET);
        if (publicUrl) {
            return { playableUrl: publicUrl, storagePath, sourceUrls };
        }
    }

    return {
        playableUrl: "",
        storagePath: storagePath || null,
        sourceUrls,
    };
}

export function resolveSongPlayableUrl(input: Record<string, unknown>): {
    playableUrl: string;
    storagePath: string | null;
} {
    const rawStorage = firstNonEmpty(input, ["storagePath", "storage_path", "audioPath", "audio_path"]);
    let storagePath = rawStorage ? normalizeStoragePath(rawStorage, SONGS_BUCKET) : "";
    const candidates = [
        "playableUrl",
        "audioUrl",
        "audio_url",
        "audio",
        "publicUrl",
        "public_url",
        "url",
        "fileUrl",
        "file_url",
    ].map((key) => clean(input[key])).filter(Boolean);

    for (const candidate of candidates) {
        if (isUploadApiUrl(candidate) || candidate.startsWith("blob:") || candidate.startsWith("data:")) {
            continue;
        }
        if (!storagePath) {
            const fromPublic = extractStoragePathFromPublicUrl(candidate, SONGS_BUCKET);
            if (fromPublic) storagePath = normalizeStoragePath(fromPublic, SONGS_BUCKET);
        }
        if (isHttpUrl(candidate) || candidate.startsWith("/")) {
            return { playableUrl: candidate, storagePath: storagePath || null };
        }
    }

    if (storagePath) {
        // Songs often play via /api/audio; keep storage path and a public fallback URL.
        const publicUrl = publicUrlFromStoragePath(storagePath, SONGS_BUCKET);
        const songId = clean(input.id);
        if (songId && isUuid(songId)) {
            return {
                playableUrl: `/api/audio?path=${encodeURIComponent(storagePath)}&songId=${encodeURIComponent(songId)}`,
                storagePath,
            };
        }
        return { playableUrl: publicUrl || "", storagePath };
    }

    return { playableUrl: "", storagePath: null };
}

export function mediaQueueItemKey(item: Pick<MediaQueueItem, "mediaType" | "id">) {
    return `${item.mediaType}:${item.id}`;
}

export function emptyMediaQueue(userId = ""): MediaQueueState {
    return {
        userId: clean(userId),
        items: [] as MediaQueueItem[],
        activeIndex: -1,
        authResolved: false,
        queueHydrated: false,
        isLoadingQueue: false,
        isSavingQueue: false,
    };
}

export function isSongQueueItem(item: MediaQueueItem): item is SongQueueItem {
    return item.mediaType === "song";
}

export function isVideoQueueItem(item: MediaQueueItem): item is VideoQueueItem {
    return item.mediaType === "video";
}

export function normalizeVideoToQueueItem(input: Record<string, unknown>): NormalizeVideoResult {
    const id = clean(input.id);
    const resolved = resolveVideoPlayableUrl(input);
    if (!id) {
        return {
            item: null,
            playableUrl: resolved.playableUrl,
            storagePath: resolved.storagePath,
            sourceUrls: resolved.sourceUrls,
            error: "Video is missing an id and cannot be queued.",
        };
    }
    if (!resolved.playableUrl) {
        if (typeof process === "undefined" || process.env.NODE_ENV !== "production") {
            console.warn("[media-queue] video normalize failed — no playable URL", {
                id,
                sourceUrls: resolved.sourceUrls,
                storagePath: resolved.storagePath,
                inputKeys: Object.keys(input),
            });
        }
        return {
            item: null,
            playableUrl: "",
            storagePath: resolved.storagePath,
            sourceUrls: resolved.sourceUrls,
            error: "This video has no playable URL and cannot be queued.",
        };
    }

    const artistName = firstNonEmpty(input, ["artistName", "artist", "creator", "artist_name"]) || "Unknown creator";
    const artworkUrl = firstNonEmpty(input, ["artworkUrl", "cover", "cover_url", "thumbnail_url", "thumbnailUrl", "thumbnail", "artwork"]) || null;
    const item: VideoQueueItem = {
        id,
        mediaType: "video",
        title: firstNonEmpty(input, ["title", "name"]) || "Untitled video",
        artistName,
        artist: artistName,
        artworkUrl,
        thumbnail: artworkUrl,
        playableUrl: resolved.playableUrl,
        storagePath: resolved.storagePath,
        ownerId: firstNonEmpty(input, ["ownerId", "user_id", "userId"]) || null,
        albumId: firstNonEmpty(input, ["albumId", "album_id"]) || null,
        duration: parseDuration(input.duration ?? input.durationSeconds ?? input.time),
        createdAt: firstNonEmpty(input, ["createdAt", "created_at", "uploaded"]) || null,
    };

    if (typeof process === "undefined" || process.env.NODE_ENV !== "production") {
        console.info("[media-queue] video normalized", {
            id: item.id,
            playableUrl: item.playableUrl,
            storagePath: item.storagePath,
            sourceUrls: resolved.sourceUrls,
        });
    }

    return {
        item,
        playableUrl: item.playableUrl,
        storagePath: item.storagePath,
        sourceUrls: resolved.sourceUrls,
        error: null,
    };
}

export function normalizeSongToQueueItem(input: Record<string, unknown>): NormalizeSongResult {
    const id = clean(input.id);
    const resolved = resolveSongPlayableUrl(input);
    if (!id) {
        return {
            item: null,
            playableUrl: resolved.playableUrl,
            storagePath: resolved.storagePath,
            error: "Song is missing an id and cannot be queued.",
        };
    }
    if (!resolved.playableUrl) {
        return {
            item: null,
            playableUrl: "",
            storagePath: resolved.storagePath,
            error: "This song has no playable URL and cannot be queued.",
        };
    }

    const artistName = firstNonEmpty(input, ["artistName", "artist"]) || "Unknown artist";
    const artworkUrl = firstNonEmpty(input, ["artworkUrl", "cover", "cover_url", "artwork", "thumbnail", "thumbnail_url"]) || null;
    const item: SongQueueItem = {
        id,
        mediaType: "song",
        title: firstNonEmpty(input, ["title", "name"]) || "Untitled song",
        artistName,
        artist: artistName,
        artworkUrl,
        thumbnail: artworkUrl,
        playableUrl: resolved.playableUrl,
        storagePath: resolved.storagePath,
        ownerId: firstNonEmpty(input, ["ownerId", "user_id", "userId"]) || null,
        albumId: firstNonEmpty(input, ["albumId", "album_id"]) || null,
        duration: parseDuration(input.duration ?? input.durationSeconds ?? input.time),
        createdAt: firstNonEmpty(input, ["createdAt", "created_at", "uploaded"]) || null,
    };

    return {
        item,
        playableUrl: item.playableUrl,
        storagePath: item.storagePath,
        error: null,
    };
}

/** @deprecated Prefer normalizeSongToQueueItem — kept for call-site compatibility during wiring. */
export function songToQueueMedia(input: Record<string, unknown>) {
    return normalizeSongToQueueItem(input).item;
}

/** @deprecated Prefer normalizeVideoToQueueItem */
export function videoToQueueMedia(input: Record<string, unknown>) {
    return normalizeVideoToQueueItem(input).item;
}

export function isMediaQueueItem(value: unknown): value is MediaQueueItem {
    if (!value || typeof value !== "object") return false;
    const record = value as Record<string, unknown>;
    const mediaType = clean(record.mediaType);
    const id = clean(record.id);
    const playableUrl = clean(record.playableUrl) || clean(record.videoUrl) || clean(record.audioUrl) || clean(record.audio);
    return Boolean(id && playableUrl && (mediaType === "song" || mediaType === "video"));
}

export function uniqueMediaQueueItems(items: Array<MediaQueueItem | unknown>) {
    const seen = new Set<string>();
    const next: MediaQueueItem[] = [];
    for (const value of items) {
        if (!isMediaQueueItem(value)) continue;
        const key = mediaQueueItemKey(value);
        if (seen.has(key)) continue;
        seen.add(key);
        next.push(value);
    }
    return next;
}

export function isInMediaQueue(items: MediaQueueItem[], mediaType: MediaQueueType, id: string) {
    const key = `${mediaType}:${clean(id)}`;
    return uniqueMediaQueueItems(items).some((item) => mediaQueueItemKey(item) === key);
}

export function enqueueMedia(items: MediaQueueItem[], media: MediaQueueItem): EnqueueResult {
    const cleanItems = uniqueMediaQueueItems(items);
    if (!isMediaQueueItem(media)) {
        return {
            items: cleanItems,
            added: false,
            alreadyQueued: false,
            message: "Media could not be queued.",
            toastKind: "error",
        };
    }
    if (isInMediaQueue(cleanItems, media.mediaType, media.id)) {
        return {
            items: cleanItems,
            added: false,
            alreadyQueued: true,
            message: "Already in queue.",
            toastKind: "info",
        };
    }
    return {
        items: [...cleanItems, media],
        added: true,
        alreadyQueued: false,
        message: "Added to queue.",
        toastKind: "success",
    };
}

export function dequeueMedia(items: MediaQueueItem[], mediaType: MediaQueueType, id: string) {
    const key = `${mediaType}:${clean(id)}`;
    return uniqueMediaQueueItems(items).filter((item) => mediaQueueItemKey(item) !== key);
}

export function clearMediaQueueItems() {
    return [] as MediaQueueItem[];
}

export function moveMediaQueueItem(items: MediaQueueItem[], mediaType: MediaQueueType, id: string, direction: -1 | 1) {
    const next = uniqueMediaQueueItems(items);
    const index = next.findIndex((item) => item.mediaType === mediaType && item.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= next.length) return next;
    const [entry] = next.splice(index, 1);
    next.splice(target, 0, entry);
    return next;
}

export function moveMediaQueueItemTo(
    items: MediaQueueItem[],
    mediaType: MediaQueueType,
    id: string,
    targetType: MediaQueueType,
    targetId: string,
) {
    if (mediaType === targetType && id === targetId) return uniqueMediaQueueItems(items);
    const next = uniqueMediaQueueItems(items);
    const from = next.findIndex((item) => item.mediaType === mediaType && item.id === id);
    const to = next.findIndex((item) => item.mediaType === targetType && item.id === targetId);
    if (from < 0 || to < 0) return next;
    const [entry] = next.splice(from, 1);
    next.splice(to, 0, entry);
    return next;
}

export function clampQueueActiveIndex(items: MediaQueueItem[], activeIndex: number) {
    if (items.length === 0) return -1;
    if (!Number.isFinite(activeIndex) || activeIndex < -1) return -1;
    if (activeIndex >= items.length) return items.length - 1;
    return activeIndex;
}

export function getUpNextMediaItems(items: MediaQueueItem[], activeIndex: number) {
    const cleanItems = uniqueMediaQueueItems(items);
    const index = clampQueueActiveIndex(cleanItems, activeIndex);
    if (index < 0) return cleanItems;
    return cleanItems.slice(index + 1);
}

export function selectQueueItem(
    items: MediaQueueItem[],
    activeIndex: number,
    mediaType: MediaQueueType,
    id: string,
) {
    const cleanItems = uniqueMediaQueueItems(items);
    const index = cleanItems.findIndex((entry) => entry.mediaType === mediaType && entry.id === id);
    if (index < 0) {
        return {
            items: cleanItems,
            activeIndex: clampQueueActiveIndex(cleanItems, activeIndex),
            item: null as MediaQueueItem | null,
        };
    }
    return { items: cleanItems, activeIndex: index, item: cleanItems[index] };
}

export function selectNextQueueItem(items: MediaQueueItem[], activeIndex: number) {
    const cleanItems = uniqueMediaQueueItems(items);
    if (cleanItems.length === 0) {
        return { items: cleanItems, activeIndex: -1, item: null as MediaQueueItem | null };
    }
    const current = clampQueueActiveIndex(cleanItems, activeIndex);
    const nextIndex = current < 0 ? 0 : current + 1;
    if (nextIndex >= cleanItems.length) {
        return { items: cleanItems, activeIndex: current, item: null as MediaQueueItem | null };
    }
    return { items: cleanItems, activeIndex: nextIndex, item: cleanItems[nextIndex] };
}

export function selectPreviousQueueItem(items: MediaQueueItem[], activeIndex: number) {
    const cleanItems = uniqueMediaQueueItems(items);
    if (cleanItems.length === 0) {
        return { items: cleanItems, activeIndex: -1, item: null as MediaQueueItem | null };
    }
    const current = clampQueueActiveIndex(cleanItems, activeIndex);
    if (current <= 0) {
        return { items: cleanItems, activeIndex: 0, item: cleanItems[0] };
    }
    const previousIndex = current - 1;
    return { items: cleanItems, activeIndex: previousIndex, item: cleanItems[previousIndex] };
}

export function replaceMediaQueue(items: MediaQueueItem[], startIndex = 0) {
    const cleanItems = uniqueMediaQueueItems(items);
    if (cleanItems.length === 0) {
        return { items: [], activeIndex: -1, item: null as MediaQueueItem | null };
    }
    if (startIndex < 0) {
        return { items: cleanItems, activeIndex: -1, item: null as MediaQueueItem | null };
    }
    const index = Math.min(startIndex, cleanItems.length - 1);
    return { items: cleanItems, activeIndex: index, item: cleanItems[index] };
}

export function clearInMemoryMediaQueue(): MediaQueueState {
    return emptyMediaQueue("");
}

export function assertQueueNeverWritesAuthMetadata(payload: Record<string, unknown>) {
    if ("queueIds" in payload || "queue" in payload || "mediaQueue" in payload) {
        throw new Error("Queue data must not be written to Auth user_metadata.");
    }
}

export type QueueMediaItem = MediaQueueItem;
export type QueueMediaType = MediaQueueType;
