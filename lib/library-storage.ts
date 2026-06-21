export type LibraryCache = {
    userId: string;
    songIds: string[];
    videoIds: string[];
    albumIds: string[];
};

export const LIBRARY_CACHE_STORAGE_KEY = "zml_library";

function uniqueIds(values: unknown) {
    if (!Array.isArray(values)) {
        return [];
    }
    return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

function isUuid(value: string) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function emptyLibraryCache(userId = ""): LibraryCache {
    return {
        userId,
        songIds: [],
        videoIds: [],
        albumIds: [],
    };
}

export function readLibraryCache(expectedUserId = ""): LibraryCache | null {
    if (typeof window === "undefined") {
        return null;
    }
    try {
        const raw = window.localStorage.getItem(LIBRARY_CACHE_STORAGE_KEY);
        if (!raw) {
            return null;
        }
        const parsed = JSON.parse(raw) as unknown;
        if (Array.isArray(parsed)) {
            return null;
        }
        if (!parsed || typeof parsed !== "object") {
            return null;
        }
        const record = parsed as Record<string, unknown>;
        const userId = String(record.userId || "").trim();
        if (!userId || !isUuid(userId)) {
            return null;
        }
        if (expectedUserId && userId !== expectedUserId) {
            return null;
        }
        return {
            userId,
            songIds: uniqueIds(record.songIds),
            videoIds: uniqueIds(record.videoIds),
            albumIds: uniqueIds(record.albumIds),
        };
    }
    catch {
        return null;
    }
}

export function writeLibraryCache(cache: LibraryCache) {
    if (typeof window === "undefined") {
        return;
    }
    const userId = String(cache.userId || "").trim();
    if (!userId || !isUuid(userId)) {
        return;
    }
    window.localStorage.setItem(LIBRARY_CACHE_STORAGE_KEY, JSON.stringify({
        userId,
        songIds: uniqueIds(cache.songIds),
        videoIds: uniqueIds(cache.videoIds),
        albumIds: uniqueIds(cache.albumIds),
    }));
}

export function clearLibraryCache() {
    if (typeof window === "undefined") {
        return;
    }
    window.localStorage.removeItem(LIBRARY_CACHE_STORAGE_KEY);
}

export function serializeLibraryCache(cache: LibraryCache) {
    return JSON.stringify({
        userId: cache.userId,
        songIds: uniqueIds(cache.songIds),
        videoIds: uniqueIds(cache.videoIds),
        albumIds: uniqueIds(cache.albumIds),
    });
}

export function applyLibraryCacheToState(
    cache: LibraryCache,
    setters: {
        setLibraryIds: (value: string[]) => void;
        setSavedVideoIds: (value: string[]) => void;
        setSavedAlbumIds: (value: string[]) => void;
    },
) {
    setters.setLibraryIds(uniqueIds(cache.songIds));
    setters.setSavedVideoIds(uniqueIds(cache.videoIds));
    setters.setSavedAlbumIds(uniqueIds(cache.albumIds));
}
