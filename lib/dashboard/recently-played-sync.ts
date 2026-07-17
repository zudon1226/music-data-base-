/** Client helpers for User Dashboard Phase 1 recently-played row sync. */

export type RecentlyPlayedSyncMediaType = "song" | "video" | "beat" | "album" | "ringtone";

export type RecentlyPlayedSyncPayload = {
    userId: string;
    mediaType: RecentlyPlayedSyncMediaType;
    mediaId: string;
    playbackPosition?: number;
    completed?: boolean;
    title?: string;
    artist?: string;
    coverUrl?: string;
};

type FetchFn = (path: string, init?: RequestInit & { requireAuth?: boolean }) => Promise<Response>;

export async function syncRecentlyPlayedRecord(fetchFn: FetchFn, payload: RecentlyPlayedSyncPayload) {
    const response = await fetchFn("/api/recently-played", {
        method: "POST",
        requireAuth: true,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            action: "upsert",
            userId: payload.userId,
            mediaType: payload.mediaType,
            mediaId: payload.mediaId,
            playbackPosition: payload.playbackPosition ?? 0,
            completed: Boolean(payload.completed),
            title: payload.title || "",
            artist: payload.artist || "",
            coverUrl: payload.coverUrl || "",
        }),
    });
    if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(String(data.error || "Could not sync recently played."));
    }
    return response.json().catch(() => ({}));
}

export async function removeRecentlyPlayedRecord(
    fetchFn: FetchFn,
    userId: string,
    input: { id?: string; mediaType?: RecentlyPlayedSyncMediaType; mediaId?: string },
) {
    const response = await fetchFn("/api/recently-played", {
        method: "POST",
        requireAuth: true,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            action: "remove",
            userId,
            id: input.id,
            mediaType: input.mediaType,
            mediaId: input.mediaId,
        }),
    });
    if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(String(data.error || "Could not remove recently played item."));
    }
}

export async function clearRecentlyPlayedRecords(fetchFn: FetchFn, userId: string) {
    const response = await fetchFn("/api/recently-played", {
        method: "POST",
        requireAuth: true,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "clear", userId }),
    });
    if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(String(data.error || "Could not clear recently played."));
    }
}
