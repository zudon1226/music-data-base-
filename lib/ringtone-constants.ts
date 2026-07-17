/** Ringtone Platform Phase 1 duration and file rules. */

export const RINGTONE_MIN_DURATION_SECONDS = 15;
export const RINGTONE_DEFAULT_DURATION_SECONDS = 30;
export const RINGTONE_MAX_DURATION_SECONDS = 30;

export const RINGTONE_STATUSES = [
    "draft",
    "processing",
    "pending_review",
    "approved",
    "rejected",
    "published",
    "suspended",
    "archived",
] as const;

export type RingtoneStatus = (typeof RINGTONE_STATUSES)[number];

/** Marketplace / purchase visibility — published only (approved awaits admin publish). */
export const PUBLIC_RINGTONE_STATUSES: readonly RingtoneStatus[] = ["published"];

export const RINGTONE_SOURCE_KINDS = ["owned_song", "upload"] as const;
export type RingtoneSourceKind = (typeof RINGTONE_SOURCE_KINDS)[number];

export const RINGTONE_DEVICE_TYPES = ["iphone", "android", "other"] as const;
export type RingtoneDeviceType = (typeof RINGTONE_DEVICE_TYPES)[number];

export const RINGTONE_PAYMENT_STATUSES = [
    "pending",
    "paid",
    "failed",
    "refunded",
    "cancelled",
] as const;

export type RingtonePaymentStatus = (typeof RINGTONE_PAYMENT_STATUSES)[number];

export const RINGTONE_SUPPORTED_CURRENCIES = ["USD", "EUR", "GBP", "CAD", "AUD"] as const;
export type RingtoneCurrency = (typeof RINGTONE_SUPPORTED_CURRENCIES)[number];

export const RINGTONE_ALLOWED_AUDIO_MIME_TYPES = [
    "audio/mpeg",
    "audio/mp4",
    "audio/aac",
    "audio/wav",
    "audio/x-wav",
    "audio/m4a",
    "audio/x-m4a",
] as const;

/** 50 MB source upload ceiling for ringtone-only sources. */
export const RINGTONE_SOURCE_MAX_BYTES = 50 * 1024 * 1024;

/** 20 MB ceiling for generated preview/download artifacts. */
export const RINGTONE_ARTIFACT_MAX_BYTES = 20 * 1024 * 1024;

export const RINGTONE_STORAGE_BUCKETS = {
    source: "ringtone-source",
    previews: "ringtone-previews",
    downloads: "ringtone-downloads",
    /** Artwork continues to use the existing public covers strategy. */
    artwork: "covers",
} as const;

/**
 * Creator-managed statuses. Approval/publish/suspend/archive require admin.
 * Creators may submit drafts into pending_review via server action.
 */
export const CREATOR_EDITABLE_STATUSES: readonly RingtoneStatus[] = [
    "draft",
    "processing",
    "pending_review",
    "rejected",
];

export const ADMIN_ONLY_STATUSES: readonly RingtoneStatus[] = [
    "approved",
    "published",
    "suspended",
    "archived",
];
