import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { logAuthSessionStage } from "./auth-session-stage-log";

export const SUPABASE_AUTH_STORAGE_KEY = "sb-aehuszoadgqtbkxsliyy-auth-token";
export const MAX_ACCESS_TOKEN_LENGTH = 5000;

export type AccessTokenValidation = {
    valid: boolean;
    reason: string;
    tokenLength: number | null;
};

export function validateAccessToken(token: unknown): AccessTokenValidation {
    if (typeof token !== "string" || !token) {
        return { valid: false, reason: "not-string-or-empty", tokenLength: null };
    }
    if (!token.startsWith("eyJ")) {
        return { valid: false, reason: "not-jwt-prefix", tokenLength: token.length };
    }
    if (token.length > MAX_ACCESS_TOKEN_LENGTH) {
        return { valid: false, reason: "exceeds-max-length", tokenLength: token.length };
    }
    return { valid: true, reason: "", tokenLength: token.length };
}

export function clearSupabaseAuthStorage() {
    if (typeof window === "undefined") {
        return;
    }
    for (const storage of [window.localStorage, window.sessionStorage]) {
        for (let index = storage.length - 1; index >= 0; index -= 1) {
            const key = storage.key(index);
            if (key?.startsWith("sb-")) {
                storage.removeItem(key);
            }
        }
    }
}

let rejectingInvalidSession = false;

/** Clears all sb-* storage and signs out. Safe to call from multiple guards. */
export async function rejectInvalidAuthSession(supabase: SupabaseClient) {
    if (rejectingInvalidSession) {
        return;
    }
    rejectingInvalidSession = true;
    try {
        clearSupabaseAuthStorage();
        await supabase.auth.signOut();
    }
    finally {
        rejectingInvalidSession = false;
    }
}

export async function getValidatedSession(supabase: SupabaseClient) {
    const { data: { session }, error } = await supabase.auth.getSession();
    logAuthSessionStage("getSession", session);

    if (session?.access_token) {
        const validation = validateAccessToken(session.access_token);
        if (!validation.valid) {
            await rejectInvalidAuthSession(supabase);
            return {
                session: null as Session | null,
                error: null as Error | null,
                authInvalidated: true,
            };
        }
    }

    return {
        session,
        error: error ?? null,
        authInvalidated: false,
    };
}

export async function logoutAndClearAuth(supabase: SupabaseClient) {
    await rejectInvalidAuthSession(supabase);
}
