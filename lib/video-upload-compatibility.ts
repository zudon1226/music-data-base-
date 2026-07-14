/**
 * Canonical video upload compatibility service.
 * Shared by every upload path (desktop / artist / producer / album / API).
 * Inspects real file bytes — never trust .mp4 extension or client MIME alone.
 *
 * Publication gate (until server-side transcoding exists):
 * only status === "compatible" (H.264 + AAC inside MP4) may publish a playable row.
 */

export type VideoPublicationCompatibilityStatus =
    | "pending_verification"
    | "compatible"
    | "conversion_required"
    | "conversion_processing"
    | "conversion_failed"
    | "unknown";

export const VIDEO_UPLOAD_INCOMPATIBLE_USER_MESSAGE =
    "This MP4 file uses an unsupported internal codec. Files downloaded from the same platform may still use different codecs. Convert this video to H.264 video with AAC audio, then upload it again.";

const VIDEO_CODEC_TAGS = ["avc1", "avc2", "avc3", "hvc1", "hev1", "av01", "vp09", "vp08", "mp4v"] as const;
const AUDIO_CODEC_TAGS = ["mp4a", "ac-3", "ec-3", "Opus", "fLaC"] as const;
const DEFAULT_SAMPLE_BYTES = 256 * 1024;

export type VideoUploadCompatibilityInspection = {
    videoCodecRaw: string;
    audioCodecRaw: string;
    codecTags: string[];
    container: string;
    mimeType: string;
    /** Canonical publish fields when compatible; otherwise best-effort detected labels. */
    videoCodec: string;
    audioCodec: string;
    mobileCompatible: boolean;
    compatibilityStatus: VideoPublicationCompatibilityStatus;
    compatibilityReason: string;
    canPublish: boolean;
    publicationError: string;
};

function findAsciiTagsInBytes(bytes: Uint8Array, tags: readonly string[]) {
    const haystack = new TextDecoder("latin1").decode(bytes);
    return tags.filter((tag) => haystack.includes(tag));
}

function detectMp4Container(bytes: Uint8Array) {
    const haystack = new TextDecoder("latin1").decode(bytes.slice(0, Math.min(bytes.length, 64)));
    return haystack.includes("ftyp") ? "mp4" : "";
}

function normalizeDetectedVideoCodec(raw: string) {
    const value = raw.trim().toLowerCase();
    if (!value) return "";
    if (value === "avc1" || value === "avc2" || value === "avc3" || value.startsWith("avc1")) return "h264";
    if (value === "av01" || value.startsWith("av01") || value === "av1") return "av1";
    if (value === "hvc1" || value === "hev1") return "hevc";
    if (value === "vp09" || value.startsWith("vp09") || value === "vp9") return "vp9";
    if (value === "vp08" || value === "vp8") return "vp8";
    return value;
}

function normalizeDetectedAudioCodec(raw: string) {
    const value = raw.trim().toLowerCase();
    if (!value) return "";
    if (value === "mp4a" || value.startsWith("mp4a")) return "aac";
    if (value === "ac-3" || value === "ec-3") return value;
    if (value === "opus") return "opus";
    if (value === "flac" || value === "flac") return "flac";
    return value;
}

function isH264Raw(raw: string) {
    const value = raw.trim().toLowerCase();
    return value === "avc1" || value === "avc2" || value === "avc3" || value.startsWith("avc1");
}

function isAacRaw(raw: string) {
    const value = raw.trim().toLowerCase();
    return value === "mp4a" || value.startsWith("mp4a");
}

/**
 * Classify inspected codecs for publication.
 * Compatible ONLY when MP4 + H.264 + AAC are positively detected.
 * Unknown / missing audio / bad codecs => cannot publish as universally playable.
 */
export function classifyVideoUploadForPublication(input: {
    videoCodecRaw?: string;
    audioCodecRaw?: string;
    container?: string;
    mimeType?: string;
    fileName?: string;
}): VideoUploadCompatibilityInspection {
    const videoCodecRaw = String(input.videoCodecRaw || "").trim();
    const audioCodecRaw = String(input.audioCodecRaw || "").trim();
    const fileName = String(input.fileName || "").toLowerCase();
    let container = String(input.container || "").trim().toLowerCase();
    let mimeType = String(input.mimeType || "").trim().toLowerCase();

    if (!container && (fileName.endsWith(".mp4") || fileName.endsWith(".m4v"))) {
        // Extension hint only — never enough alone for canPublish.
        container = "";
    }
    if (!mimeType) {
        mimeType = container === "mp4" ? "video/mp4" : "";
    }

    const videoCanon = normalizeDetectedVideoCodec(videoCodecRaw);
    const audioCanon = normalizeDetectedAudioCodec(audioCodecRaw);

    const positivelyBadVideo = ["av1", "hevc", "vp9", "vp8", "mp4v"].includes(videoCanon);
    const positivelyBadAudio = ["ac-3", "ec-3", "opus", "flac", "vorbis"].includes(audioCanon);

    if (positivelyBadVideo || positivelyBadAudio) {
        const reason = videoCanon === "av1"
            ? "Video stream is AV1 (av01); only H.264/AVC (avc1) is accepted."
            : videoCanon === "hevc"
                ? "Video stream is HEVC/H.265; only H.264/AVC (avc1) is accepted."
                : videoCanon === "vp9" || videoCanon === "vp8"
                    ? `Video stream is ${videoCanon.toUpperCase()}; only H.264/AVC (avc1) is accepted.`
                    : positivelyBadAudio
                        ? `Audio stream is ${audioCanon || audioCodecRaw || "unsupported"}; only AAC (mp4a) is accepted.`
                        : `Detected codecs ${[videoCanon || videoCodecRaw, audioCanon || audioCodecRaw].filter(Boolean).join(" / ")} are not H.264/AAC.`;
        return {
            videoCodecRaw,
            audioCodecRaw,
            codecTags: [videoCodecRaw, audioCodecRaw].filter(Boolean),
            container: container || "mp4",
            mimeType: mimeType || "video/mp4",
            videoCodec: videoCanon || videoCodecRaw || "unknown",
            audioCodec: audioCanon || audioCodecRaw || "unknown",
            mobileCompatible: false,
            compatibilityStatus: "conversion_required",
            compatibilityReason: reason,
            canPublish: false,
            publicationError: VIDEO_UPLOAD_INCOMPATIBLE_USER_MESSAGE,
        };
    }

    const containerOk = container === "mp4" || container === "isom" || container === "m4v";
    const mimeOk = !mimeType || mimeType === "video/mp4" || mimeType.startsWith("video/mp4") || mimeType === "application/octet-stream";
    const videoOk = isH264Raw(videoCodecRaw);
    const audioOk = isAacRaw(audioCodecRaw);

    if (videoOk && audioOk && containerOk && mimeOk) {
        return {
            videoCodecRaw,
            audioCodecRaw,
            codecTags: [videoCodecRaw, audioCodecRaw].filter(Boolean),
            container: "mp4",
            mimeType: "video/mp4",
            videoCodec: "h264",
            audioCodec: "aac",
            mobileCompatible: true,
            compatibilityStatus: "compatible",
            compatibilityReason: "MP4 with verified H.264 video and AAC audio.",
            canPublish: true,
            publicationError: "",
        };
    }

    // Missing audio, unverified bytes, or incomplete evidence — not publishable as compatible.
    return {
        videoCodecRaw,
        audioCodecRaw,
        codecTags: [videoCodecRaw, audioCodecRaw].filter(Boolean),
        container: container || "",
        mimeType: mimeType || "",
        videoCodec: videoCanon || videoCodecRaw || "unknown",
        audioCodec: audioCanon || audioCodecRaw || "unknown",
        mobileCompatible: false,
        compatibilityStatus: videoCodecRaw || audioCodecRaw ? "conversion_required" : "unknown",
        compatibilityReason: !videoCodecRaw && !audioCodecRaw
            ? "Codec bytes could not be verified; .mp4 extension / browser MIME is not sufficient."
            : !audioOk
                ? "AAC audio was not verified in the file."
                : !videoOk
                    ? "H.264 video was not verified in the file."
                    : !containerOk
                        ? "MP4 container (ftyp) was not verified in the file."
                        : "Upload is not verified as H.264/AAC MP4.",
        canPublish: false,
        publicationError: VIDEO_UPLOAD_INCOMPATIBLE_USER_MESSAGE,
    };
}

export function inspectVideoBytesForUploadCompatibility(
    bytes: Uint8Array,
    options: { mimeType?: string; fileName?: string } = {},
): VideoUploadCompatibilityInspection {
    const videoTags = findAsciiTagsInBytes(bytes, VIDEO_CODEC_TAGS);
    const audioTags = findAsciiTagsInBytes(bytes, AUDIO_CODEC_TAGS);
    const container = detectMp4Container(bytes);
    const videoCodecRaw = (["avc1", "avc2", "avc3", "hvc1", "hev1", "av01", "vp09", "vp08", "mp4v"] as const)
        .find((tag) => videoTags.includes(tag)) || "";
    const audioCodecRaw = (["mp4a", "ac-3", "ec-3", "Opus", "fLaC"] as const)
        .find((tag) => audioTags.includes(tag)) || "";

    const classified = classifyVideoUploadForPublication({
        videoCodecRaw,
        audioCodecRaw,
        container,
        mimeType: options.mimeType,
        fileName: options.fileName,
    });

    return {
        ...classified,
        codecTags: [...videoTags, ...audioTags],
        container: classified.container || container,
    };
}

export async function inspectVideoFileForUploadCompatibility(
    file: File,
    onReadProgress?: (loaded: number, total: number) => void,
): Promise<VideoUploadCompatibilityInspection> {
    const sampleSize = Math.min(DEFAULT_SAMPLE_BYTES, file.size);
    const chunks: Uint8Array[] = [];

    onReadProgress?.(0, file.size);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    const head = new Uint8Array(await file.slice(0, sampleSize).arrayBuffer());
    chunks.push(head);
    onReadProgress?.(head.byteLength, file.size);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    if (file.size > sampleSize) {
        const tail = new Uint8Array(await file.slice(Math.max(0, file.size - sampleSize), file.size).arrayBuffer());
        chunks.push(tail);
        onReadProgress?.(head.byteLength + tail.byteLength, file.size);
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }

    const merged = new Uint8Array(chunks.reduce((sum, part) => sum + part.byteLength, 0));
    let offset = 0;
    for (const part of chunks) {
        merged.set(part, offset);
        offset += part.byteLength;
    }

    return inspectVideoBytesForUploadCompatibility(merged, {
        mimeType: file.type,
        fileName: file.name,
    });
}

/** Canonical DB/API fields for a verified compatible publish. */
export function buildCompatibleVideoPublishMetadata(inspection: VideoUploadCompatibilityInspection) {
    return {
        video_codec: "h264",
        audio_codec: "aac",
        mobile_compatible: true as const,
        container: "mp4",
        mime_type: "video/mp4",
        compatibility_status: "compatible" as const,
        compatibility_reason: inspection.compatibilityReason,
    };
}

export function assertInspectionCanPublish(inspection: VideoUploadCompatibilityInspection) {
    if (!inspection.canPublish || inspection.compatibilityStatus !== "compatible" || inspection.mobileCompatible !== true) {
        throw new Error(inspection.publicationError || VIDEO_UPLOAD_INCOMPATIBLE_USER_MESSAGE);
    }
}

/** Debug panel fields for upload UI — always from byte inspection, never extension alone. */
export function describeVideoUploadCompatibilityDebug(inspection: VideoUploadCompatibilityInspection) {
    return {
        container: inspection.container || "unknown",
        videoCodec: inspection.videoCodecRaw || inspection.videoCodec || "unknown",
        audioCodec: inspection.audioCodecRaw || inspection.audioCodec || "unknown",
        compatible: inspection.canPublish ? "Yes" : "No",
        rejectionReason: inspection.canPublish
            ? ""
            : (inspection.compatibilityReason || VIDEO_UPLOAD_INCOMPATIBLE_USER_MESSAGE),
    };
}
