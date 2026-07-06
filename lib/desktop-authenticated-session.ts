/** DESKTOP ONLY — global API credentials. Nothing runs until API READY is logged. */

import type { Session } from "@supabase/supabase-js";
import { readRefreshTokenFromSession } from "./client-api-auth";
import { readAccessTokenFromSession } from "./desktop-auth-recovery-gate";

export const DESKTOP_API_READY_EVENT = "mdb-desktop-api-ready";

/** @deprecated alias */
export const DESKTOP_AUTHENTICATED_SESSION_READY_EVENT = DESKTOP_API_READY_EVENT;

export const DESKTOP_AUTH_CREDENTIAL_MARKERS = {
    TOKEN_READY: "TOKEN READY",
    API_READY: "API READY",
} as const;

export const DESKTOP_TOKEN_READY_FAILED = {
    MISSING_ACCESS: "TOKEN READY FAILED: missing access token",
    MISSING_REFRESH: "TOKEN READY FAILED: missing refresh token",
    MISSING_USER_ID: "TOKEN READY FAILED: missing user id",
    EXPIRED: "TOKEN READY FAILED: expired session",
    UNKNOWN: "TOKEN READY FAILED: unknown error",
} as const;

export type DesktopAuthenticatedSessionSnapshot = {
    session: Session;
    accessToken: string;
    refreshToken: string;
    userId: string;
};

type DesktopApiCredentialState = {
    apiReady: boolean;
    session: Session | null;
    accessToken: string;
    refreshToken: string;
    userId: string;
};

const TOKEN_EXPIRY_SKEW_MS = 30_000;

const apiCredentialState: DesktopApiCredentialState = {
    apiReady: false,
    session: null,
    accessToken: "",
    refreshToken: "",
    userId: "",
};

function isSessionExpired(session: Session) {
    if (typeof session.expires_at === "number") {
        return session.expires_at * 1000 <= Date.now() + TOKEN_EXPIRY_SKEW_MS;
    }
    const accessToken = readAccessTokenFromSession(session);
    if (!accessToken) {
        return true;
    }
    try {
        const payload = accessToken.split(".")[1];
        if (!payload) {
            return true;
        }
        const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
        const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
        const json = JSON.parse(atob(padded)) as { exp?: number };
        if (typeof json.exp === "number") {
            return json.exp * 1000 <= Date.now() + TOKEN_EXPIRY_SKEW_MS;
        }
    }
    catch {
        return true;
    }
    return false;
}

function notifyApiReadyChanged() {
    if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent(DESKTOP_API_READY_EVENT));
    }
}

/**
 * Validate session fields, publish credentials, log TOKEN READY then API READY.
 * Returns false with an exact TOKEN READY FAILED log when blocked.
 */
export function publishDesktopApiCredentials(session: Session) {
    try {
        const rawAccessToken = typeof session.access_token === "string" ? session.access_token.trim() : "";
        if (!rawAccessToken) {
            console.warn(DESKTOP_TOKEN_READY_FAILED.MISSING_ACCESS);
            return false;
        }

        const rawRefreshToken = typeof session.refresh_token === "string" ? session.refresh_token.trim() : "";
        if (!rawRefreshToken || rawRefreshToken.startsWith("{") || rawRefreshToken.startsWith("[")) {
            console.warn(DESKTOP_TOKEN_READY_FAILED.MISSING_REFRESH);
            return false;
        }

        const userId = String(session.user?.id || "").trim();
        if (!userId) {
            console.warn(DESKTOP_TOKEN_READY_FAILED.MISSING_USER_ID);
            return false;
        }

        if (isSessionExpired(session)) {
            console.warn(DESKTOP_TOKEN_READY_FAILED.EXPIRED);
            return false;
        }

        const accessToken = readAccessTokenFromSession(session);
        if (!accessToken) {
            console.warn(DESKTOP_TOKEN_READY_FAILED.MISSING_ACCESS);
            return false;
        }

        const refreshToken = readRefreshTokenFromSession(session);
        if (!refreshToken) {
            console.warn(DESKTOP_TOKEN_READY_FAILED.MISSING_REFRESH);
            return false;
        }

        apiCredentialState.session = session;
        apiCredentialState.accessToken = accessToken;
        apiCredentialState.refreshToken = refreshToken;
        apiCredentialState.userId = userId;
        apiCredentialState.apiReady = false;

        console.info(DESKTOP_AUTH_CREDENTIAL_MARKERS.TOKEN_READY, { userId });

        apiCredentialState.apiReady = true;
        console.info(DESKTOP_AUTH_CREDENTIAL_MARKERS.API_READY, { userId });
        notifyApiReadyChanged();
        return true;
    }
    catch (error) {
        console.warn(DESKTOP_TOKEN_READY_FAILED.UNKNOWN, error);
        return false;
    }
}

/** @deprecated alias */
export function publishDesktopAuthenticatedSession(session: Session, _dualConfirmed = true) {
    return publishDesktopApiCredentials(session);
}

export function clearDesktopApiCredentials() {
    apiCredentialState.apiReady = false;
    apiCredentialState.session = null;
    apiCredentialState.accessToken = "";
    apiCredentialState.refreshToken = "";
    apiCredentialState.userId = "";
    notifyApiReadyChanged();
}

/** @deprecated alias */
export const clearDesktopAuthenticatedSession = clearDesktopApiCredentials;

export function isDesktopApiReady() {
    return apiCredentialState.apiReady
        && Boolean(apiCredentialState.accessToken)
        && Boolean(apiCredentialState.refreshToken)
        && Boolean(apiCredentialState.userId);
}

/** @deprecated alias */
export function isDesktopAuthenticatedSessionReady() {
    return isDesktopApiReady();
}

/** @deprecated */
export function isDesktopAuthenticatedSessionDualConfirmed() {
    return isDesktopApiReady();
}

export function getDesktopAuthenticatedSession(): Session | null {
    if (!isDesktopApiReady()) {
        return null;
    }
    return apiCredentialState.session;
}

export function getDesktopAuthenticatedSessionSnapshot(): DesktopAuthenticatedSessionSnapshot | null {
    if (!isDesktopApiReady() || !apiCredentialState.session) {
        return null;
    }
    return {
        session: apiCredentialState.session,
        accessToken: apiCredentialState.accessToken,
        refreshToken: apiCredentialState.refreshToken,
        userId: apiCredentialState.userId,
    };
}

export function getDesktopAuthenticatedAccessToken() {
    return isDesktopApiReady() ? apiCredentialState.accessToken : "";
}

export function getDesktopAuthenticatedRefreshToken() {
    return isDesktopApiReady() ? apiCredentialState.refreshToken : "";
}

export function getDesktopAuthenticatedUserId() {
    return isDesktopApiReady() ? apiCredentialState.userId : "";
}

export function requireDesktopAuthenticatedAccessToken(debugLabel = "protected-request") {
    const token = getDesktopAuthenticatedAccessToken();
    if (!token) {
        console.warn("API credentials not ready", { label: debugLabel });
        return "";
    }
    return token;
}

export function updateDesktopAuthenticatedSessionAccessToken(session: Session) {
    return publishDesktopApiCredentials(session);
}
