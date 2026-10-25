import { buildGuardedAudioPlaybackUrl } from "./guarded-playback-url.mjs";

export const SONGS_BUCKET = "songs";
export const SONGS_PUBLIC_PATH_MARKER = `/storage/v1/object/public/${SONGS_BUCKET}/`;

export function normalizeSongStoragePath(rawPath: string | null | undefined) {
    return decodeURIComponent(String(rawPath || "").trim()).replace(/^\/+/, "");
}

export function encodeSongStoragePath(path: string) {
    return normalizeSongStoragePath(path)
        .split("/")
        .filter(Boolean)
        .map((segment) => encodeURIComponent(segment))
        .join("/");
}

export function extractSongStoragePathFromPublicUrl(audioUrl: string | null | undefined) {
    const cleanUrl = String(audioUrl || "").trim();
    if (!cleanUrl) {
        return "";
    }

    try {
        const url = new URL(cleanUrl);
        const markerIndex = url.href.indexOf(SONGS_PUBLIC_PATH_MARKER);
        if (markerIndex >= 0) {
            const storagePath = url.href.slice(markerIndex + SONGS_PUBLIC_PATH_MARKER.length).split("?")[0] || "";
            return normalizeSongStoragePath(decodeURIComponent(storagePath));
        }
    }
    catch {
        const markerIndex = cleanUrl.indexOf(SONGS_PUBLIC_PATH_MARKER);
        if (markerIndex >= 0) {
            const storagePath = cleanUrl.slice(markerIndex + SONGS_PUBLIC_PATH_MARKER.length).split("?")[0] || "";
            return normalizeSongStoragePath(decodeURIComponent(storagePath));
        }
    }

    return "";
}

/** Recover the object path from `/api/audio?path=` so catalog responses can omit storage_path. */
export function extractSongStoragePathFromGuardedPlaybackUrl(audioUrl: string | null | undefined) {
    const cleanUrl = String(audioUrl || "").trim();
    if (!cleanUrl) return "";
    try {
        const url = new URL(cleanUrl, "https://digitalmusicdatabase.com");
        if (url.pathname !== "/api/audio") return "";
        return normalizeSongStoragePath(url.searchParams.get("path") || "");
    }
    catch {
        return "";
    }
}

export function resolveSongStoragePath(
    storagePath: string | null | undefined,
    audioUrl: string | null | undefined,
) {
    const normalizedPath = normalizeSongStoragePath(storagePath);
    // Any stored catalog path, including a slash-less filename, is the object
    // that service-role playback, download, and preview may read. A URL may
    // supply a path only when the catalog path is missing.
    if (normalizedPath) return normalizedPath;
    return extractSongStoragePathFromPublicUrl(audioUrl)
        || extractSongStoragePathFromGuardedPlaybackUrl(audioUrl);
}

export function isLegacySongFilenamePath(path: string | null | undefined) {
    const normalized = normalizeSongStoragePath(path);
    return Boolean(normalized) && !normalized.includes("/");
}

/** @deprecated Prefer buildSongGuardedPlaybackUrl. Does not return a public Storage URL. */
export function buildSongPublicUrl(storagePath: string, songId?: string) {
    return buildSongGuardedPlaybackUrl(storagePath, songId);
}

export function buildSongGuardedPlaybackUrl(storagePath: string, songId?: string) {
    return buildGuardedAudioPlaybackUrl({ storagePath: normalizeSongStoragePath(storagePath), songId: songId || "" });
}
