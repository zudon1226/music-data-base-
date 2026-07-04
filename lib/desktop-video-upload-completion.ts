/** DESKTOP ONLY — database save after Storage upload (same pinned upload session). */

import type { DesktopVideoUploadTransaction } from "./desktop-video-upload-transaction";
import { fetchWithDesktopVideoUploadTransaction } from "./desktop-video-upload-transaction";
import { buildVideoPublicStorageUrl } from "./supabase-storage-upload";

const METADATA_SAVE_MAX_ATTEMPTS = 4;
const METADATA_SAVE_RETRY_DELAYS_MS = [0, 800, 1600, 2400];

export type DesktopVideoMetadataSaveInput = {
    storagePath: string;
    fileName: string;
    fileSize: number;
    contentType: string;
    title: string;
    description: string;
    artistName: string;
    category: string;
    coverUrl: string;
    producerName: string;
    producerId: string;
    albumId: string;
    videoCodec: string;
    audioCodec: string;
    mobileCompatible: boolean;
};

export type DesktopVideoUploadCompletionResult = {
    publicUrl: string;
    storagePath: string;
    video: Record<string, unknown>;
    verification?: Record<string, unknown>;
};

export type DesktopVideoMetadataSaveResult = DesktopVideoUploadCompletionResult;

function delay(ms: number) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function normalizeStoragePath(storagePath: string) {
    return storagePath.trim().replace(/^\/+/, "").replace(/^videos\/+/i, "");
}

function readMetadataSaveError(result: Record<string, unknown>, status: number) {
    if (typeof result.error === "string" && result.error.trim()) {
        return result.error.trim();
    }
    return `Video metadata save failed with HTTP ${status}.`;
}

function isRetriableMetadataVerifyFailure(status: number, errorMessage: string) {
    if (status < 500) {
        return false;
    }
    const normalized = errorMessage.toLowerCase();
    return normalized.includes("public url")
        || normalized.includes("storage object")
        || normalized.includes("did not return 200")
        || normalized.includes("content-type");
}

/**
 * Insert the videos row using the same pinned session/token as prepare + storage upload.
 * Does not refresh, recreate, or re-validate the Supabase session.
 */
export async function saveDesktopVideoMetadataWithTransaction(
    transaction: DesktopVideoUploadTransaction,
    input: DesktopVideoMetadataSaveInput,
    signal?: AbortSignal,
): Promise<DesktopVideoUploadCompletionResult> {
    const storagePath = normalizeStoragePath(input.storagePath);
    const publicUrl = buildVideoPublicStorageUrl(storagePath);
    if (!storagePath || !publicUrl) {
        throw new Error("Could not derive storage path or public URL for the uploaded video.");
    }

    const payload = {
        sessionUserId: transaction.userId,
        userId: transaction.userId,
        publicUrl,
        storagePath,
        fileName: input.fileName,
        fileSize: input.fileSize,
        contentType: input.contentType,
        title: input.title,
        description: input.description,
        artistName: input.artistName,
        artist_id: transaction.userId,
        category: input.category,
        coverUrl: input.coverUrl,
        producerName: input.producerName,
        producerId: input.producerId,
        producer_profile_id: input.producerId,
        album_id: input.albumId,
        videoCodec: input.videoCodec,
        audioCodec: input.audioCodec,
        mobileCompatible: input.mobileCompatible,
        cleanupOnFailure: false,
    };

    let lastResponse: Response | null = null;
    let lastResult: Record<string, unknown> = {};
    let lastErrorMessage = "";

    for (let attempt = 0; attempt < METADATA_SAVE_MAX_ATTEMPTS; attempt += 1) {
        if (attempt > 0) {
            await delay(METADATA_SAVE_RETRY_DELAYS_MS[attempt] ?? 2400);
        }

        lastResponse = await fetchWithDesktopVideoUploadTransaction(transaction, "/api/video-upload", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
            signal,
        });

        lastResult = (await lastResponse.json().catch(() => ({}))) as Record<string, unknown>;
        if (lastResponse.ok && lastResult.video) {
            return {
                publicUrl: String(lastResult.publicUrl || publicUrl),
                storagePath: String(lastResult.storagePath || storagePath),
                video: lastResult.video as Record<string, unknown>,
                verification: lastResult.verification as Record<string, unknown> | undefined,
            };
        }

        lastErrorMessage = readMetadataSaveError(lastResult, lastResponse.status);
        if (!isRetriableMetadataVerifyFailure(lastResponse.status, lastErrorMessage)) {
            break;
        }
    }

    const details = lastResult.details ? ` ${JSON.stringify(lastResult.details)}` : "";
    throw new Error(`${lastErrorMessage}${details}`);
}

/** @deprecated Use saveDesktopVideoMetadataWithTransaction */
export async function finishDesktopVideoUploadAfterStorage(): Promise<never> {
    throw new Error("finishDesktopVideoUploadAfterStorage requires a DesktopVideoUploadTransaction. Use saveDesktopVideoMetadataWithTransaction.");
}

/** @deprecated Use saveDesktopVideoMetadataWithTransaction */
export async function completeDesktopVideoUpload(): Promise<never> {
    throw new Error("completeDesktopVideoUpload requires a DesktopVideoUploadTransaction. Use saveDesktopVideoMetadataWithTransaction.");
}
