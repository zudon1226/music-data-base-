/**
 * Display-only helpers for the Video Upload Debug panel.
 * Does not change upload gates — presentation only.
 */

export type VideoUploadDebugPanelInspection = {
    fileName: string;
    fileSizeLabel: string;
    container: string;
    videoCodecRaw: string;
    audioCodecRaw: string;
    canPublish: boolean;
    inspected: boolean;
    compatibilityReason?: string;
};

export type VideoUploadDebugPanelView = {
    fileName: string;
    fileSize: string;
    container: string;
    videoCodec: string;
    audioCodec: string;
    compatibleYesNo: "YES" | "NO" | "—";
    statusTone: "ok" | "warn" | "idle";
    humanReason: string;
    recommendedFix: string;
};

const RECOMMENDED_FIX = "Re-encode this video as MP4 using H.264 video and AAC audio.";
const READY_REASON = "This video uses H.264 (avc1) video with AAC audio.\nIt is ready for desktop, Android, and iPhone.";

function normalizeToken(value: string) {
    return String(value || "").trim().toLowerCase();
}

export function formatVideoCodecForDebugDisplay(raw: string) {
    const value = normalizeToken(raw);
    if (!value || value === "unknown") return "Unknown";
    if (value === "avc1" || value === "avc2" || value === "avc3" || value.startsWith("avc1") || value === "h264") {
        return "H.264 / AVC (avc1)";
    }
    if (value === "av01" || value.startsWith("av01") || value === "av1") return "AV1 (av01)";
    if (value === "vp09" || value.startsWith("vp09") || value === "vp9") return "VP9";
    if (value === "hvc1" || value === "hev1" || value === "hevc") return "HEVC / H.265";
    if (value === "vp08" || value === "vp8") return "VP8";
    return raw.trim() || "Unknown";
}

export function formatAudioCodecForDebugDisplay(raw: string) {
    const value = normalizeToken(raw);
    if (!value || value === "unknown") return "Unknown";
    if (value === "mp4a" || value.startsWith("mp4a") || value === "aac") return "AAC (mp4a)";
    if (value === "ac-3" || value === "ec-3") return value.toUpperCase();
    if (value === "opus") return "Opus";
    if (value === "flac") return "FLAC";
    return raw.trim() || "Unknown";
}

export function formatContainerForDebugDisplay(raw: string) {
    const value = normalizeToken(raw);
    if (!value || value === "unknown") return "Unknown";
    if (value === "mp4" || value === "isom" || value === "m4v") return "MP4";
    return raw.trim().toUpperCase();
}

function resolveRawVideoForDisplay(raw: string) {
    const value = normalizeToken(raw);
    if (value === "av1") return "av01";
    if (value === "h264") return "avc1";
    if (value === "vp9") return "vp09";
    if (value === "hevc") return "hvc1";
    return raw;
}

function resolveRawAudioForDisplay(raw: string) {
    const value = normalizeToken(raw);
    if (value === "aac") return "mp4a";
    return raw;
}

/** Human-readable multi-line reason for the Summary section. */
export function buildVideoUploadSummaryReason(input: {
    videoCodecRaw: string;
    audioCodecRaw: string;
    container: string;
    canPublish: boolean;
    compatibilityReason?: string;
}) {
    if (input.canPublish) {
        return READY_REASON;
    }
    const video = normalizeToken(input.videoCodecRaw);
    const audio = normalizeToken(input.audioCodecRaw);
    const container = normalizeToken(input.container);
    const supportLine = "Only H.264 (avc1) video with AAC audio is supported.";

    if (video === "av01" || video.startsWith("av01") || video === "av1") {
        return `This video uses the AV1 codec.\n${supportLine}`;
    }
    if (video === "vp09" || video.startsWith("vp09") || video === "vp9") {
        return `This video uses the VP9 codec.\n${supportLine}`;
    }
    if (video === "hvc1" || video === "hev1" || video === "hevc") {
        return `This video uses the HEVC / H.265 codec.\n${supportLine}`;
    }
    if (!video || video === "unknown") {
        return `This video’s codec could not be confirmed.\n${supportLine}`;
    }
    if (!audio || audio === "unknown") {
        return `This video’s audio codec could not be confirmed as AAC.\n${supportLine}`;
    }
    if (!(audio === "mp4a" || audio.startsWith("mp4a") || audio === "aac")) {
        return `This video uses unsupported audio (${formatAudioCodecForDebugDisplay(input.audioCodecRaw)}).\n${supportLine}`;
    }
    if (container && container !== "mp4" && container !== "isom" && container !== "m4v") {
        return `This file is not a verified MP4 container.\n${supportLine}`;
    }
    if (!(video === "avc1" || video === "avc2" || video === "avc3" || video.startsWith("avc1") || video === "h264")) {
        return `This video uses the ${formatVideoCodecForDebugDisplay(input.videoCodecRaw)} codec.\n${supportLine}`;
    }
    const fallback = String(input.compatibilityReason || "").trim();
    return fallback
        ? `${fallback}\n${supportLine}`
        : `Compatibility could not be confirmed.\n${supportLine}`;
}

/** @deprecated Prefer buildVideoUploadSummaryReason for Summary copy. */
export function buildVideoUploadIncompatibilityReason(input: {
    videoCodecRaw: string;
    audioCodecRaw: string;
    container: string;
    canPublish: boolean;
    compatibilityReason?: string;
}) {
    return buildVideoUploadSummaryReason(input).split("\n")[0] || "";
}

export function buildVideoUploadDebugPanelView(input: VideoUploadDebugPanelInspection): VideoUploadDebugPanelView {
    const videoRaw = resolveRawVideoForDisplay(input.videoCodecRaw);
    const audioRaw = resolveRawAudioForDisplay(input.audioCodecRaw);
    const videoCodec = input.inspected ? formatVideoCodecForDebugDisplay(videoRaw) : "Not inspected yet";
    const audioCodec = input.inspected ? formatAudioCodecForDebugDisplay(audioRaw) : "Not inspected yet";
    const container = input.inspected ? formatContainerForDebugDisplay(input.container) : "Not inspected yet";

    if (!input.inspected) {
        return {
            fileName: input.fileName || "No file selected",
            fileSize: input.fileSizeLabel || "No file selected",
            container,
            videoCodec,
            audioCodec,
            compatibleYesNo: "—",
            statusTone: "idle",
            humanReason: "Choose a video file to inspect compatibility.",
            recommendedFix: RECOMMENDED_FIX,
        };
    }

    if (input.canPublish) {
        return {
            fileName: input.fileName || "No file selected",
            fileSize: input.fileSizeLabel || "Unknown size",
            container,
            videoCodec,
            audioCodec,
            compatibleYesNo: "YES",
            statusTone: "ok",
            humanReason: buildVideoUploadSummaryReason({
                videoCodecRaw: videoRaw,
                audioCodecRaw: audioRaw,
                container: input.container,
                canPublish: true,
            }),
            recommendedFix: "No conversion needed. Click Save Video to publish.",
        };
    }

    return {
        fileName: input.fileName || "No file selected",
        fileSize: input.fileSizeLabel || "Unknown size",
        container,
        videoCodec,
        audioCodec,
        compatibleYesNo: "NO",
        statusTone: "warn",
        humanReason: buildVideoUploadSummaryReason({
            videoCodecRaw: videoRaw,
            audioCodecRaw: audioRaw,
            container: input.container,
            canPublish: false,
            compatibilityReason: input.compatibilityReason,
        }),
        recommendedFix: RECOMMENDED_FIX,
    };
}
