/**
 * DESKTOP ONLY — thin wrapper around the canonical upload-compatibility service.
 * All publish decisions live in lib/video-upload-compatibility.ts.
 */

import {
    describeVideoUploadCompatibilityDebug,
    inspectVideoFileForUploadCompatibility,
    VIDEO_UPLOAD_INCOMPATIBLE_USER_MESSAGE,
    type VideoPublicationCompatibilityStatus,
    type VideoUploadCompatibilityInspection,
} from "./video-upload-compatibility";

export type DesktopVideoCodecInfo = {
    videoCodec: string;
    audioCodec: string;
    videoCodecRaw: string;
    audioCodecRaw: string;
    codecTags: string[];
    container: string;
    mimeType: string;
    mobileCompatible: boolean;
    compatibilityStatus: VideoPublicationCompatibilityStatus;
    compatibilityReason: string;
    canPublish: boolean;
    publicationError: string;
};

function toDesktopInfo(inspection: VideoUploadCompatibilityInspection): DesktopVideoCodecInfo {
    return {
        videoCodec: inspection.videoCodec,
        audioCodec: inspection.audioCodec,
        videoCodecRaw: inspection.videoCodecRaw,
        audioCodecRaw: inspection.audioCodecRaw,
        codecTags: inspection.codecTags,
        container: inspection.container,
        mimeType: inspection.mimeType,
        mobileCompatible: inspection.mobileCompatible,
        compatibilityStatus: inspection.compatibilityStatus,
        compatibilityReason: inspection.compatibilityReason,
        canPublish: inspection.canPublish,
        publicationError: inspection.publicationError,
    };
}

export async function inspectDesktopVideoFileCodecInfo(
    file: File,
    onReadProgress?: (loaded: number, total: number) => void,
): Promise<DesktopVideoCodecInfo> {
    const inspection = await inspectVideoFileForUploadCompatibility(file, onReadProgress);
    return toDesktopInfo(inspection);
}

export function getDesktopVideoUploadCompatibilityError(codecInfo: DesktopVideoCodecInfo) {
    if (codecInfo.canPublish) {
        return "";
    }
    return codecInfo.publicationError || VIDEO_UPLOAD_INCOMPATIBLE_USER_MESSAGE;
}

export function getDesktopVideoUploadCompatibilityDebug(codecInfo: DesktopVideoCodecInfo) {
    return describeVideoUploadCompatibilityDebug({
        videoCodecRaw: codecInfo.videoCodecRaw,
        audioCodecRaw: codecInfo.audioCodecRaw,
        codecTags: codecInfo.codecTags,
        container: codecInfo.container,
        mimeType: codecInfo.mimeType,
        videoCodec: codecInfo.videoCodec,
        audioCodec: codecInfo.audioCodec,
        mobileCompatible: codecInfo.mobileCompatible,
        compatibilityStatus: codecInfo.compatibilityStatus,
        compatibilityReason: codecInfo.compatibilityReason,
        canPublish: codecInfo.canPublish,
        publicationError: codecInfo.publicationError,
    });
}

export { VIDEO_UPLOAD_INCOMPATIBLE_USER_MESSAGE, describeVideoUploadCompatibilityDebug };
