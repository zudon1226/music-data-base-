/** Supported notification kinds for User Dashboard Phase 1. */

export const NOTIFICATION_KINDS = [
    "new_follower",
    "song_liked",
    "video_liked",
    "comment_received",
    "playlist_activity",
    "upload_processing_completed",
    "upload_failed",
    "ringtone_submitted",
    "ringtone_approved",
    "ringtone_rejected",
    "ringtone_published",
    "ringtone_purchased",
    "marketplace_sale",
    "artist_producer_approval",
    "system_announcement",
] as const;

export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export function isNotificationKind(value: unknown): value is NotificationKind {
    return typeof value === "string" && (NOTIFICATION_KINDS as readonly string[]).includes(value);
}

export function defaultHrefForNotification(kind: string | null | undefined, itemType?: string | null, itemId?: string | null) {
    const id = String(itemId || "").trim();
    switch (kind) {
        case "new_follower":
            return "Following";
        case "song_liked":
            return id ? `Liked` : "Liked";
        case "video_liked":
            return "Videos";
        case "playlist_activity":
            return "Playlists";
        case "ringtone_submitted":
        case "ringtone_approved":
        case "ringtone_rejected":
        case "ringtone_published":
            return "My Ringtones";
        case "ringtone_purchased":
            return "My Purchased Ringtones";
        case "marketplace_sale":
            return "Sales";
        case "artist_producer_approval":
            return "Profile";
        case "upload_processing_completed":
        case "upload_failed":
            return itemType === "video" ? "Videos" : "Library";
        case "system_announcement":
            return "Home";
        default:
            return "Home";
    }
}
