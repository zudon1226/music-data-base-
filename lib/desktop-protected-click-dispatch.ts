/** DESKTOP ONLY — guaranteed POST dispatch for Like, Follow, Save, Create Playlist. */

import type { Session } from "@supabase/supabase-js";
import { readStoredAuthSession } from "./auth-session";
import { clearDesktopAuthRecoveryGate } from "./desktop-auth-recovery-gate";
import { isOversizedBearerToken } from "./session-token-limits";
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

function readBrowserSupabaseAnonKey() {
    return (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim().replace(/^["']|["']$/g, "").replace(/\s+/g, "");
}

function readBearerFromSession(session: Session | null | undefined) {
    const raw = typeof session?.access_token === "string" ? session.access_token.trim() : "";
    if (!raw || !raw.startsWith("eyJ") || raw.split(".").length !== 3) {
        return "";
    }
    if (isOversizedBearerToken(raw)) {
        return "";
    }
    return raw;
}

function readUserIdFromAccessToken(accessToken: string) {
    try {
        const payload = accessToken.split(".")[1];
        if (!payload) {
            return "";
        }
        const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
        const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
        const json = JSON.parse(atob(padded)) as { sub?: string };
        return String(json.sub || "").trim();
    }
    catch {
        return "";
    }
}

function publishSession(session: Session | null | undefined) {
    if (!session) {
        return;
    }
    clearDesktopAuthRecoveryGate(session);
    sessionPublisher?.(session);
}

async function refreshSupabaseWriteSession() {
    const supabase = getDesktopSupabaseClient();
    const stored = readStoredAuthSession();
    const refreshToken = typeof stored?.refresh_token === "string" ? stored.refresh_token.trim() : "";

    if (refreshToken) {
        logDispatch("refresh-with-stored-token", { hasRefreshToken: true });
        const setResult = await supabase.auth.setSession({
            access_token: typeof stored?.access_token === "string" ? stored.access_token : "",
            refresh_token: refreshToken,
        });
        if (setResult.data.session) {
            publishSession(setResult.data.session);
            return setResult.data.session;
        }

        const refreshed = await supabase.auth.refreshSession({ refresh_token: refreshToken });
        if (refreshed.data.session) {
            publishSession(refreshed.data.session);
            return refreshed.data.session;
        }
    }

    logDispatch("refresh-with-client-session", {});
    const refreshed = await supabase.auth.refreshSession();
    if (refreshed.data.session) {
        publishSession(refreshed.data.session);
        return refreshed.data.session;
    }

    return null;
}

async function acquireProtectedWriteCredentials() {
    const supabase = getDesktopSupabaseClient();
    let session = (await supabase.auth.getSession()).data.session ?? null;
    let accessToken = readBearerFromSession(session);

    logDispatch("acquire-credentials", {
        sessionExists: Boolean(session),
        accessTokenPresent: Boolean(accessToken),
    });

    if (!accessToken) {
        session = await refreshSupabaseWriteSession();
        accessToken = readBearerFromSession(session);
    }

    const userId = readUserIdFromAccessToken(accessToken)
        || String(session?.user?.id || "").trim();

    logDispatch("credentials-ready", {
        sessionExists: Boolean(session),
        accessTokenPresent: Boolean(accessToken),
        userId,
    });

    return { session, accessToken, userId };
}

function buildProtectedWriteHeaders(accessToken: string) {
    const headers = new Headers();
    headers.set("Content-Type", "application/json");
    if (accessToken) {
        headers.set("Authorization", `Bearer ${accessToken}`);
    }
    const anonKey = readBrowserSupabaseAnonKey();
    if (anonKey) {
        headers.set("apikey", anonKey);
    }
    return headers;
}

async function sendProtectedWriteRequest(
    path: ProtectedWritePath,
    body: Record<string, unknown>,
    accessToken: string,
) {
    const headers = buildProtectedWriteHeaders(accessToken);
    logDispatch("POST", {
        path,
        sessionExists: true,
        accessTokenPresent: Boolean(accessToken),
        authorizationAdded: headers.has("Authorization"),
        apikeyAdded: headers.has("apikey"),
    });

    return fetch(path, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        credentials: "same-origin",
        redirect: "error",
        cache: "no-store",
    });
}

async function dispatchProtectedWrite(path: ProtectedWritePath, body: Record<string, unknown>) {
    logDispatch("click", { path, bodyKeys: Object.keys(body) });

    let { accessToken, userId } = await acquireProtectedWriteCredentials();
    const payload = {
        ...body,
        ...(userId ? { userId, user_id: userId } : {}),
    };

    let response = await sendProtectedWriteRequest(path, payload, accessToken);

    if (response.status === 401 || response.status === 494) {
        logDispatch("401-retry", { path, status: response.status });
        const refreshedSession = await refreshSupabaseWriteSession();
        accessToken = readBearerFromSession(refreshedSession);
        const retryUserId = readUserIdFromAccessToken(accessToken)
            || String(refreshedSession?.user?.id || "").trim();
        if (retryUserId) {
            payload.userId = retryUserId;
            payload.user_id = retryUserId;
        }
        response = await sendProtectedWriteRequest(path, payload, accessToken);
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

export function readDesktopProductionStoredSessionHint() {
    return readStoredAuthSession();
}
