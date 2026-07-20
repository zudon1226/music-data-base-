/** Human-readable attachment filenames for music/video paid-listener downloads. */

import {
    buildRingtoneContentDisposition,
    decodeRingtoneFilenameLabel,
    extensionFromStoragePath,
} from "@/lib/ringtone-download-filename";

const VIDEO_EXT_MIME: Record<string, string> = {
    mp4: "video/mp4",
    webm: "video/webm",
    mov: "video/quicktime",
    m4v: "video/x-m4v",
    mkv: "video/x-matroska",
};

const AUDIO_EXT_MIME: Record<string, string> = {
    mp3: "audio/mpeg",
    m4a: "audio/mp4",
    aac: "audio/aac",
    wav: "audio/wav",
    ogg: "audio/ogg",
    opus: "audio/opus",
    flac: "audio/flac",
};

export function mimeTypeForMediaExtension(extension: string, contentType: "music" | "video") {
    const ext = String(extension || "").toLowerCase();
    if (contentType === "video") {
        return VIDEO_EXT_MIME[ext] || "video/mp4";
    }
    return AUDIO_EXT_MIME[ext] || "audio/mpeg";
}

/**
 * Visible download name from content title + real storage extension.
 * Never uses UUID / storage key as the basename.
 */
export function buildMediaDownloadFilename(
    title: unknown,
    storagePath: string,
    contentType: "music" | "video",
) {
    const fallbackExt = contentType === "video" ? "mp4" : "mp3";
    const ext = extensionFromStoragePath(storagePath) || fallbackExt;
    let base = decodeRingtoneFilenameLabel(title)
        .replace(/[\u0000-\u001F\u007F]/g, "")
        .replace(/[<>:"/\\|?*]/g, "")
        .replace(/\s+/g, " ")
        .trim();
    base = base.replace(/[. ]+$/g, "").trim();
    if (!base) base = contentType === "video" ? "video" : "track";
    if (base.length > 120) {
        base = base.slice(0, 120).replace(/[. ]+$/g, "").trim() || (contentType === "video" ? "video" : "track");
    }
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(base)) {
        base = contentType === "video" ? "video" : "track";
    }
    return `${base}.${ext}`;
}

export function buildMediaContentDisposition(filename: string) {
    return buildRingtoneContentDisposition(filename);
}

export { extensionFromStoragePath, parseFilenameFromContentDisposition } from "@/lib/ringtone-download-filename";
