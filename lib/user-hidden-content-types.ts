export const USER_HIDDEN_CONTENT_TYPES = [
    "song",
    "video",
    "album",
    "podcast_episode",
    "podcast_show",
    "ringtone",
] as const;

export type UserHiddenContentType = (typeof USER_HIDDEN_CONTENT_TYPES)[number];

export function isUserHiddenContentType(value: unknown): value is UserHiddenContentType {
    return (USER_HIDDEN_CONTENT_TYPES as readonly string[]).includes(String(value || "").trim());
}

export function hiddenContentKey(contentType: UserHiddenContentType, contentId: string): string {
    return `${contentType}:${String(contentId || "").trim()}`;
}
