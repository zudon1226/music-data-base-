/** Sponsor platform constants — revenue stays 100% platform. */

export const SPONSOR_STORAGE_BUCKET = "sponsor-assets";

export const SPONSOR_ALLOWED_IMAGE_MIME_TYPES = [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
] as const;

export const SPONSOR_ASSET_MAX_BYTES = 5 * 1024 * 1024;

export const SPONSOR_APPLICATION_STATUSES = [
    "draft",
    "submitted",
    "under_review",
    "approved",
    "payment_pending",
    "paid",
    "scheduled",
    "active",
    "expired",
    "rejected",
    "canceled",
] as const;

export type SponsorApplicationStatus = (typeof SPONSOR_APPLICATION_STATUSES)[number];

export const SPONSOR_PAYMENT_STATUSES = [
    "unpaid",
    "pending",
    "paid",
    "failed",
    "refunded",
    "canceled",
] as const;

export type SponsorPaymentStatus = (typeof SPONSOR_PAYMENT_STATUSES)[number];

export const SPONSOR_PLACEMENT_TYPES = [
    "home_featured",
    "marketplace_banner",
    "sidebar_spotlight",
] as const;

export type SponsorPlacementType = (typeof SPONSOR_PLACEMENT_TYPES)[number];

export const SPONSOR_ASSET_TYPES = ["logo", "banner", "campaign_image"] as const;

export const SPONSOR_CHECKOUT_FLOW = "sponsor_checkout";

/** Sponsor applications editable by applicant while in these statuses. */
export const SPONSOR_APPLICANT_EDITABLE_STATUSES = new Set<SponsorApplicationStatus>([
    "draft",
    "submitted",
    "under_review",
]);
