import { safeRandomUUID } from "@/lib/safe-random-uuid";
import type { PodcastEpisodeType } from "@/lib/podcast-types";

export const PODCAST_AUDIO_BUCKET = "podcast-audio";
export const PODCAST_VIDEO_BUCKET = "podcast-video";
export const PODCAST_COVERS_BUCKET = "covers";
export const PODCAST_AUDIO_MAX_BYTES = 100 * 1024 * 1024;
export const PODCAST_VIDEO_MAX_BYTES = 1024 * 1024 * 1024;
export const PODCAST_ARTWORK_MAX_BYTES = 20 * 1024 * 1024;

export const PODCAST_AUDIO_MIME_TYPES = new Set([
    "audio/mpeg",
    "audio/mp4",
    "audio/aac",
    "audio/m4a",
    "audio/x-m4a",
]);

export const PODCAST_VIDEO_MIME_TYPES = new Set([
    "video/mp4",
    "video/x-m4v",
    "application/octet-stream",
]);

export const PODCAST_ARTWORK_MIME_TYPES = new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
]);

const AUDIO_EXTENSIONS = new Set(["mp3", "m4a", "aac"]);
const VIDEO_EXTENSIONS = new Set(["mp4", "m4v"]);
const ARTWORK_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "gif"]);

function cleanExtension(fileName: string) {
    return fileName.split(".").pop()?.trim().toLowerCase() || "";
}

function safeFileName(fileName: string) {
    const extension = cleanExtension(fileName);
    const base = fileName
        .replace(/\.[^.]+$/, "")
        .normalize("NFKD")
        .replace(/[^a-zA-Z0-9_-]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 80) || "podcast-media";
    return extension ? `${base}.${extension}` : base;
}

export function validatePodcastMediaDescriptor(input: {
    episodeType: PodcastEpisodeType;
    fileName: string;
    contentType: string;
    fileSize: number;
}) {
    const extension = cleanExtension(input.fileName);
    const contentType = input.contentType.trim().toLowerCase() || "application/octet-stream";
    const isAudio = input.episodeType === "audio";
    const allowedMime = isAudio ? PODCAST_AUDIO_MIME_TYPES : PODCAST_VIDEO_MIME_TYPES;
    const allowedExtensions = isAudio ? AUDIO_EXTENSIONS : VIDEO_EXTENSIONS;
    const maxBytes = isAudio ? PODCAST_AUDIO_MAX_BYTES : PODCAST_VIDEO_MAX_BYTES;
    if (!allowedExtensions.has(extension)) {
        return {
            ok: false as const,
            error: isAudio
                ? "Audio podcasts support MP3, M4A, or AAC files."
                : "Video podcasts require MP4/M4V files using H.264 video and AAC audio.",
        };
    }
    if (!allowedMime.has(contentType)) {
        return { ok: false as const, error: `Unsupported podcast ${input.episodeType} MIME type.` };
    }
    if (!Number.isFinite(input.fileSize) || input.fileSize <= 0 || input.fileSize > maxBytes) {
        return {
            ok: false as const,
            error: `Podcast ${input.episodeType} file must be between 1 byte and ${Math.round(maxBytes / 1024 / 1024)} MB.`,
        };
    }
    return { ok: true as const, contentType, extension };
}

export function validatePodcastArtworkDescriptor(input: {
    fileName: string;
    contentType: string;
    fileSize: number;
}) {
    const extension = cleanExtension(input.fileName);
    const contentType = input.contentType.trim().toLowerCase();
    if (!ARTWORK_EXTENSIONS.has(extension) || !PODCAST_ARTWORK_MIME_TYPES.has(contentType)) {
        return { ok: false as const, error: "Podcast artwork must be JPEG, PNG, WebP, or GIF." };
    }
    if (!Number.isFinite(input.fileSize) || input.fileSize <= 0 || input.fileSize > PODCAST_ARTWORK_MAX_BYTES) {
        return { ok: false as const, error: "Podcast artwork must be between 1 byte and 20 MB." };
    }
    return { ok: true as const, contentType, extension };
}

export function buildPodcastMediaStoragePath(input: {
    userId: string;
    podcastId: string;
    episodeType: PodcastEpisodeType;
    fileName: string;
}) {
    return `${input.userId}/podcasts/${input.podcastId}/${input.episodeType}/${safeRandomUUID()}-${safeFileName(input.fileName)}`;
}

export function buildPodcastArtworkStoragePath(input: {
    userId: string;
    podcastId?: string;
    fileName: string;
}) {
    return `${input.userId}/podcasts/${input.podcastId || "shows"}/artwork/${safeRandomUUID()}-${safeFileName(input.fileName)}`;
}

export function validatePodcastOwnedStoragePath(storagePath: string, userId: string) {
    const normalized = storagePath.trim().replace(/^\/+/, "");
    if (!normalized || normalized.split("/")[0] !== userId || !normalized.includes("/podcasts/")) {
        return { ok: false as const, error: "Podcast storage path does not belong to the authenticated user." };
    }
    return { ok: true as const, storagePath: normalized };
}

export function getPodcastBucket(episodeType: PodcastEpisodeType) {
    return episodeType === "video" ? PODCAST_VIDEO_BUCKET : PODCAST_AUDIO_BUCKET;
}

export function isEpisodeShapedShowPayload(body: Record<string, unknown>) {
    return Boolean(
        body.podcastId
        || body.podcast_id
        || body.episodeType
        || body.episode_type
        || body.storagePath
        || body.storage_path
        || body.episodeNumber
        || body.episode_number,
    );
}
