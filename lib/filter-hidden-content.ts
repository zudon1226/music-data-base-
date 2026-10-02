import { hiddenContentKey, type UserHiddenContentType } from "@/lib/user-hidden-content-types";

export function isHiddenFromUser(
    hiddenKeys: ReadonlySet<string>,
    contentType: UserHiddenContentType,
    contentId: string,
): boolean {
    if (!contentId) return false;
    return hiddenKeys.has(hiddenContentKey(contentType, contentId));
}

export function filterHiddenSongs<T extends { id: string }>(
    items: T[],
    hiddenKeys: ReadonlySet<string>,
): T[] {
    return items.filter((item) => !isHiddenFromUser(hiddenKeys, "song", String(item.id)));
}

export function filterHiddenVideos<T extends { id: string }>(
    items: T[],
    hiddenKeys: ReadonlySet<string>,
): T[] {
    return items.filter((item) => !isHiddenFromUser(hiddenKeys, "video", String(item.id)));
}

export function filterHiddenAlbums<T extends { id: string }>(
    items: T[],
    hiddenKeys: ReadonlySet<string>,
): T[] {
    return items.filter((item) => !isHiddenFromUser(hiddenKeys, "album", String(item.id)));
}
