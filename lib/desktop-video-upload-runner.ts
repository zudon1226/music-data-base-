/** DESKTOP ONLY — orchestrated desktop video upload with real progress + stall timeout. */

import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { inspectDesktopVideoFileCodecInfo, getDesktopVideoUploadCompatibilityError, type DesktopVideoCodecInfo } from "./desktop-video-upload-codec";
import { saveDesktopVideoMetadataWithTransaction } from "./desktop-video-upload-completion";
import {
    createDesktopVideoUploadProgressController,
    runDesktopVideoUploadWithAbortSignal,
    type DesktopVideoUploadProgressUpdate,
} from "./desktop-video-upload-progress";
import {
    beginDesktopVideoUploadTransaction,
    endDesktopVideoUploadTransaction,
    publishDesktopVideoUploadSession,
    type DesktopVideoUploadTransaction,
} from "./desktop-video-upload-transaction";
import {
    prepareDesktopVideoStorageUpload,
    uploadDirectVideoStorageWithProgress,
    uploadSignedVideoStorageWithProgress,
} from "./desktop-video-upload-transfer";
import { buildVideoPublicStorageUrl } from "./supabase-storage-upload";

const VIDEOS_STORAGE_BUCKET = "videos";
const FILE_UPLOAD_PERCENT_RANGE: readonly [number, number] = [12, 84];

export type DesktopVideoUploadDetails = {
    title: string;
    creator: string;
    category: string;
    cover: string;
    producerId: string;
    producerName?: string;
    albumId?: string;
};

export type DesktopVideoUploadRunnerResult = {
    publicUrl: string;
    storagePath: string;
    uploadMethod: string;
    video: Record<string, unknown>;
    session: Session;
};

function getFileExtension(fileName: string) {
    return fileName.split(".").pop()?.toLowerCase() || "";
}

function cleanVideoStorageFileName(fileName: string) {
    const extension = getFileExtension(fileName).replace(/[^a-z0-9]/g, "") || "mp4";
    const baseName = fileName
        .replace(/\.[^/.]+$/, "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9._-]+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 80);
    return `${baseName || "video"}.${extension}`;
}

function buildVideoStoragePath(userId: string, file: File) {
    return `${userId}/${Date.now()}-${cleanVideoStorageFileName(file.name || "video.mp4")}`;
}

function getVideoUploadContentType(file: File) {
    const browserType = file.type.trim().toLowerCase();
    if (browserType && browserType.startsWith("video/")) {
        return browserType;
    }
    const extension = getFileExtension(file.name);
    if (extension === "mov") {
        return "video/quicktime";
    }
    if (extension === "webm") {
        return "video/webm";
    }
    if (extension === "m4v") {
        return "video/x-m4v";
    }
    return "video/mp4";
}

function normalizeVideoStoragePath(value: string) {
    let cleanPath = value.trim().replace(/^\/+/, "");
    cleanPath = cleanPath.replace(/^videos\/+/i, "");
    cleanPath = cleanPath.replace(/^public\/videos\/+/i, "");
    cleanPath = cleanPath.replace(/^object\/public\/videos\/+/i, "");
    cleanPath = cleanPath.replace(/^storage-(?=\d{10,}-)/i, "");
    return cleanPath;
}

function buildDirectUploadFormData(
    file: File,
    sessionUserId: string,
    storagePath: string,
    contentType: string,
) {
    const formData = new FormData();
    formData.append("mode", "direct-storage-upload");
    formData.append("file", file);
    formData.append("sessionUserId", sessionUserId);
    formData.append("userId", sessionUserId);
    formData.append("storagePath", storagePath);
    formData.append("contentType", contentType);
    return formData;
}

async function uploadVideoBytesWithProgress(
    transaction: DesktopVideoUploadTransaction,
    file: File,
    sessionUserId: string,
    storagePath: string,
    contentType: string,
    prepare: {
        ok: boolean;
        status: number;
        result: {
            storagePath?: string;
            token?: string;
            signedUrl?: string;
            publicUrl?: string;
            error?: string;
            details?: unknown;
            useDirectUpload?: boolean;
            uploadMethod?: string;
            bucket?: string;
        };
    },
    progress: ReturnType<typeof createDesktopVideoUploadProgressController>,
) {
    const prepareResult = prepare.result;
    const shouldUseDirectUpload = !prepare.ok
        || prepareResult.useDirectUpload
        || !prepareResult.token
        || prepareResult.error;

    const reportFileProgress = (loaded: number, total: number, status: string) => {
        progress.reportBytes(loaded, total > 0 ? total : file.size, status, FILE_UPLOAD_PERCENT_RANGE);
    };

    if (shouldUseDirectUpload) {
        progress.reportPhase("Uploading video to server storage...", 12);
        const directResult = await uploadDirectVideoStorageWithProgress(
            transaction,
            buildDirectUploadFormData(file, sessionUserId, storagePath, contentType),
            {
                signal: progress.signal,
                fileSize: file.size,
                onProgress: (loaded, total) => reportFileProgress(loaded, total, "Uploading video to server storage..."),
            },
        );
        return {
            savedStoragePath: normalizeVideoStoragePath(directResult.storagePath),
            publicUrl: directResult.publicUrl,
            uploadMethod: directResult.uploadMethod || "direct",
        };
    }

    progress.reportPhase("Uploading video to Supabase Storage...", 12);
    if (!prepareResult.signedUrl || !prepareResult.token) {
        throw new Error("Signed video upload is missing signedUrl or token.");
    }

    try {
        const signedStorageUpload = await uploadSignedVideoStorageWithProgress(
            prepareResult.signedUrl,
            prepareResult.token,
            file,
            contentType,
            {
                signal: progress.signal,
                fileSize: file.size,
                onProgress: (loaded, total) => reportFileProgress(loaded, total, "Uploading video to Supabase Storage..."),
            },
        );
        const savedStoragePath = normalizeVideoStoragePath(
            signedStorageUpload.path || prepareResult.storagePath || storagePath,
        );
        return {
            savedStoragePath,
            publicUrl: buildVideoPublicStorageUrl(savedStoragePath),
            uploadMethod: prepareResult.uploadMethod || "signed",
        };
    }
    catch (signedError) {
        progress.reportPhase("Signed upload failed, retrying via server storage...", 12);
        const directResult = await uploadDirectVideoStorageWithProgress(
            transaction,
            buildDirectUploadFormData(file, sessionUserId, storagePath, contentType),
            {
                signal: progress.signal,
                fileSize: file.size,
                onProgress: (loaded, total) => reportFileProgress(loaded, total, "Uploading video via server fallback..."),
            },
        );
        return {
            savedStoragePath: normalizeVideoStoragePath(directResult.storagePath),
            publicUrl: directResult.publicUrl,
            uploadMethod: directResult.uploadMethod || "direct",
        };
    }
}

export async function runDesktopVideoUpload(options: {
    supabase: SupabaseClient;
    file: File;
    pinnedSession?: Session | null;
    videoDetails: DesktopVideoUploadDetails;
    onProgress: (update: DesktopVideoUploadProgressUpdate) => void;
    onCodecInspected?: (codecInfo: DesktopVideoCodecInfo) => void;
}): Promise<DesktopVideoUploadRunnerResult> {
    const progress = createDesktopVideoUploadProgressController({
        onUpdate: options.onProgress,
    });

    let uploadTransaction: DesktopVideoUploadTransaction | null = null;

    try {
        progress.reportPhase("Starting video upload...", 3);

        progress.reportPhase("Preparing upload session...", 5);
        uploadTransaction = await beginDesktopVideoUploadTransaction(options.supabase, {
            pinnedSession: options.pinnedSession,
            signal: progress.signal,
        });
        progress.reportPhase("Upload session ready.", 8);
        progress.throwIfAborted();

        const sessionUser = uploadTransaction.session.user;
        const sessionUserId = String(sessionUser?.id || "").trim();
        if (!sessionUserId) {
            throw new Error("You must be signed in before uploading.");
        }

        const storagePath = buildVideoStoragePath(sessionUserId, options.file);

        progress.reportPhase("Analyzing video codec...", 8);
        const codecInfo = await runDesktopVideoUploadWithAbortSignal(
            inspectDesktopVideoFileCodecInfo(options.file, (loaded, total) => {
                progress.reportBytes(loaded, total, "Analyzing video codec...", [8, 10]);
            }),
            progress.signal,
        );
        options.onCodecInspected?.(codecInfo);
        const compatibilityError = getDesktopVideoUploadCompatibilityError(codecInfo);
        if (compatibilityError) {
            throw new Error(compatibilityError);
        }

        const contentType = "video/mp4";

        progress.reportPhase("Requesting signed upload URL...", 11);
        const prepare = await prepareDesktopVideoStorageUpload(
            uploadTransaction,
            {
                sessionUserId,
                userId: sessionUserId,
                storagePath,
            },
            progress.signal,
        );
        progress.reportPhase("Upload URL ready.", 12);
        progress.throwIfAborted();

        let storageResult: Awaited<ReturnType<typeof uploadVideoBytesWithProgress>>;
        try {
            storageResult = await uploadVideoBytesWithProgress(
                uploadTransaction,
                options.file,
                sessionUserId,
                storagePath,
                contentType,
                prepare,
                progress,
            );
        }
        catch (uploadError) {
            throw uploadError;
        }

        if (!storageResult.publicUrl) {
            throw new Error("Supabase did not return a public URL for the uploaded video.");
        }

        progress.reportPhase("Video file uploaded.", 85);

        progress.reportPhase("Saving video metadata...", 88);
        try {
            const metadataResult = await saveDesktopVideoMetadataWithTransaction(uploadTransaction, {
                storagePath: storageResult.savedStoragePath,
                fileName: options.file.name || "video.mp4",
                fileSize: options.file.size,
                contentType,
                title: options.videoDetails.title,
                description: options.videoDetails.creator,
                artistName: options.videoDetails.creator,
                category: options.videoDetails.category,
                coverUrl: options.videoDetails.cover,
                producerName: options.videoDetails.producerName || "",
                producerId: options.videoDetails.producerId || "",
                albumId: options.videoDetails.albumId || "",
                videoCodec: codecInfo.videoCodec,
                audioCodec: codecInfo.audioCodec,
                mobileCompatible: true,
                compatibilityStatus: "compatible",
                compatibilityReason: codecInfo.compatibilityReason,
                container: "mp4",
                mimeType: "video/mp4",
                cleanupOnFailure: true,
            }, progress.signal);

            progress.reportPhase("Finishing upload...", 96);
            publishDesktopVideoUploadSession(uploadTransaction.session);
            progress.reportPhase("Video upload complete.", 100);

            return {
                publicUrl: metadataResult.publicUrl,
                storagePath: metadataResult.storagePath,
                uploadMethod: storageResult.uploadMethod,
                video: metadataResult.video,
                session: uploadTransaction.session,
            };
        }
        catch (metadataError) {
            // Storage object cleanup is requested via cleanupOnFailure on the API.
            throw metadataError;
        }
    }
    finally {
        progress.dispose();
        if (uploadTransaction) {
            endDesktopVideoUploadTransaction();
        }
    }
}

export { VIDEOS_STORAGE_BUCKET };
