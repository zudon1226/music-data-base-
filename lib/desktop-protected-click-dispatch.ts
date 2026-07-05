/** DESKTOP ONLY — Like, Follow, Save, Create Playlist via shared protected request pipeline. */

import type { Session } from "@supabase/supabase-js";
import {
    DESKTOP_PROTECTED_API_LOGIN_REQUIRED_MESSAGE,
    executeDesktopProtectedRequest,
} from "./desktop-protected-action-pipeline";
import { getDesktopSupabaseClient } from "./supabase";

const DISPATCH_PREFIX = "[desktop-protected-click-dispatch]";

type ProtectedWritePath =
    | "/api/song-likes"
    | "/api/artist-follow"
    | "/api/library/save"
    | "/api/playlists";

let sessionPublisher: ((session: Session) => void) | null = null;

function logDispatch(step: string, details: Record<string, unknown> = {}) {
    console.log(DISPATCH_PREFIX, step, details);
}

async function dispatchProtectedWrite(path: ProtectedWritePath, body: Record<string, unknown>) {
    logDispatch("click", { path, bodyKeys: Object.keys(body) });

    const supabase = getDesktopSupabaseClient();
    const response = await executeDesktopProtectedRequest(supabase, path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        injectAuthenticatedUserId: true,
        writeAuthSession: sessionPublisher ?? undefined,
    });

    if (response.status === 401 || response.status === 494) {
        logDispatch("401-retry", { path, status: response.status });
        const retry = await executeDesktopProtectedRequest(supabase, path, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
            injectAuthenticatedUserId: true,
            writeAuthSession: sessionPublisher ?? undefined,
        });
        if (retry.status === 401 || retry.status === 494) {
            throw new Error(DESKTOP_PROTECTED_API_LOGIN_REQUIRED_MESSAGE);
        }
        return retry;
    }

    return response;
}

export function registerDesktopProductionSessionPublisher(publisher: (session: Session) => void) {
    sessionPublisher = publisher;
    logDispatch("session-publisher-registered");
}

export function unregisterDesktopProductionSessionPublisher() {
    sessionPublisher = null;
}

/** @deprecated alias */
export const registerDesktopProductionSessionBridge = registerDesktopProductionSessionPublisher;

export type DesktopProductionSongLikeRequest = {
    songId: string;
    like: boolean;
};

export type DesktopProductionArtistFollowRequest = {
    artistId: string;
    artistName: string;
    follow: boolean;
};

export type DesktopProductionLibrarySaveRequest = {
    itemId: string;
    itemType: "song" | "video" | "album";
};

export type DesktopProductionCreatePlaylistRequest = {
    id: string;
    name: string;
    cover: string;
    playlistType: "song" | "video" | "mixed";
};

export function dispatchDesktopSongLike(request: DesktopProductionSongLikeRequest) {
    return dispatchProtectedWrite("/api/song-likes", request);
}

export function dispatchDesktopArtistFollow(request: DesktopProductionArtistFollowRequest) {
    return dispatchProtectedWrite("/api/artist-follow", request);
}

export function dispatchDesktopLibrarySave(request: DesktopProductionLibrarySaveRequest) {
    return dispatchProtectedWrite("/api/library/save", {
        item_id: request.itemId,
        item_type: request.itemType,
    });
}

export function dispatchDesktopCreatePlaylist(request: DesktopProductionCreatePlaylistRequest) {
    return dispatchProtectedWrite("/api/playlists", request);
}

/** @deprecated — no stale storage hints; pipeline uses live getSession. */
export function readDesktopProductionStoredSessionHint() {
    return null;
}
