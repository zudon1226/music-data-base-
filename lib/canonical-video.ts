/**
 * Canonical video model + playback/compatibility helpers.
 * One normalize path and one getVideoPlaybackUrl used across upload, library, player, and queue wiring.
 */

import { buildVideoPublicStorageUrl } from "./supabase-storage-upload";

export const VIDEOS_STORAGE_BUCKET = "videos";

export type VideoCompatibilityStatus = "compatible" | "unknown" | "unsupported";

export type CanonicalVideo = {
    id: string;
    title: string;
    creatorName: string;
    mediaType: "video";
    storagePath: string;
    videoUrl: string;
    playableUrl: string;
    coverUrl: string;
    mimeType: string;
    container: string;
    videoCodec: string;
    audioCodec: string;
    duration: number | null;
    mobileCompatible: boolean | null;
    compatibilityReason: string;
};

export type VideoPlaybackUrlResult =
    | { ok: true; playableUrl: string; source: "playableUrl" | "videoUrl" | "signedFromStoragePath" | "publicFromStoragePath" }
    | { ok: false; error: "missing_playable_url"; message: string };

export type VideoCodecProbe = {
    videoCodec: string;
    audioCodec: string;
    codecTags: string[];
    container: string;
    mimeType: string;
    mobileCompatible: boolean | null;
    compatibilityStatus: VideoCompatibilityStatus;
    compatibilityReason: string;
};

const H264_TAGS = new Set(["avc1", "avc2", "avc3"]);
const AAC_TAGS = new Set(["mp4a"]);
const INCOMPATIBLE_VIDEO_TAGS = new Set(["av01", "vp09", "hvc1", "hev1", "vp08", "theora"]);
const INCOMPATIBLE_AUDIO_TAGS = new Set(["opus", "flac", "ac-3", "ec-3", "vorbis"]);
const MOBILE_H264_AAC_CANPLAY = [
    'video/mp4; codecs="avc1.42E01E, mp4a.40.2"',
    'video/mp4; codecs="avc1.4D401E, mp4a.40.2"',
    'video/mp4; codecs="avc1, mp4a"',
];

function clean(value: unknown) {
    return typeof value === "string" ? value.trim() : typeof value === "number" && Number.isFinite(value) ? String(value) : "";
}

function firstNonEmpty(record: Record<string, unknown>, keys: string[]) {
    for (const key of keys) {
        const value = clean(record[key]);
        if (value) return value;
    }
    return "";
}

function asBooleanOrNull(value: unknown): boolean | null {
    if (typeof value === "boolean") return value;
    if (value === "true" || value === "1") return true;
    if (value === "false" || value === "0") return false;
    return null;
}

export function normalizeVideoStoragePath(value: string) {
    let cleanPath = (extractStoragePathFromPublicUrl(value) || value).trim().replace(/^\/+/, "");
    cleanPath = cleanPath.replace(/^videos\/+/i, "");
    cleanPath = cleanPath.replace(/^public\/videos\/+/i, "");
    cleanPath = cleanPath.replace(/^object\/public\/videos\/+/i, "");
    cleanPath = cleanPath.replace(/^storage-(?=\d{10,}-)/i, "");
    return cleanPath;
}

export function extractStoragePathFromPublicUrl(value: string) {
    try {
        const url = new URL(value.trim());
        const marker = "/storage/v1/object/public/videos/";
        const markerIndex = url.pathname.indexOf(marker);
        if (markerIndex < 0) return "";
        return decodeURIComponent(url.pathname.slice(markerIndex + marker.length));
    }
    catch {
        return "";
    }
}

export function isPublicSupabaseVideoUrl(value: string) {
    try {
        const url = new URL(value.trim());
        return url.hostname.endsWith(".supabase.co")
            && url.pathname.includes("/storage/v1/object/public/videos/");
    }
    catch {
        return false;
    }
}

export function isShortLivedSignedStorageUrl(value: string) {
    try {
        const url = new URL(value.trim());
        return url.pathname.includes("/storage/v1/object/sign/");
    }
    catch {
        return false;
    }
}

export function isBlockedVideoPlaybackUrl(value: string) {
    const cleanUrl = value.trim();
    if (!cleanUrl) return true;
    if (cleanUrl.includes("/api/video-upload") || cleanUrl.includes("/api/upload-video")) return true;
    if (isShortLivedSignedStorageUrl(cleanUrl)) return true;
    return false;
}

export function isLikelyStoragePath(value: string) {
    const cleanPath = value.trim();
    if (!cleanPath || /^https?:\/\//i.test(cleanPath) || cleanPath.startsWith("blob:") || cleanPath.startsWith("data:")) {
        return false;
    }
    return cleanPath.includes("/") || /\.(mp4|m4v|mov|webm)$/i.test(cleanPath);
}

export function buildPublicVideoUrlFromStoragePath(storagePath: string) {
    const cleanPath = normalizeVideoStoragePath(storagePath);
    if (!cleanPath) return "";
    return buildVideoPublicStorageUrl(cleanPath);
}

/**
 * Canonical playback URL resolution.
 * Never treats short-lived signed URLs as the permanent source of truth.
 */
export function getVideoPlaybackUrl(
    video: Partial<CanonicalVideo> | Record<string, unknown> | null | undefined,
): string {
    const result = resolveVideoPlaybackUrl(video);
    return result.ok ? result.playableUrl : "";
}

export function resolveVideoPlaybackUrl(
    video: Partial<CanonicalVideo> | Record<string, unknown> | null | undefined,
): VideoPlaybackUrlResult {
    if (!video) {
        return {
            ok: false,
            error: "missing_playable_url",
            message: "Video record is missing.",
        };
    }
    const record = video as Record<string, unknown>;
    const storagePath = normalizeVideoStoragePath(
        firstNonEmpty(record, ["storagePath", "storage_path"]),
    );

    const playableUrl = firstNonEmpty(record, ["playableUrl"]);
    const videoUrl = firstNonEmpty(record, [
        "videoUrl",
        "video_url",
        "publicUrl",
        "public_url",
        "file_url",
        "url",
    ]);

    const considerDirect = (candidate: string, source: "playableUrl" | "videoUrl"): VideoPlaybackUrlResult | null => {
        if (!candidate) return null;
        if (isBlockedVideoPlaybackUrl(candidate)) {
            if (storagePath) {
                const rebuilt = buildPublicVideoUrlFromStoragePath(storagePath);
                if (rebuilt) {
                    return { ok: true, playableUrl: rebuilt, source: "publicFromStoragePath" };
                }
            }
            return null;
        }
        if (isPublicSupabaseVideoUrl(candidate)) {
            const fromUrl = extractStoragePathFromPublicUrl(candidate);
            const path = storagePath || normalizeVideoStoragePath(fromUrl);
            const rebuilt = path ? buildPublicVideoUrlFromStoragePath(path) : candidate;
            return { ok: true, playableUrl: rebuilt, source };
        }
        if (isLikelyStoragePath(candidate)) {
            const rebuilt = buildPublicVideoUrlFromStoragePath(candidate);
            if (rebuilt) return { ok: true, playableUrl: rebuilt, source: "publicFromStoragePath" };
        }
        if (/^https?:\/\//i.test(candidate) || candidate.startsWith("/")) {
            return { ok: true, playableUrl: candidate, source };
        }
        return null;
    };

    const fromPlayable = considerDirect(playableUrl, "playableUrl");
    if (fromPlayable?.ok) return fromPlayable;

    const fromVideoUrl = considerDirect(videoUrl, "videoUrl");
    if (fromVideoUrl?.ok) return fromVideoUrl;

    if (storagePath) {
        const publicUrl = buildPublicVideoUrlFromStoragePath(storagePath);
        if (publicUrl) {
            return { ok: true, playableUrl: publicUrl, source: "publicFromStoragePath" };
        }
    }

    return {
        ok: false,
        error: "missing_playable_url",
        message: "No valid playableUrl, videoUrl, or storagePath is available for this video.",
    };
}

export function isH264VideoCodec(videoCodec: string) {
    const normalized = videoCodec.trim().toLowerCase();
    return !normalized || H264_TAGS.has(normalized) || normalized.startsWith("avc1");
}

export function isAacOrSilentAudioCodec(audioCodec: string) {
    const normalized = audioCodec.trim().toLowerCase();
    return !normalized || AAC_TAGS.has(normalized) || normalized.startsWith("mp4a");
}

export function isPositivelyIncompatibleCodec(videoCodec: string, audioCodec: string) {
    const video = videoCodec.trim().toLowerCase();
    const audio = audioCodec.trim().toLowerCase();
    if (video && INCOMPATIBLE_VIDEO_TAGS.has(video)) return true;
    if (audio && INCOMPATIBLE_AUDIO_TAGS.has(audio)) return true;
    if (video && !isH264VideoCodec(video)) return true;
    if (audio && !isAacOrSilentAudioCodec(audio)) return true;
    return false;
}

export function assessUploadCompatibility(input: {
    mimeType?: string;
    fileName?: string;
    container?: string;
    videoCodec?: string;
    audioCodec?: string;
}): {
    status: VideoCompatibilityStatus;
    mobileCompatible: boolean | null;
    reason: string;
    fullyCompatible: boolean;
} {
    const mimeType = clean(input.mimeType).toLowerCase();
    const fileName = clean(input.fileName).toLowerCase();
    const container = clean(input.container).toLowerCase()
        || (fileName.endsWith(".mp4") || fileName.endsWith(".m4v") ? "mp4" : "");
    const videoCodec = clean(input.videoCodec).toLowerCase();
    const audioCodec = clean(input.audioCodec).toLowerCase();

    if (mimeType && mimeType !== "video/mp4" && !mimeType.startsWith("video/mp4")) {
        if (mimeType.includes("webm") || mimeType.includes("ogg") || mimeType.includes("x-matroska")) {
            return {
                status: "unsupported",
                mobileCompatible: false,
                reason: `MIME type ${mimeType} is not compatible with iPhone Safari.`,
                fullyCompatible: false,
            };
        }
    }

    if (container && container !== "mp4" && container !== "isom" && container !== "m4v") {
        if (["webm", "mkv", "ogg", "avi"].includes(container)) {
            return {
                status: "unsupported",
                mobileCompatible: false,
                reason: `Container ${container} is not compatible with iPhone Safari.`,
                fullyCompatible: false,
            };
        }
    }

    if (videoCodec || audioCodec) {
        if (isPositivelyIncompatibleCodec(videoCodec, audioCodec)) {
            return {
                status: "unsupported",
                mobileCompatible: false,
                reason: `Detected codecs ${[videoCodec, audioCodec].filter(Boolean).join(" / ")} are not H.264/AAC.`,
                fullyCompatible: false,
            };
        }
        if (isH264VideoCodec(videoCodec) && isAacOrSilentAudioCodec(audioCodec)
            && (mimeType === "video/mp4" || !mimeType || mimeType === "application/octet-stream")
            && (!container || container === "mp4" || container === "isom" || container === "m4v")) {
            return {
                status: "compatible",
                mobileCompatible: true,
                reason: "MP4 container with H.264 video and AAC or no audio.",
                fullyCompatible: true,
            };
        }
    }

    return {
        status: "unknown",
        mobileCompatible: null,
        reason: "Codec metadata could not be verified; not marked compatible from extension alone.",
        fullyCompatible: false,
    };
}

/**
 * Merge compatibility without clobbering a known-good stored value with null/unknown from a failed probe.
 */
export function mergeCompatibility(existing: {
    mobileCompatible?: boolean | null;
    compatibilityReason?: string;
}, incoming: {
    mobileCompatible?: boolean | null;
    compatibilityReason?: string;
}) {
    const existingCompat = asBooleanOrNull(existing.mobileCompatible);
    const incomingCompat = asBooleanOrNull(incoming.mobileCompatible);

    if (existingCompat === true && incomingCompat !== false) {
        return {
            mobileCompatible: true as boolean | null,
            compatibilityReason: existing.compatibilityReason
                || incoming.compatibilityReason
                || "Preserved previously verified compatible status.",
        };
    }
    if (existingCompat === false && incomingCompat == null) {
        return {
            mobileCompatible: false as boolean | null,
            compatibilityReason: existing.compatibilityReason
                || "Preserved previously detected incompatible status.",
        };
    }
    if (incomingCompat != null) {
        return {
            mobileCompatible: incomingCompat,
            compatibilityReason: incoming.compatibilityReason
                || existing.compatibilityReason
                || (incomingCompat ? "Compatible." : "Unsupported."),
        };
    }
    return {
        mobileCompatible: existingCompat,
        compatibilityReason: existing.compatibilityReason
            || incoming.compatibilityReason
            || "unknown",
    };
}

export function inferMimeType(record: Record<string, unknown>, playableUrl = "") {
    const explicit = firstNonEmpty(record, ["mimeType", "mime_type", "contentType", "content_type"]).toLowerCase();
    if (explicit) return explicit;
    const path = `${firstNonEmpty(record, ["storagePath", "storage_path", "fileName", "file_name"])} ${playableUrl}`.toLowerCase();
    if (path.includes(".webm")) return "video/webm";
    if (path.includes(".mov")) return "video/quicktime";
    if (path.includes(".ogv") || path.includes(".ogg")) return "video/ogg";
    return "video/mp4";
}

export function inferContainer(record: Record<string, unknown>, mimeType: string) {
    const explicit = firstNonEmpty(record, ["container"]).toLowerCase();
    if (explicit) return explicit;
    if (mimeType === "video/webm") return "webm";
    if (mimeType === "video/quicktime") return "mov";
    if (mimeType === "video/ogg") return "ogg";
    const path = firstNonEmpty(record, ["storagePath", "storage_path", "fileName", "file_name"]).toLowerCase();
    if (path.endsWith(".webm")) return "webm";
    if (path.endsWith(".mov")) return "mov";
    if (path.endsWith(".m4v")) return "m4v";
    return "mp4";
}

export function normalizeCanonicalVideo(
    input: Record<string, unknown> | Partial<CanonicalVideo> | null | undefined,
    options: { previous?: Partial<CanonicalVideo> | Record<string, unknown> | null } = {},
): CanonicalVideo {
    const record = (input || {}) as Record<string, unknown>;
    const previous = (options.previous || {}) as Record<string, unknown>;

    const storagePath = normalizeVideoStoragePath(
        firstNonEmpty(record, ["storagePath", "storage_path"])
            || firstNonEmpty(previous, ["storagePath", "storage_path"]),
    );

    const rawVideoUrl = firstNonEmpty(record, ["videoUrl", "video_url", "playableUrl", "publicUrl", "public_url", "url", "file_url"])
        || firstNonEmpty(previous, ["videoUrl", "video_url", "playableUrl"]);

    const playback = resolveVideoPlaybackUrl({
        ...previous,
        ...record,
        storagePath,
        storage_path: storagePath,
        videoUrl: rawVideoUrl,
        video_url: rawVideoUrl,
        playableUrl: firstNonEmpty(record, ["playableUrl"]) || firstNonEmpty(previous, ["playableUrl"]) || rawVideoUrl,
    });

    const playableUrl = playback.ok
        ? playback.playableUrl
        : (rawVideoUrl && !isBlockedVideoPlaybackUrl(rawVideoUrl) ? rawVideoUrl : "");
    const durableVideoUrl = storagePath
        ? (buildPublicVideoUrlFromStoragePath(storagePath) || playableUrl)
        : playableUrl;

    const videoCodec = firstNonEmpty(record, ["videoCodec", "video_codec"])
        || firstNonEmpty(previous, ["videoCodec", "video_codec"]);
    const audioCodec = firstNonEmpty(record, ["audioCodec", "audio_codec"])
        || firstNonEmpty(previous, ["audioCodec", "audio_codec"]);
    const mimeType = inferMimeType({ ...previous, ...record }, playableUrl || durableVideoUrl);
    const container = inferContainer({ ...previous, ...record }, mimeType);

    const assessed = assessUploadCompatibility({
        mimeType,
        fileName: firstNonEmpty(record, ["fileName", "file_name"]),
        container,
        videoCodec,
        audioCodec,
    });

    const merged = mergeCompatibility(
        {
            mobileCompatible: asBooleanOrNull(previous.mobileCompatible ?? previous.mobile_compatible),
            compatibilityReason: firstNonEmpty(previous, ["compatibilityReason", "compatibility_reason"]),
        },
        {
            mobileCompatible: asBooleanOrNull(record.mobileCompatible ?? record.mobile_compatible) ?? assessed.mobileCompatible,
            compatibilityReason: firstNonEmpty(record, ["compatibilityReason", "compatibility_reason"]) || assessed.reason,
        },
    );

    const creatorName = firstNonEmpty(record, ["creatorName", "creator", "artistName", "artist_name", "producer_name", "producer", "description"])
        || firstNonEmpty(previous, ["creatorName", "creator", "artistName"])
        || "Unknown creator";
    const title = firstNonEmpty(record, ["title", "name"])
        || firstNonEmpty(previous, ["title"])
        || "Untitled video";
    const coverUrl = firstNonEmpty(record, ["coverUrl", "cover", "cover_url", "thumbnail_url", "poster", "artworkUrl"])
        || firstNonEmpty(previous, ["coverUrl", "cover", "cover_url"])
        || "/music-data-base-logo.png";
    const id = firstNonEmpty(record, ["id"])
        || firstNonEmpty(previous, ["id"])
        || durableVideoUrl
        || storagePath
        || title;

    const durationRaw = record.duration ?? record.durationSeconds ?? previous.duration;
    const duration = typeof durationRaw === "number" && Number.isFinite(durationRaw)
        ? durationRaw
        : (typeof durationRaw === "string" && durationRaw.trim() && Number.isFinite(Number(durationRaw))
            ? Number(durationRaw)
            : null);

    return {
        id,
        title,
        creatorName,
        mediaType: "video",
        storagePath,
        videoUrl: durableVideoUrl,
        playableUrl: playableUrl || durableVideoUrl,
        coverUrl,
        mimeType,
        container,
        videoCodec,
        audioCodec,
        duration,
        mobileCompatible: merged.mobileCompatible,
        compatibilityReason: merged.compatibilityReason || assessed.reason,
    };
}

export function probeBrowserMp4H264AacSupport(videoElement?: HTMLVideoElement | null): "" | "maybe" | "probably" {
    if (typeof document === "undefined") return "";
    const element = videoElement || document.createElement("video");
    for (const candidate of MOBILE_H264_AAC_CANPLAY) {
        const support = element.canPlayType(candidate);
        if (support === "probably" || support === "maybe") return support;
    }
    const bare = element.canPlayType("video/mp4");
    return bare === "probably" || bare === "maybe" ? bare : "";
}

export function interpretCanPlayType(value: string): VideoCompatibilityStatus {
    if (value === "probably") return "compatible";
    if (value === "maybe") return "unknown";
    return "unsupported";
}

export type VideoPlaybackFailureKind =
    | "missing-url"
    | "unsupported-codec"
    | "network-error"
    | "unknown-playback-error";

export type VideoPlaybackFailure = {
    kind: VideoPlaybackFailureKind;
    message: string;
    hasAssignableUrl: boolean;
};

export const AV1_DEVICE_UNSUPPORTED_MESSAGE =
    "This video uses AV1 and cannot play on this device. Re-encode it as an H.264 video with AAC audio in an MP4 container.";

export const MISSING_VIDEO_URL_MESSAGE = "This video is missing a playable URL.";

export const VIDEO_NETWORK_ERROR_MESSAGE =
    "This video URL could not be loaded (network or storage error). The file reference is still saved.";

export const VIDEO_UNKNOWN_PLAYBACK_ERROR_MESSAGE =
    "This video could not be played on this device. The playable URL is present; the exact decode/network cause could not be confirmed.";

export function isAv1Codec(videoCodec: string) {
    const normalized = videoCodec.trim().toLowerCase();
    return normalized === "av01" || normalized.startsWith("av01") || normalized === "av1";
}

export function isPositivelyBrowserUnsupportedVideoCodec(videoCodec: string) {
    const normalized = videoCodec.trim().toLowerCase();
    if (!normalized) return false;
    return isAv1Codec(normalized)
        || normalized === "vp09"
        || normalized.startsWith("vp09")
        || normalized === "vp9"
        || normalized === "hvc1"
        || normalized === "hev1"
        || normalized.startsWith("vp08");
}

/**
 * Classify playback failures without conflating missing-url and unsupported-codec.
 * Never returns missing-url when any durable URL / rebuildable storagePath exists.
 */
export function classifyVideoPlaybackFailure(input: {
    playableUrl?: string | null;
    videoUrl?: string | null;
    storagePath?: string | null;
    videoCodec?: string | null;
    audioCodec?: string | null;
    mediaErrorCode?: number | null;
    networkStatus?: number | null;
    canPlayType?: string | null;
    sourceAssigned?: boolean;
}): VideoPlaybackFailure | null {
    const playableUrl = String(input.playableUrl || "").trim();
    const videoUrl = String(input.videoUrl || "").trim();
    const storagePath = normalizeVideoStoragePath(String(input.storagePath || ""));
    const rebuilt = storagePath ? buildPublicVideoUrlFromStoragePath(storagePath) : "";
    const hasAssignableUrl = Boolean(
        playableUrl
        || videoUrl
        || rebuilt
        || input.sourceAssigned,
    );
    const videoCodec = String(input.videoCodec || "").trim();
    const mediaErrorCode = input.mediaErrorCode ?? null;
    const networkStatus = input.networkStatus ?? null;
    const canPlayType = String(input.canPlayType || "");

    if (!hasAssignableUrl) {
        return {
            kind: "missing-url",
            message: MISSING_VIDEO_URL_MESSAGE,
            hasAssignableUrl: false,
        };
    }

    if (isPositivelyBrowserUnsupportedVideoCodec(videoCodec)
        || (mediaErrorCode === 4 && isPositivelyBrowserUnsupportedVideoCodec(videoCodec))
        || (mediaErrorCode === 4 && canPlayType === "" && isAv1Codec(videoCodec))) {
        return {
            kind: "unsupported-codec",
            message: isAv1Codec(videoCodec)
                ? AV1_DEVICE_UNSUPPORTED_MESSAGE
                : `This video uses ${videoCodec} and cannot play on this device. Re-encode it as an H.264 video with AAC audio in an MP4 container.`,
            hasAssignableUrl: true,
        };
    }

    if (networkStatus != null && (networkStatus === 0 || networkStatus === 403 || networkStatus === 404 || networkStatus >= 500)) {
        return {
            kind: "network-error",
            message: VIDEO_NETWORK_ERROR_MESSAGE,
            hasAssignableUrl: true,
        };
    }

    if (mediaErrorCode === 2 || mediaErrorCode === 1) {
        return {
            kind: "network-error",
            message: VIDEO_NETWORK_ERROR_MESSAGE,
            hasAssignableUrl: true,
        };
    }

    if (mediaErrorCode === 4 || mediaErrorCode === 3) {
        return {
            kind: "unknown-playback-error",
            message: VIDEO_UNKNOWN_PLAYBACK_ERROR_MESSAGE,
            hasAssignableUrl: true,
        };
    }

    return null;
}

export type SharedVideoPlayerConfig = {
    playsInline: true;
    controls: true;
    preload: "metadata";
    autoPlay: false;
    muted: false;
    poster?: string;
    crossOrigin?: "anonymous" | "use-credentials";
    sourceType: string;
};

export function buildSharedVideoPlayerConfig(options: {
    poster?: string;
    mimeType?: string;
    requireCrossOrigin?: boolean;
}): SharedVideoPlayerConfig {
    return {
        playsInline: true,
        controls: true,
        preload: "metadata",
        autoPlay: false,
        muted: false,
        poster: options.poster || undefined,
        crossOrigin: options.requireCrossOrigin ? "anonymous" : undefined,
        sourceType: options.mimeType && options.mimeType.startsWith("video/")
            ? options.mimeType
            : "video/mp4",
    };
}

export function shouldReplaceVideoSource(currentSrc: string, nextUrl: string, videoId: string, nextVideoId: string) {
    if (!nextUrl) return false;
    if (videoId && nextVideoId && videoId === nextVideoId) {
        const current = currentSrc.split("?")[0];
        const next = nextUrl.split("?")[0];
        if (current && next && current === next) return false;
    }
    return currentSrc !== nextUrl;
}
