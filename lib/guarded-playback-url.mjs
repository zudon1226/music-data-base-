/**
 * Application-layer playback URLs that route through moderation guards.
 * Does not grant Storage access by itself; pairs with private buckets + RLS migration.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value) {
    return UUID_RE.test(String(value || "").trim());
}

/**
 * Playback bytes must use the catalog row's object path.
 * An empty client path means "use the row". A different client path is rejected.
 */
/**
 * @param {string | null | undefined} catalogPath
 * @param {string | null | undefined} clientPath
 * @returns {{ ok: true, storagePath: string, code?: undefined } | { ok: false, storagePath?: undefined, code: "MISSING_PATH" | "PATH_MISMATCH" }}
 */
export function bindCatalogObjectPath(catalogPath, clientPath) {
    const rowPath = String(catalogPath || "").trim();
    if (!rowPath || /^https?:\/\//i.test(rowPath) || rowPath.startsWith("blob:") || rowPath.startsWith("data:")) {
        return { ok: false, code: "MISSING_PATH" };
    }
    const requested = String(clientPath || "").trim();
    if (requested && requested !== rowPath) {
        return { ok: false, code: "PATH_MISMATCH" };
    }
    return { ok: true, storagePath: rowPath };
}

export function buildGuardedAudioPlaybackUrl(input) {
    const songId = String(input.songId || input.id || "").trim();
    const storagePath = String(input.storagePath || input.storage_path || "").trim();
    if (!storagePath) return "";
    const params = new URLSearchParams();
    params.set("path", storagePath);
    if (songId && isUuid(songId)) params.set("songId", songId);
    return `/api/audio?${params.toString()}`;
}

export function buildGuardedVideoPlaybackUrl(input) {
    const videoId = String(input.videoId || input.id || "").trim();
    const storagePath = String(input.storagePath || input.storage_path || "").trim();
    if (!storagePath) return "";
    const params = new URLSearchParams();
    params.set("path", storagePath);
    if (videoId && isUuid(videoId)) params.set("videoId", videoId);
    return `/api/video-playback?${params.toString()}`;
}

export function isGuardedMediaPlaybackUrl(value) {
    const url = String(value || "").trim();
    return url.startsWith("/api/audio?") || url.startsWith("/api/video-playback?");
}

export function isPublicSupabaseMediaObjectUrl(value) {
    const url = String(value || "").trim().toLowerCase();
    return url.includes(".supabase.co/storage/v1/object/public/songs/")
        || url.includes(".supabase.co/storage/v1/object/public/videos/");
}

const SONGS_PUBLIC_MARKER = "/storage/v1/object/public/songs/";
const VIDEOS_PUBLIC_MARKER = "/storage/v1/object/public/videos/";

function extractPublicObjectPath(value, marker) {
    const clean = String(value || "").trim();
    if (!clean) return "";
    const lower = clean.toLowerCase();
    const markerIndex = lower.indexOf(marker);
    if (markerIndex < 0) return "";
    const slice = clean.slice(markerIndex + marker.length).split("?")[0] || "";
    try {
        return decodeURIComponent(slice).replace(/^\/+/, "");
    }
    catch {
        return slice.replace(/^\/+/, "");
    }
}

function firstRecordString(record, keys) {
    for (const key of keys) {
        const value = String(record?.[key] || "").trim();
        if (value) return value;
    }
    return "";
}

/** Resolve catalog song fields to a guarded /api/audio URL only (never a public Storage URL). */
export function resolveGuardedAudioPlaybackUrlFromRecord(record) {
    if (!record || typeof record !== "object") return "";
    const id = firstRecordString(record, ["id", "songId"]);
    let storagePath = firstRecordString(record, ["storage_path", "storagePath", "audioPath", "audio_path"]);
    storagePath = storagePath.replace(/^\/+/, "");

    const urlCandidates = [
        firstRecordString(record, ["playableUrl", "audioUrl", "audio_url", "audio", "publicUrl", "public_url", "url"]),
    ];
    for (const candidate of urlCandidates) {
        if (isGuardedMediaPlaybackUrl(candidate)) return candidate;
        if (isPublicSupabaseMediaObjectUrl(candidate) && candidate.toLowerCase().includes("/songs/")) {
            const fromPublic = extractPublicObjectPath(candidate, SONGS_PUBLIC_MARKER);
            if (fromPublic) storagePath = fromPublic;
            break;
        }
    }

    if (!storagePath) return "";
    return buildGuardedAudioPlaybackUrl({ songId: id, storagePath });
}

/** Resolve catalog video fields to a guarded /api/video-playback URL only. */
export function resolveGuardedVideoPlaybackUrlFromRecord(record) {
    if (!record || typeof record !== "object") return "";
    const id = firstRecordString(record, ["id", "videoId"]);
    let storagePath = firstRecordString(record, ["storage_path", "storagePath"]);
    storagePath = storagePath.replace(/^\/+/, "").replace(/^videos\/+/i, "");

    const urlCandidates = [
        firstRecordString(record, ["playableUrl", "videoUrl", "video_url", "publicUrl", "public_url", "url"]),
    ];
    for (const candidate of urlCandidates) {
        if (isGuardedMediaPlaybackUrl(candidate)) return candidate;
        if (isPublicSupabaseMediaObjectUrl(candidate) && candidate.toLowerCase().includes("/videos/")) {
            const fromPublic = extractPublicObjectPath(candidate, VIDEOS_PUBLIC_MARKER);
            if (fromPublic) storagePath = fromPublic;
            break;
        }
    }

    if (!storagePath) return "";
    return buildGuardedVideoPlaybackUrl({ videoId: id, storagePath });
}

/**
 * Song playback candidates: coerce legacy Supabase public URLs to guarded routes; reject other raw HTTP(S).
 */
export function coerceSongPlaybackCandidate(record, candidate) {
    const clean = String(candidate || "").trim();
    if (!clean) return "";
    if (isGuardedMediaPlaybackUrl(clean)) return clean;
    if (isPublicSupabaseMediaObjectUrl(clean)) {
        return resolveGuardedAudioPlaybackUrlFromRecord({ ...record, audio_url: clean });
    }
    if (/^https?:\/\//i.test(clean)) return "";
    return clean.startsWith("/api/audio?") ? clean : "";
}
