/** DESKTOP ONLY — pinned-session video upload (prepare → storage → insert, no mid-upload auth). */

import type { Session, SupabaseClient } from "@supabase/supabase-js";
import {
    clearDesktopAuthRecoveryGate,
    noteValidatedDesktopSession,
    readAccessTokenFromSession,
    SESSION_EXPIRED_MESSAGE,
} from "./desktop-auth-recovery-gate";
import {
    enterDesktopVideoUploadLifecycle,
    exitDesktopVideoUploadLifecycle,
} from "./desktop-video-upload-lifecycle";
import {
    runDesktopVideoUploadWithAbortSignal,
    throwIfDesktopVideoUploadAborted,
} from "./desktop-video-upload-progress";
import { isOversizedBearerToken } from "./session-token-limits";

export type DesktopVideoUploadTransaction = {
    supabase: SupabaseClient;
    session: Session;
    accessToken: string;
    userId: string;
};

export type BeginDesktopVideoUploadTransactionOptions = {
    /** React auth state session — preferred, avoids getSession() when usable. */
    pinnedSession?: Session | null;
    /** Abort when upload stalls or user cancels. */
    signal?: AbortSignal;
};

export type DesktopVideoUploadTransactionFetchInit = {
    method?: string;
    headers?: HeadersInit;
    body: BodyInit;
    signal?: AbortSignal;
};

const PRE_UPLOAD_ACCESS_TOKEN_SKEW_MS = 30_000;

function readBrowserSupabaseAnonKey() {
    return (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "")
        .trim()
        .replace(/^["']|["']$/g, "")
        .replace(/\s+/g, "");
}

function readPinnedUploadAccessToken(session: Session) {
    const gated = readAccessTokenFromSession(session);
    if (gated) {
        return gated;
    }
    const raw = typeof session.access_token === "string" ? session.access_token.trim() : "";
    if (!raw || isOversizedBearerToken(raw)) {
        return "";
    }
    if (!raw.startsWith("eyJ") || raw.split(".").length !== 3) {
        return "";
    }
    return raw;
}

function isAccessTokenExpiredBeforeUpload(session: Session) {
    const expiresAt = session.expires_at;
    if (!expiresAt) {
        return false;
    }
    return expiresAt * 1000 <= Date.now() + PRE_UPLOAD_ACCESS_TOKEN_SKEW_MS;
}

function sessionNeedsPreUploadRefresh(session: Session) {
    const accessToken = readPinnedUploadAccessToken(session);
    return !accessToken || isAccessTokenExpiredBeforeUpload(session);
}

function stripRefreshTokensFromBody(body: BodyInit) {
    if (typeof body === "string") {
        try {
            const parsed = JSON.parse(body) as Record<string, unknown>;
            delete parsed.accessToken;
            delete parsed.refreshToken;
            delete parsed.sessionRefreshToken;
            delete parsed.refresh_token;
            delete parsed.access_token;
            return JSON.stringify(parsed);
        }
        catch {
            return body;
        }
    }
    if (body instanceof FormData) {
        for (const key of [
            "accessToken",
            "refreshToken",
            "sessionRefreshToken",
            "refresh_token",
            "access_token",
        ]) {
            body.delete(key);
        }
    }
    return body;
}

function buildTransactionAuthHeaders(init: DesktopVideoUploadTransactionFetchInit, accessToken: string) {
    const headers = new Headers(init.headers);
    for (const headerName of [
        "authorization",
        "Authorization",
        "x-supabase-refresh-token",
        "x-refresh-token",
        "apikey",
    ]) {
        headers.delete(headerName);
    }
    if (!accessToken) {
        throw new Error("Upload authorization token is missing.");
    }
    headers.set("Authorization", `Bearer ${accessToken}`);
    const anonKey = readBrowserSupabaseAnonKey();
    if (anonKey) {
        headers.set("apikey", anonKey);
    }
    return headers;
}

async function resolveSessionBeforeUpload(
    supabase: SupabaseClient,
    pinnedSession?: Session | null,
    signal?: AbortSignal,
) {
    throwIfDesktopVideoUploadAborted(signal);
    let session = pinnedSession ?? null;

    if (!session?.user?.id || sessionNeedsPreUploadRefresh(session)) {
        const { data: { session: storedSession }, error } = await runDesktopVideoUploadWithAbortSignal(
            supabase.auth.getSession(),
            signal,
        );
        if (error) {
            throw new Error(`Supabase auth check failed before upload: ${error.message}`);
        }
        if (storedSession && (!session || sessionNeedsPreUploadRefresh(session))) {
            session = storedSession;
        }
    }

    throwIfDesktopVideoUploadAborted(signal);

    if (!session) {
        throw new Error(SESSION_EXPIRED_MESSAGE);
    }

    if (sessionNeedsPreUploadRefresh(session)) {
        const { data, error } = await runDesktopVideoUploadWithAbortSignal(
            supabase.auth.refreshSession(),
            signal,
        );
        if (error || !data.session) {
            throw new Error(error?.message || "Could not refresh upload session before starting.");
        }
        session = data.session;
    }

    return session;
}

/**
 * Capture auth once, optionally refresh once before upload, then freeze auth for the upload window.
 * No getSession/refreshSession/setSession after the lifecycle begins.
 */
export async function beginDesktopVideoUploadTransaction(
    supabase: SupabaseClient,
    options: BeginDesktopVideoUploadTransactionOptions = {},
): Promise<DesktopVideoUploadTransaction> {
    const session = await resolveSessionBeforeUpload(supabase, options.pinnedSession, options.signal);

    const userId = String(session.user?.id || "").trim();
    if (!userId) {
        throw new Error("You must be signed in before uploading.");
    }

    const accessToken = readPinnedUploadAccessToken(session);
    if (!accessToken) {
        throw new Error("Upload authentication token is unavailable.");
    }

    noteValidatedDesktopSession(session);
    clearDesktopAuthRecoveryGate(session);
    enterDesktopVideoUploadLifecycle(supabase, session);

    return {
        supabase,
        session,
        accessToken,
        userId,
    };
}

export function endDesktopVideoUploadTransaction() {
    exitDesktopVideoUploadLifecycle();
}

/** API fetch for an in-flight upload — pinned bearer token only, never refresh. */
export async function fetchWithDesktopVideoUploadTransaction(
    transaction: DesktopVideoUploadTransaction,
    path: string,
    init: DesktopVideoUploadTransactionFetchInit,
): Promise<Response> {
    return fetch(path, {
        method: init.method || "POST",
        headers: buildTransactionAuthHeaders(init, transaction.accessToken),
        body: stripRefreshTokensFromBody(init.body),
        credentials: "omit",
        cache: "no-store",
        signal: init.signal,
    });
}

export function publishDesktopVideoUploadSession(session: Session) {
    noteValidatedDesktopSession(session);
    clearDesktopAuthRecoveryGate(session);
}
