/** DESKTOP ONLY — immediate POST dispatch for Like, Follow, Save, Create Playlist. */

import type { DesktopProtectedActionFetch } from "./desktop-protected-action-pipeline";

const INTERACTION_PREFIX = "[desktop-interaction]";

export type DesktopProtectedInteractionLayerConfig = {
    fetch: DesktopProtectedActionFetch;
};

export type DesktopSongLikePayload = {
    songId: string;
    like: boolean;
};

export type DesktopArtistFollowPayload = {
    artistId: string;
    artistName: string;
    follow: boolean;
};

export type DesktopLibrarySavePayload = {
    itemId: string;
    itemType: "song" | "video" | "album";
};

export type DesktopCreatePlaylistPayload = {
    id: string;
    name: string;
    cover: string;
    playlistType: "song" | "video" | "mixed";
};

function logInteractionDispatch(action: string, path: string, payload: Record<string, unknown>) {
    console.log(INTERACTION_PREFIX, "dispatch", { action, path, ...payload });
}

const PROTECTED_POST_INIT = {
    requireAuth: true,
    injectAuthenticatedUserId: true,
    headers: { "Content-Type": "application/json" },
} as const;

export function createDesktopProtectedInteractionLayer(
    config: DesktopProtectedInteractionLayerConfig,
) {
    const { fetch: protectedFetch } = config;

    return {
        postSongLike(payload: DesktopSongLikePayload) {
            logInteractionDispatch("song-like", "/api/song-likes", payload);
            return protectedFetch("/api/song-likes", {
                ...PROTECTED_POST_INIT,
                method: "POST",
                body: JSON.stringify(payload),
            });
        },

        postArtistFollow(payload: DesktopArtistFollowPayload) {
            logInteractionDispatch("artist-follow", "/api/artist-follow", payload);
            return protectedFetch("/api/artist-follow", {
                ...PROTECTED_POST_INIT,
                method: "POST",
                body: JSON.stringify(payload),
            });
        },

        postLibrarySave(payload: DesktopLibrarySavePayload) {
            logInteractionDispatch("library-save", "/api/library/save", payload);
            return protectedFetch("/api/library/save", {
                ...PROTECTED_POST_INIT,
                method: "POST",
                body: JSON.stringify({
                    item_id: payload.itemId,
                    item_type: payload.itemType,
                }),
            });
        },

        postCreatePlaylist(payload: DesktopCreatePlaylistPayload) {
            logInteractionDispatch("create-playlist", "/api/playlists", payload);
            return protectedFetch("/api/playlists", {
                ...PROTECTED_POST_INIT,
                method: "POST",
                body: JSON.stringify(payload),
            });
        },
    };
}

export type DesktopProtectedInteractionLayer = ReturnType<typeof createDesktopProtectedInteractionLayer>;
