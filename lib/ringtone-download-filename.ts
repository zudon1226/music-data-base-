/** Build a user-visible ringtone download filename from title + real audio extension. */

const AUDIO_EXT_MIME: Record<string, string> = {
    mp3: "audio/mpeg",
    m4a: "audio/mp4",
    m4r: "audio/mp4",
    aac: "audio/aac",
    wav: "audio/wav",
    ogg: "audio/ogg",
    opus: "audio/opus",
};

export function extensionFromStoragePath(storagePath: string) {
    const base = String(storagePath || "").split("/").pop() || "";
    const dot = base.lastIndexOf(".");
    if (dot < 0 || dot === base.length - 1) return "mp3";
    const ext = base.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!ext || ext.length > 8) return "mp3";
    return ext;
}

export function mimeTypeForAudioExtension(extension: string) {
    const ext = String(extension || "").toLowerCase();
    return AUDIO_EXT_MIME[ext] || "application/octet-stream";
}

/**
 * Visible download name from ringtone title + real extension.
 * Never uses purchase id, UUID, platform label, or storage key as the basename.
 */
export function buildRingtoneDownloadFilename(title: unknown, storagePath: string) {
    const ext = extensionFromStoragePath(storagePath);
    let base = String(title ?? "")
        .replace(/[\u0000-\u001F\u007F]/g, "")
        .replace(/[<>:"/\\|?*]/g, "")
        .replace(/\s+/g, " ")
        .trim();
    base = base.replace(/[. ]+$/g, "").trim();
    if (!base) base = "ringtone";
    if (base.length > 120) {
        base = base.slice(0, 120).replace(/[. ]+$/g, "").trim() || "ringtone";
    }
    // Reject accidental uuid / platform basenames
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(base)) {
        base = "ringtone";
    }
    if (/^(iphone|android|other)$/i.test(base)) {
        base = "ringtone";
    }
    return `${base}.${ext}`;
}

/** RFC 6266 / 5987 Content-Disposition for audio attachment downloads. */
export function buildRingtoneContentDisposition(filename: string) {
    const safe = String(filename || "ringtone.mp3").replace(/[\u0000-\u001F\u007F]/g, "").trim() || "ringtone.mp3";
    const asciiFallback = safe
        .replace(/[^\x20-\x7E]/g, "_")
        .replace(/"/g, "")
        .replace(/[. ]+$/g, "")
        || "ringtone.mp3";
    const encoded = encodeURIComponent(safe)
        .replace(/['()]/g, (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`)
        .replace(/\*/g, "%2A");
    return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
}

export function parseFilenameFromContentDisposition(header: string | null) {
    const value = String(header || "");
    const star = /filename\*=UTF-8''([^;]+)/i.exec(value);
    if (star?.[1]) {
        try {
            return decodeURIComponent(star[1].trim());
        } catch {
            /* fall through */
        }
    }
    const quoted = /filename="([^"]+)"/i.exec(value);
    if (quoted?.[1]) return quoted[1];
    const plain = /filename=([^;]+)/i.exec(value);
    if (plain?.[1]) return plain[1].trim().replace(/^["']|["']$/g, "");
    return null;
}
