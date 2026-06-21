import { SUPABASE_PROJECT_URL } from "./supabase-config";

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

export function resolveSongStoragePath(
    storagePath: string | null | undefined,
    audioUrl: string | null | undefined,
) {
    const normalizedPath = normalizeSongStoragePath(storagePath);
    const fromUrl = extractSongStoragePathFromPublicUrl(audioUrl);

    if (normalizedPath.includes("/")) {
        return normalizedPath;
    }
    if (fromUrl.includes("/")) {
        return fromUrl;
    }
    return normalizedPath || fromUrl;
}

export function isLegacySongFilenamePath(path: string | null | undefined) {
    const normalized = normalizeSongStoragePath(path);
    return Boolean(normalized) && !normalized.includes("/");
}

export function buildSongPublicUrl(storagePath: string) {
    const normalizedPath = normalizeSongStoragePath(storagePath);
    if (!normalizedPath) {
        return "";
    }
    return `${SUPABASE_PROJECT_URL}${SONGS_PUBLIC_PATH_MARKER}${encodeSongStoragePath(normalizedPath)}`;
}
