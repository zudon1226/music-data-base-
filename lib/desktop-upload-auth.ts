/** DESKTOP ONLY — bearer-only upload session helpers for /api/video-upload and /api/upload-audio. */

import type { Session, SupabaseClient, User } from "@supabase/supabase-js";
import {
    clearDesktopAuthRecoveryGate,
    noteValidatedDesktopSession,
    readAccessTokenFromSession,
} from "./desktop-auth-recovery-gate";
import { readRefreshTokenFromSession } from "./client-api-auth";
import { getDesktopSupabaseClient } from "./supabase";
import { isOversizedBearerToken } from "./session-token-limits";

const UPLOAD_ACCESS_TOKEN_SKEW_MS = 60_000;

let uploadSessionRefreshPromise: Promise<Session | null> | null = null;

export type DesktopUploadSession = {
    user: User;
    accessToken: string;
    session: Session;
};

export type DesktopUploadSessionOptions = {
    forceRefresh?: boolean;
    onSession?: (session: Session) => void;
};

export type DesktopUploadFetchInit = {
    method?: string;
    headers?: HeadersInit;
    body: BodyInit;
};

function readBrowserSupabaseAnonKey() {
    return (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "")
        .trim()
        .replace(/^["']|["']$/g, "")
        .replace(/\s+/g, "");
}

function isAccessTokenExpired(session: Session | null | undefined) {
    const expiresAt = session?.expires_at;
    if (!expiresAt) {
        return false;
    }
    return expiresAt * 1000 <= Date.now() + 15_000;
}

function isUploadAccessTokenExpiringSoon(session: Session | null | undefined) {
    const expiresAt = session?.expires_at;
    if (!expiresAt) {
        return false;
    }
    return expiresAt * 1000 - Date.now() < UPLOAD_ACCESS_TOKEN_SKEW_MS;
}

function sessionNeedsRefresh(session: Session | null | undefined, forceRefresh: boolean) {
    const accessToken = readAccessTokenFromSession(session);
    return forceRefresh
        || !accessToken
        || isOversizedBearerToken(accessToken)
        || isAccessTokenExpired(session)
        || isUploadAccessTokenExpiringSoon(session);
}

async function refreshDesktopUploadSession(supabase: SupabaseClient) {
    if (!uploadSessionRefreshPromise) {
        uploadSessionRefreshPromise = supabase.auth
            .refreshSession()
            .then(({ data, error }) => {
                if (error) {
                    throw new Error(error.message);
                }
                return data.session ?? null;
            })
            .finally(() => {
                uploadSessionRefreshPromise = null;
            });
    }
    return uploadSessionRefreshPromise;
}

function publishDesktopUploadSession(session: Session, onSession?: (session: Session) => void) {
    noteValidatedDesktopSession(session);
    clearDesktopAuthRecoveryGate(session);
    onSession?.(session);
}

export async function resolveDesktopUploadSession(
    supabase: SupabaseClient,
    options: DesktopUploadSessionOptions = {},
): Promise<DesktopUploadSession> {
    const client = supabase ?? getDesktopSupabaseClient();
    const { data: { session: storedSession }, error: sessionError } = await client.auth.getSession();
    if (sessionError) {
        throw new Error(`Supabase auth check failed before upload: ${sessionError.message}`);
    }

    let session = storedSession;
    if (sessionNeedsRefresh(session, Boolean(options.forceRefresh))) {
        if (!readRefreshTokenFromSession(session)) {
            throw new Error("Upload access token expired before metadata save. Retrying will refresh your session automatically.");
        }
        session = await refreshDesktopUploadSession(client);
        if (!session?.user?.id) {
            throw new Error("Could not refresh your upload session before metadata save. Please retry in a few seconds.");
        }
    }

    if (!session?.user?.id) {
        throw new Error("You must log in before uploading.");
    }

    const accessToken = readAccessTokenFromSession(session);
    if (!accessToken || isOversizedBearerToken(accessToken)) {
        throw new Error("Upload access token is unavailable. Retrying will refresh your session automatically.");
    }

    publishDesktopUploadSession(session, options.onSession);

    return {
        user: session.user,
        accessToken,
        session,
    };
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

function buildUploadAuthHeaders(init: DesktopUploadFetchInit, accessToken: string) {
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
    headers.set("Authorization", `Bearer ${accessToken}`);
    const anonKey = readBrowserSupabaseAnonKey();
    if (anonKey) {
        headers.set("apikey", anonKey);
    }
    return headers;
}

export async function desktopUploadFetch(
    supabase: SupabaseClient,
    path: string,
    init: DesktopUploadFetchInit,
    options: DesktopUploadSessionOptions = {},
): Promise<Response> {
    const client = supabase ?? getDesktopSupabaseClient();

    const send = async (forceRefresh: boolean) => {
        const { accessToken } = await resolveDesktopUploadSession(client, {
            ...options,
            forceRefresh,
        });
        return fetch(path, {
            method: init.method || "POST",
            headers: buildUploadAuthHeaders(init, accessToken),
            body: stripRefreshTokensFromBody(init.body),
            credentials: "omit",
            cache: "no-store",
        });
    };

    let response = await send(Boolean(options.forceRefresh));
    if (response.status === 401) {
        response = await send(true);
    }
    if (response.status === 401) {
        response = await send(true);
    }
    return response;
}
