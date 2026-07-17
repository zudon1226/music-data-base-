export const ACTIVITY_KINDS = [
    "upload_song",
    "upload_video",
    "upload_beat",
    "upload_album",
    "like_song",
    "like_video",
    "playlist_add",
    "new_follower",
    "release",
    "approval",
] as const;

export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

export function isActivityKind(value: unknown): value is ActivityKind {
    return typeof value === "string" && (ACTIVITY_KINDS as readonly string[]).includes(value);
}

export function defaultHrefForActivity(kind: ActivityKind, itemType?: string | null) {
    switch (kind) {
        case "upload_song":
        case "like_song":
            return "Library";
        case "upload_video":
        case "like_video":
            return "Videos";
        case "upload_beat":
            return "Beats";
        case "upload_album":
        case "release":
            return "Library";
        case "playlist_add":
            return "Playlists";
        case "new_follower":
            return "Following";
        case "approval":
            return "Profile";
        default:
            return itemType === "video" ? "Videos" : "Home";
    }
}
