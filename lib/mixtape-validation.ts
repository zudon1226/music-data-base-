import { safeRandomUUID } from "@/lib/safe-random-uuid";
import type { MixtapeTrackStatus } from "@/lib/mixtape-types";

export const MIXTAPE_BUCKET = "mixtapes";
export const MIXTAPE_AUDIO_MAX_BYTES = 104857600;
export const MIXTAPE_COVER_MAX_BYTES = 20 * 1024 * 1024;

export const MIXTAPE_AUDIO_MIME_TYPES = new Set([
    "audio/mpeg",
    "audio/mp4",
    "audio/aac",
    "audio/m4a",
    "audio/x-m4a",
]);

export const MIXTAPE_COVER_MIME_TYPES = new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
]);

const AUDIO_EXTENSIONS = new Set(["mp3", "m4a", "aac"]);
const COVER_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp"]);

const COVER_EXTENSION_MIME: Record<string, readonly string[]> = {
    jpg: ["image/jpeg"],
    jpeg: ["image/jpeg"],
    png: ["image/png"],
    webp: ["image/webp"],
};

const AUDIO_EXTENSION_MIME: Record<string, readonly string[]> = {
    mp3: ["audio/mpeg"],
    m4a: ["audio/mp4", "audio/m4a", "audio/x-m4a"],
    aac: ["audio/aac", "audio/mp4"],
};

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
        .slice(0, 80) || "mixtape-media";
    return extension ? `${base}.${extension}` : base;
}

export function validateMixtapeAudioDescriptor(input: {
    fileName: string;
    contentType: string;
    fileSize: number;
}) {
    const extension = cleanExtension(input.fileName);
    const contentType = input.contentType.trim().toLowerCase() || "application/octet-stream";
    if (!AUDIO_EXTENSIONS.has(extension)) {
        return { ok: false as const, error: "Mixtape audio supports MP3, M4A, or AAC files." };
    }
    if (!MIXTAPE_AUDIO_MIME_TYPES.has(contentType)) {
        return { ok: false as const, error: "Unsupported mixtape audio MIME type." };
    }
    const allowedAudioMime = AUDIO_EXTENSION_MIME[extension];
    if (!allowedAudioMime?.includes(contentType)) {
        return { ok: false as const, error: "Mixtape audio file extension does not match its MIME type." };
    }
    if (!Number.isFinite(input.fileSize) || input.fileSize <= 0 || input.fileSize > MIXTAPE_AUDIO_MAX_BYTES) {
        return {
            ok: false as const,
            error: `Mixtape audio must be between 1 byte and ${Math.round(MIXTAPE_AUDIO_MAX_BYTES / 1024 / 1024)} MB.`,
        };
    }
    return { ok: true as const, contentType, extension };
}

export function validateMixtapeCoverDescriptor(input: {
    fileName: string;
    contentType: string;
    fileSize: number;
}) {
    const extension = cleanExtension(input.fileName);
    const contentType = input.contentType.trim().toLowerCase();
    if (!COVER_EXTENSIONS.has(extension) || !MIXTAPE_COVER_MIME_TYPES.has(contentType)) {
        return { ok: false as const, error: "Mixtape cover must be JPEG, PNG, or WebP." };
    }
    const allowedCoverMime = COVER_EXTENSION_MIME[extension];
    if (!allowedCoverMime?.includes(contentType)) {
        return { ok: false as const, error: "Mixtape cover file extension does not match its MIME type." };
    }
    if (!Number.isFinite(input.fileSize) || input.fileSize <= 0 || input.fileSize > MIXTAPE_COVER_MAX_BYTES) {
        return { ok: false as const, error: "Mixtape cover must be between 1 byte and 20 MB." };
    }
    return { ok: true as const, contentType, extension };
}

export function buildMixtapeTrackStoragePath(input: {
    userId: string;
    mixtapeId: string;
    fileName: string;
}) {
    return `${input.userId}/${input.mixtapeId}/tracks/${safeRandomUUID()}-${safeFileName(input.fileName)}`;
}

export function buildMixtapeCoverStoragePath(input: {
    userId: string;
    mixtapeId: string;
    fileName: string;
}) {
    return `${input.userId}/${input.mixtapeId}/${safeRandomUUID()}-${safeFileName(input.fileName)}`;
}

export function validateMixtapeOwnedTrackStoragePath(storagePath: string, userId: string, mixtapeId: string) {
    const normalized = storagePath.trim().replace(/^\/+/, "");
    const parts = normalized.split("/");
    if (
        !normalized
        || parts[0] !== userId
        || parts[1] !== mixtapeId
        || parts[2] !== "tracks"
        || parts.length < 4
    ) {
        return { ok: false as const, error: "Mixtape track storage path does not belong to this mixtape." };
    }
    return { ok: true as const, storagePath: normalized };
}

export function validateMixtapeOwnedCoverStoragePath(storagePath: string, userId: string, mixtapeId: string) {
    const normalized = storagePath.trim().replace(/^\/+/, "");
    const parts = normalized.split("/");
    if (!normalized || parts[0] !== userId || parts[1] !== mixtapeId || parts.length !== 3) {
        return { ok: false as const, error: "Mixtape cover storage path does not belong to this mixtape." };
    }
    return { ok: true as const, storagePath: normalized };
}

export function validateMixtapeTrackPublishRules(input: {
    status: MixtapeTrackStatus | "draft" | "published" | "archived";
    durationSeconds: number | null | undefined;
}) {
    if (input.status !== "published") return { ok: true as const };
    const duration = Number(input.durationSeconds);
    if (!Number.isFinite(duration) || duration <= 0) {
        return {
            ok: false as const,
            error: "Published mixtape tracks require a positive duration before publish.",
        };
    }
    return { ok: true as const };
}

export function isTrackShapedMixtapePayload(body: Record<string, unknown>) {
    return Boolean(
        body.mixtapeId
        || body.mixtape_id
        || body.storagePath
        || body.storage_path
        || body.position != null,
    );
}