/**
 * DESKTOP ONLY — fast codec sniff (small sample, yields for UI progress).
 * Uses canonical compatibility rules: H.264/AAC/MP4 = compatible;
 * positive bad codec = unsupported; unverified = unknown (never forced false).
 */

import { assessUploadCompatibility, type VideoCompatibilityStatus } from "@/lib/canonical-video";

const VIDEO_CODEC_TAGS = ["avc1", "avc2", "avc3", "hvc1", "hev1", "av01", "vp09", "mp4v"];
const AUDIO_CODEC_TAGS = ["mp4a", "ac-3", "ec-3", "Opus", "fLaC"];
const CODEC_SAMPLE_BYTES = 256 * 1024;

export type DesktopVideoCodecInfo = {
    videoCodec: string;
    audioCodec: string;
    codecTags: string[];
    container: string;
    mimeType: string;
    mobileCompatible: boolean | null;
    compatibilityStatus: VideoCompatibilityStatus;
    compatibilityReason: string;
};

function findAsciiTagsInBytes(bytes: Uint8Array, tags: string[]) {
    const haystack = new TextDecoder("latin1").decode(bytes);
    return tags.filter((tag) => haystack.includes(tag));
}

function detectMp4Container(bytes: Uint8Array) {
    const haystack = new TextDecoder("latin1").decode(bytes.slice(0, Math.min(bytes.length, 64)));
    if (haystack.includes("ftyp")) return "mp4";
    return "";
}

function yieldToBrowser() {
    return new Promise<void>((resolve) => {
        setTimeout(resolve, 0);
    });
}

export async function inspectDesktopVideoFileCodecInfo(
    file: File,
    onReadProgress?: (loaded: number, total: number) => void,
): Promise<DesktopVideoCodecInfo> {
    const sampleSize = Math.min(CODEC_SAMPLE_BYTES, file.size);
    const videoTags = new Set<string>();
    const audioTags = new Set<string>();
    let container = "";

    onReadProgress?.(0, file.size);
    await yieldToBrowser();

    const head = new Uint8Array(await file.slice(0, sampleSize).arrayBuffer());
    findAsciiTagsInBytes(head, VIDEO_CODEC_TAGS).forEach((tag) => videoTags.add(tag));
    findAsciiTagsInBytes(head, AUDIO_CODEC_TAGS).forEach((tag) => audioTags.add(tag));
    container = detectMp4Container(head);
    onReadProgress?.(head.byteLength, file.size);
    await yieldToBrowser();

    if (file.size > sampleSize) {
        const tail = new Uint8Array(await file.slice(Math.max(0, file.size - sampleSize), file.size).arrayBuffer());
        findAsciiTagsInBytes(tail, VIDEO_CODEC_TAGS).forEach((tag) => videoTags.add(tag));
        findAsciiTagsInBytes(tail, AUDIO_CODEC_TAGS).forEach((tag) => audioTags.add(tag));
        if (!container) container = detectMp4Container(tail);
        onReadProgress?.(head.byteLength + tail.byteLength, file.size);
        await yieldToBrowser();
    }

    const videoCodec = ["avc1", "avc2", "avc3", "hvc1", "hev1", "av01", "vp09", "mp4v"].find((tag) => videoTags.has(tag)) || "";
    const audioCodec = ["mp4a", "ac-3", "ec-3", "Opus", "fLaC"].find((tag) => audioTags.has(tag)) || "";
    const mimeType = (file.type || "").trim().toLowerCase() || (container === "mp4" ? "video/mp4" : "");

    const assessed = assessUploadCompatibility({
        mimeType,
        fileName: file.name,
        container: container || (file.name.toLowerCase().endsWith(".mp4") ? "" : ""),
        videoCodec,
        audioCodec,
    });

    return {
        videoCodec,
        audioCodec,
        codecTags: [...videoTags, ...audioTags],
        container: container || (assessed.status === "compatible" ? "mp4" : container),
        mimeType: mimeType || (container === "mp4" || file.name.toLowerCase().endsWith(".mp4") ? "video/mp4" : mimeType || ""),
        mobileCompatible: assessed.mobileCompatible,
        compatibilityStatus: assessed.status,
        compatibilityReason: assessed.reason,
    };
}

export function getDesktopVideoUploadCompatibilityError(codecInfo: DesktopVideoCodecInfo) {
    if (codecInfo.compatibilityStatus !== "unsupported") {
        return "";
    }
    const videoCodec = (codecInfo.videoCodec || "").toLowerCase();
    if (videoCodec === "av01" || videoCodec.startsWith("av01") || videoCodec === "av1") {
        return "Upload blocked: this file is AV1 inside an .mp4 container. An .mp4 extension does not guarantee H.264. Convert to H.264 (avc1) video with AAC (mp4a) audio in an MP4 container before uploading. This file is not iPhone-compatible.";
    }
    return `Upload blocked: incompatible codecs (${[codecInfo.videoCodec, codecInfo.audioCodec].filter(Boolean).join(" / ") || "unknown"}). Fully accepted uploads require MP4 + H.264/AVC (avc1) + AAC (mp4a) or no audio, MIME video/mp4. ${codecInfo.compatibilityReason}`;
}
