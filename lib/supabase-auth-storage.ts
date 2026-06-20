import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { diagnoseAccessToken, normalizeAccessToken } from "./client-api-auth";

const MAX_ACCESS_TOKEN_LENGTH = 8192;
const AUTH_CLEANUP_VERSION = "2026-06-auth-v1";
const AUTH_CLEANUP_FLAG_KEY = "zmusic-auth-storage-cleanup-version";

export type AuthStorageCleanupResult = {
    removedKeys: string[];
    repairedKeys: string[];
    scannedKeys: number;
};

function isBrowser() {
    return typeof window !== "undefined";
}

export function isSupabaseAuthStorageKey(key: string) {
    const normalized = key.toLowerCase();
    return normalized.startsWith("sb-")
        || (normalized.includes("supabase") && (normalized.includes("auth") || normalized.includes("token")));
}

function isMalformedAuthLikeKey(key: string) {
    const normalized = key.toLowerCase();
    if (isSupabaseAuthStorageKey(key)) {
        return true;
    }
    return normalized.includes("access_token")
        || normalized.includes("accesstoken")
        || normalized.includes("refresh_token")
        || normalized.includes("authorization")
        || normalized.includes("bearer_token");
}

function unwrapStoredSession(parsed: unknown) {
    if (!parsed || typeof parsed !== "object") {
        return null;
    }
    const record = parsed as Record<string, unknown>;
    if (record.currentSession && typeof record.currentSession === "object") {
        return record.currentSession as Record<string, unknown>;
    }
    if (Array.isArray(parsed) && parsed[0] && typeof parsed[0] === "object") {
        return parsed[0] as Record<string, unknown>;
    }
    if (typeof record.access_token === "string" || typeof record.accessToken === "string") {
        return record;
    }
    return null;
}

function rewriteStoredSession(parsed: unknown, session: Record<string, unknown>) {
    if (!parsed || typeof parsed !== "object") {
        return JSON.stringify(session);
    }
    if (Array.isArray(parsed)) {
        const next = [...parsed];
        next[0] = session;
        return JSON.stringify(next);
    }
    const record = parsed as Record<string, unknown>;
    if (record.currentSession && typeof record.currentSession === "object") {
        return JSON.stringify({
            ...record,
            currentSession: session,
        });
    }
    return JSON.stringify(session);
}

function parseStoredAuthValue(raw: string) {
    try {
        return JSON.parse(raw) as unknown;
    }
    catch {
        return null;
    }
}

function accessTokenLooksCorrupted(accessToken: string) {
    const diagnosis = diagnoseAccessToken(accessToken);
    return diagnosis.rejected
        || diagnosis.accessTokenLength > MAX_ACCESS_TOKEN_LENGTH
        || diagnosis.jwtCount > 1
        || diagnosis.bearerCount > 0
        || diagnosis.looksLikeJson
        || diagnosis.extractionMethod.startsWith("json")
        || diagnosis.extractionMethod.includes("first-jwt");
}

export function sanitizeStoredAuthValue(raw: string) {
    const parsed = parseStoredAuthValue(raw);
    if (!parsed) {
        if (raw.length > MAX_ACCESS_TOKEN_LENGTH * 4) {
            return { action: "remove" as const };
        }
        const normalized = normalizeAccessToken(raw);
        if (!normalized) {
            return { action: "remove" as const };
        }
        return {
            action: "repair" as const,
            value: JSON.stringify({
                access_token: normalized,
                token_type: "bearer",
            }),
        };
    }

    const session = unwrapStoredSession(parsed);
    if (!session) {
        return { action: "remove" as const };
    }

    const accessRaw = String(session.access_token || session.accessToken || "");
    if (!accessRaw) {
        return { action: "remove" as const };
    }

    if (!accessTokenLooksCorrupted(accessRaw)) {
        return { action: "keep" as const };
    }

    const normalized = normalizeAccessToken(accessRaw);
    if (!normalized) {
        return { action: "remove" as const };
    }

    if (normalized === accessRaw) {
        return { action: "keep" as const };
    }

    const { accessToken: _removedAlias, ...sessionWithoutAlias } = session;
    const nextSession = {
        ...sessionWithoutAlias,
        access_token: normalized,
    };

    return {
        action: "repair" as const,
        value: rewriteStoredSession(parsed, nextSession),
    };
}

function scanBrowserStorage(storage: Storage, result: AuthStorageCleanupResult) {
    for (let index = storage.length - 1; index >= 0; index -= 1) {
        const key = storage.key(index);
        if (!key) {
            continue;
        }
        result.scannedKeys += 1;

        const value = storage.getItem(key);
        if (!value) {
            continue;
        }

        const shouldInspect = isSupabaseAuthStorageKey(key)
            || (isMalformedAuthLikeKey(key) && value.length > MAX_ACCESS_TOKEN_LENGTH);

        if (!shouldInspect) {
            continue;
        }

        const outcome = sanitizeStoredAuthValue(value);
        if (outcome.action === "remove") {
            storage.removeItem(key);
            result.removedKeys.push(key);
            continue;
        }
        if (outcome.action === "repair" && outcome.value) {
            storage.setItem(key, outcome.value);
            result.repairedKeys.push(key);
        }
    }
}

export function clearSupabaseAuthStorage() {
    if (!isBrowser()) {
        return;
    }
    for (const storage of [window.localStorage, window.sessionStorage]) {
        for (let index = storage.length - 1; index >= 0; index -= 1) {
            const key = storage.key(index);
            if (!key) {
                continue;
            }
            if (isSupabaseAuthStorageKey(key) || isMalformedAuthLikeKey(key)) {
                storage.removeItem(key);
            }
        }
    }
}

export function cleanupSupabaseAuthStorageOnLoad(force = false): AuthStorageCleanupResult {
    const result: AuthStorageCleanupResult = {
        removedKeys: [],
        repairedKeys: [],
        scannedKeys: 0,
    };

    if (!isBrowser()) {
        return result;
    }

    const lastVersion = window.localStorage.getItem(AUTH_CLEANUP_FLAG_KEY) || "";
    const shouldRunDeepCleanup = force || lastVersion !== AUTH_CLEANUP_VERSION;

    scanBrowserStorage(window.localStorage, result);
    scanBrowserStorage(window.sessionStorage, result);

    if (shouldRunDeepCleanup) {
        for (const storage of [window.localStorage, window.sessionStorage]) {
            for (let index = storage.length - 1; index >= 0; index -= 1) {
                const key = storage.key(index);
                if (!key) {
                    continue;
                }
                const value = storage.getItem(key) || "";
                if (!value || value.length <= MAX_ACCESS_TOKEN_LENGTH) {
                    continue;
                }
                if (!value.includes("access_token") && !value.includes("accessToken") && !value.includes("eyJ")) {
                    continue;
                }
                const outcome = sanitizeStoredAuthValue(value);
                if (outcome.action === "remove") {
                    storage.removeItem(key);
                    if (!result.removedKeys.includes(key)) {
                        result.removedKeys.push(key);
                    }
                }
                else if (outcome.action === "repair" && outcome.value) {
                    storage.setItem(key, outcome.value);
                    if (!result.repairedKeys.includes(key)) {
                        result.repairedKeys.push(key);
                    }
                }
            }
        }
        window.localStorage.setItem(AUTH_CLEANUP_FLAG_KEY, AUTH_CLEANUP_VERSION);
    }

    if (result.removedKeys.length > 0 || result.repairedKeys.length > 0) {
        console.warn("SUPABASE AUTH STORAGE CLEANUP", result);
    }

    return result;
}

export async function applySanitizedSupabaseSession(supabase: SupabaseClient, session: Session | null) {
    if (!session?.access_token || !session.refresh_token) {
        return null;
    }

    const accessToken = normalizeAccessToken(session.access_token);
    if (!accessToken) {
        console.error("SUPABASE AUTH: refusing to persist malformed session access token.", diagnoseAccessToken(session.access_token));
        clearSupabaseAuthStorage();
        await supabase.auth.signOut();
        return null;
    }

    if (accessToken === session.access_token) {
        return session;
    }

    const { data, error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: session.refresh_token,
    });

    if (error || !data.session) {
        console.error("SUPABASE AUTH: failed to rewrite sanitized session.", error?.message || "setSession returned no session.");
        clearSupabaseAuthStorage();
        await supabase.auth.signOut();
        return null;
    }

    console.warn("SUPABASE AUTH: rewrote stored session with a single clean access_token.", {
        previousLength: session.access_token.length,
        normalizedLength: accessToken.length,
    });

    return data.session;
}

export async function ensureCleanSupabaseSession(supabase: SupabaseClient) {
    cleanupSupabaseAuthStorageOnLoad();

    const { data: { session }, error } = await supabase.auth.getSession();
    if (error || !session) {
        return { session: null as Session | null, accessToken: "", userId: "", error: error || null };
    }

    const sanitized = await applySanitizedSupabaseSession(supabase, session);
    if (!sanitized?.access_token) {
        return {
            session: null,
            accessToken: "",
            userId: "",
            error: new Error("Login session was corrupted. Log in again."),
        };
    }

    return {
        session: sanitized,
        accessToken: sanitized.access_token,
        userId: sanitized.user?.id || "",
        error: null as Error | null,
    };
}
