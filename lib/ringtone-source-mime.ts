import { RINGTONE_ALLOWED_AUDIO_MIME_TYPES } from "@/lib/ringtone-constants";

const EXTENSION_MIME: Record<string, string> = {
    mp3: "audio/mpeg",
    mpeg: "audio/mpeg",
    wav: "audio/wav",
    m4a: "audio/m4a",
    aac: "audio/aac",
};

/** Browsers (esp. Windows) often leave `file.type` empty for MP3; infer from extension. */
export function inferRingtoneSourceMimeType(file: File) {
    const direct = String(file.type || "").trim().toLowerCase();
    if (direct && (RINGTONE_ALLOWED_AUDIO_MIME_TYPES as readonly string[]).includes(direct)) {
        return direct;
    }
    const extension = file.name.split(".").pop()?.trim().toLowerCase() || "";
    const inferred = EXTENSION_MIME[extension] || "";
    if (inferred && (RINGTONE_ALLOWED_AUDIO_MIME_TYPES as readonly string[]).includes(inferred)) {
        return inferred;
    }
    return direct;
}