/**
 * Publication gates for ringtone marketplace visibility (Phase 4).
 * A ringtone may become publicly visible only when every gate passes
 * and an admin publish action succeeds (status → published).
 */

import {
    RINGTONE_MAX_DURATION_SECONDS,
    RINGTONE_MIN_DURATION_SECONDS,
} from "@/lib/ringtone-constants";

export function canPublishRingtone(product: Record<string, unknown>): {
    ok: true;
} | {
    ok: false;
    error: string;
    code: string;
} {
    const status = String(product.status || "");
    if (status !== "approved") {
        return { ok: false, error: "Only approved ringtones can be published.", code: "NOT_APPROVED" };
    }
    if (product.ownership_confirmed !== true) {
        return { ok: false, error: "Ownership confirmation is required before publication.", code: "OWNERSHIP_REQUIRED" };
    }
    const title = String(product.title || "").trim();
    if (!title) {
        return { ok: false, error: "Title is required before publication.", code: "METADATA_REQUIRED" };
    }
    const duration = Number(product.duration_seconds);
    if (!Number.isFinite(duration) || duration < RINGTONE_MIN_DURATION_SECONDS || duration > RINGTONE_MAX_DURATION_SECONDS) {
        return { ok: false, error: "Duration must be between 15 and 30 seconds.", code: "INVALID_DURATION" };
    }
    const previewPath = String(product.preview_storage_path || "");
    const iphonePath = String(product.iphone_storage_path || "");
    const androidPath = String(product.android_storage_path || "");
    if (!previewPath) {
        return { ok: false, error: "Valid preview output is required before publication.", code: "PREVIEW_REQUIRED" };
    }
    if (!iphonePath) {
        return { ok: false, error: "Valid iPhone output is required before publication.", code: "IPHONE_REQUIRED" };
    }
    if (!androidPath) {
        return { ok: false, error: "Valid Android output is required before publication.", code: "ANDROID_REQUIRED" };
    }
    if (product.iphone_available === false || product.android_available === false) {
        return { ok: false, error: "Device outputs must be marked ready before publication.", code: "OUTPUTS_NOT_READY" };
    }
    const processingError = String(product.last_processing_error_code || "");
    if (processingError) {
        return { ok: false, error: "Processing must complete successfully before publication.", code: "PROCESSING_FAILED" };
    }
    return { ok: true };
}

/** Marketplace / public detail visibility — published only. */
export function isMarketplaceVisibleRingtoneStatus(status: unknown) {
    return String(status || "") === "published";
}
