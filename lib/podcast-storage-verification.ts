import type { SupabaseClient } from "@supabase/supabase-js";
import {
    inspectVideoBytesForUploadCompatibility,
    VIDEO_UPLOAD_INCOMPATIBLE_USER_MESSAGE,
} from "@/lib/video-upload-compatibility";
import type { PodcastEpisodeType } from "@/lib/podcast-types";
import {
    getPodcastBucket,
    validatePodcastMediaDescriptor,
    validatePodcastOwnedStoragePath,
} from "@/lib/podcast-validation";

const VIDEO_SAMPLE_BYTES = 256 * 1024;
const VERIFY_FETCH_TIMEOUT_MS = 20_000;

async function readResponseBytes(response: Response, maximumBytes: number) {
    if (!response.body) return new Uint8Array(await response.arrayBuffer()).slice(0, maximumBytes);
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
        while (total < maximumBytes) {
            const { done, value } = await reader.read();
            if (done) break;
            const remaining = maximumBytes - total;
            const chunk = value.byteLength > remaining ? value.slice(0, remaining) : value;
            chunks.push(chunk);
            total += chunk.byteLength;
        }
    } finally {
        await reader.cancel().catch(() => undefined);
    }
    const merged = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
        merged.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return merged;
}

async function fetchRange(url: string, range: string) {
    const response = await fetch(url, {
        method: "GET",
        headers: { Range: range },
        cache: "no-store",
        signal: AbortSignal.timeout(VERIFY_FETCH_TIMEOUT_MS),
    });
    if (!response.ok && response.status !== 206) {
        throw new Error(`Podcast media verification could not read the uploaded object (HTTP ${response.status}).`);
    }
    return response;
}

function resolveObjectSize(response: Response) {
    const contentRange = response.headers.get("content-range") || "";
    const match = contentRange.match(/\/(\d+)$/);
    if (match) return Number(match[1]);
    const contentLength = Number(response.headers.get("content-length") || 0);
    return Number.isFinite(contentLength) ? contentLength : 0;
}

function includesAscii(bytes: Uint8Array, value: string) {
    const target = new TextEncoder().encode(value);
    outer: for (let index = 0; index <= bytes.byteLength - target.byteLength; index += 1) {
        for (let offset = 0; offset < target.byteLength; offset += 1) {
            if (bytes[index + offset] !== target[offset]) continue outer;
        }
        return true;
    }
    return false;
}

function hasMpegAudioFrame(bytes: Uint8Array) {
    for (let index = 0; index < bytes.byteLength - 1; index += 1) {
        if (bytes[index] === 0xff && (bytes[index + 1] & 0xe0) === 0xe0) return true;
    }
    return false;
}

function hasAacAdtsFrame(bytes: Uint8Array) {
    for (let index = 0; index < bytes.byteLength - 1; index += 1) {
        if (bytes[index] === 0xff && (bytes[index + 1] & 0xf6) === 0xf0) return true;
    }
    return false;
}

async function readObjectSamples(
    supabase: SupabaseClient,
    bucket: string,
    storagePath: string,
    signedUrl: string,
    episodeType: PodcastEpisodeType,
    fileSize: number,
) {
    // Prefer service-role download for small/medium audio — signed-URL fetch can hang inside Next.js.
    if (episodeType === "audio" && fileSize > 0 && fileSize <= 12 * 1024 * 1024) {
        const downloaded = await supabase.storage.from(bucket).download(storagePath);
        if (!downloaded.error && downloaded.data) {
            const full = new Uint8Array(await downloaded.data.arrayBuffer());
            const firstBytes = full.slice(0, VIDEO_SAMPLE_BYTES);
            const tailBytes = full.byteLength > VIDEO_SAMPLE_BYTES
                ? full.slice(Math.max(0, full.byteLength - VIDEO_SAMPLE_BYTES))
                : new Uint8Array(0);
            return {
                storedSize: full.byteLength,
                firstBytes,
                tailBytes,
                source: "service-download" as const,
            };
        }
    }

    const head = await fetchRange(signedUrl, `bytes=0-${VIDEO_SAMPLE_BYTES - 1}`);
    const storedSize = resolveObjectSize(head);
    const firstBytes = await readResponseBytes(head, VIDEO_SAMPLE_BYTES);
    let tailBytes = new Uint8Array(0);
    if (episodeType === "video" || storagePath.toLowerCase().endsWith(".m4a")) {
        const tailResponse = await fetchRange(signedUrl, `bytes=-${VIDEO_SAMPLE_BYTES}`);
        tailBytes = await readResponseBytes(tailResponse, VIDEO_SAMPLE_BYTES);
    }
    return { storedSize, firstBytes, tailBytes, source: "signed-range" as const };
}

export async function verifyPodcastStoredMedia(input: {
    supabase: SupabaseClient;
    userId: string;
    episodeType: PodcastEpisodeType;
    storagePath: string;
    fileName: string;
    contentType: string;
    fileSize: number;
}) {
    const descriptor = validatePodcastMediaDescriptor(input);
    if (!descriptor.ok) return descriptor;
    const ownerPath = validatePodcastOwnedStoragePath(input.storagePath, input.userId);
    if (!ownerPath.ok) return ownerPath;
    const bucket = getPodcastBucket(input.episodeType);
    const signed = await input.supabase.storage.from(bucket).createSignedUrl(ownerPath.storagePath, 120);
    if (signed.error || !signed.data?.signedUrl) {
        return { ok: false as const, error: "Uploaded Podcast media could not be verified." };
    }
    try {
        const samples = await readObjectSamples(
            input.supabase,
            bucket,
            ownerPath.storagePath,
            signed.data.signedUrl,
            input.episodeType,
            input.fileSize,
        );
        if (samples.storedSize > 0 && samples.storedSize !== input.fileSize) {
            return { ok: false as const, error: "Uploaded Podcast media size does not match the selected file." };
        }
        const firstBytes = samples.firstBytes;
        if (input.episodeType === "audio") {
            let inspectionBytes = firstBytes;
            if (descriptor.extension === "m4a") {
                inspectionBytes = new Uint8Array(firstBytes.byteLength + samples.tailBytes.byteLength);
                inspectionBytes.set(firstBytes, 0);
                inspectionBytes.set(samples.tailBytes, firstBytes.byteLength);
            }
            const validAudioBytes = descriptor.extension === "mp3"
                ? includesAscii(firstBytes.slice(0, 3), "ID3") || hasMpegAudioFrame(firstBytes)
                : descriptor.extension === "aac"
                    ? hasAacAdtsFrame(firstBytes)
                    : includesAscii(firstBytes.slice(0, 64), "ftyp") && includesAscii(inspectionBytes, "mp4a");
            if (!validAudioBytes) {
                return {
                    ok: false as const,
                    error: "Podcast audio bytes do not match the selected MP3, M4A, or AAC format.",
                };
            }
            return {
                ok: true as const,
                bucket,
                storagePath: ownerPath.storagePath,
                mimeType: descriptor.contentType,
                container: descriptor.extension === "mp3" ? "mp3" : "mp4",
                audioCodec: descriptor.extension === "mp3" ? "mp3" : "aac",
                videoCodec: "",
                mobileCompatible: true,
                compatibilityStatus: "compatible",
                compatibilityReason: "Accepted Podcast audio format.",
            };
        }

        const combined = new Uint8Array(firstBytes.byteLength + samples.tailBytes.byteLength);
        combined.set(firstBytes, 0);
        combined.set(samples.tailBytes, firstBytes.byteLength);
        const inspection = inspectVideoBytesForUploadCompatibility(combined, {
            mimeType: descriptor.contentType,
            fileName: input.fileName,
        });
        if (!inspection.canPublish) {
            return {
                ok: false as const,
                error: VIDEO_UPLOAD_INCOMPATIBLE_USER_MESSAGE,
                compatibility: inspection,
            };
        }
        return {
            ok: true as const,
            bucket,
            storagePath: ownerPath.storagePath,
            mimeType: "video/mp4",
            container: "mp4",
            audioCodec: "aac",
            videoCodec: "h264",
            mobileCompatible: true,
            compatibilityStatus: "compatible",
            compatibilityReason: inspection.compatibilityReason,
        };
    }
    catch (error) {
        return {
            ok: false as const,
            error: error instanceof Error ? error.message : "Podcast media verification failed.",
        };
    }
}
