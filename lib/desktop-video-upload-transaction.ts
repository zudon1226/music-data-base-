/** DESKTOP ONLY — pinned-session video upload (prepare → storage → insert, no mid-upload auth). */

import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { readRefreshTokenFromSession } from "./client-api-auth";
import {
    clearDesktopAuthRecoveryGate,
    isCorruptedDesktopAccessToken,
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
const UPLOAD_REAUTH_MESSAGE = "Please log out and log back in, then try your upload again.";

function readBrowserSupabaseAnonKey() {
    return (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "")
        .trim()
        .replace(/^["']|["']$/g, "")
        .replace(/\s+/g, "");
}

function readRawAccessToken(session: Session | null | undefined) {
    return typeof session?.access_token === "string" ? session.access_token.trim() : "";
}

/** Same bearer gate as protected desktop API calls. */
function readUploadBearerToken(session: Session | null | undefined) {
    return readAccessTokenFromSession(session);
}

function isAccessTokenExpiredBeforeUpload(session: Session) {
    const expiresAt = session.expires_at;
    if (!expiresAt) {
        return false;
    }
    return expiresAt * 1000 <= Date.now() + PRE_UPLOAD_ACCESS_TOKEN_SKEW_MS;
}

function sessionNeedsPreUploadRefresh(session: Session) {
    const raw = readRawAccessToken(session);
    const accessToken = readUploadBearerToken(session);
    return !accessToken
        || isAccessTokenExpiredBeforeUpload(session)
        || isOversizedBearerToken(raw)
        || isCorruptedDesktopAccessToken(raw);
}

function scoreUploadSession(session: Session | null | undefined) {
    if (!session) {
        return -1;
    }
    let score = 0;
    if (session.user?.id) {
        score += 4;
    }
    if (readUploadBearerToken(session)) {
        score += 8;
    }
    if (readRefreshTokenFromSession(session)) {
        score += 4;
    }
    if (!isAccessTokenExpiredBeforeUpload(session)) {
        score += 2;
    }
    score += (session.expires_at ?? 0) / 1_000_000_000;
    return score;
}

function pickBestUploadSession(stored: Session | null, pinned: Session | null) {
    if (!stored) {
        return pinned;
    }
    if (!pinned) {
        return stored;
    }
    return scoreUploadSession(pinned) >= scoreUploadSession(stored) ? pinned : stored;
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
        throw new Error(UPLOAD_REAUTH_MESSAGE);
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

    const { data: { session: storedSession }, error: storedError } = await runDesktopVideoUploadWithAbortSignal(
        supabase.auth.getSession(),
        signal,
    );
    if (storedError) {
        throw new Error(`Supabase auth check failed before upload: ${storedError.message}`);
    }

    let session = pickBestUploadSession(storedSession, pinnedSession ?? null);
    throwIfDesktopVideoUploadAborted(signal);

    if (!session?.user?.id && !readRefreshTokenFromSession(session)) {
        throw new Error(SESSION_EXPIRED_MESSAGE);
    }

    if (session && sessionNeedsPreUploadRefresh(session)) {
        const refreshToken = readRefreshTokenFromSession(session)
            || readRefreshTokenFromSession(storedSession)
            || readRefreshTokenFromSession(pinnedSession);
        if (!refreshToken) {
            throw new Error(UPLOAD_REAUTH_MESSAGE);
        }
        const { data, error } = await runDesktopVideoUploadWithAbortSignal(
            supabase.auth.refreshSession(),
            signal,
        );
        if (error || !data.session) {
            throw new Error(error?.message || UPLOAD_REAUTH_MESSAGE);
        }
        session = pickBestUploadSession(data.session, session);
    }

    if (!session) {
        throw new Error(SESSION_EXPIRED_MESSAGE);
    }

    const userId = String(session.user?.id || "").trim();
    if (!userId) {
        throw new Error(UPLOAD_REAUTH_MESSAGE);
    }

    const accessToken = readUploadBearerToken(session);
    if (!accessToken) {
        throw new Error(UPLOAD_REAUTH_MESSAGE);
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
    const accessToken = readUploadBearerToken(session);
    if (!userId || !accessToken) {
        throw new Error(UPLOAD_REAUTH_MESSAGE);
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

export { UPLOAD_REAUTH_MESSAGE };
