import type { Session, SupabaseClient } from "@supabase/supabase-js";

export const SUPABASE_AUTH_STORAGE_KEY = "sb-aehuszoadgqtbkxsliyy-auth-token";

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

export async function getAuthSession(supabase: SupabaseClient) {
    const { data: { session }, error } = await supabase.auth.getSession();
    return { session, error: error ?? null };
}

export function readStoredAuthSession(): Session | null {
    if (typeof window === "undefined") {
        return null;
    }
    const raw = window.localStorage.getItem(SUPABASE_AUTH_STORAGE_KEY) || window.sessionStorage.getItem(SUPABASE_AUTH_STORAGE_KEY);
    if (!raw) {
        return null;
    }
    try {
        const parsed = JSON.parse(raw) as { currentSession?: Session } | Session;
        if ("currentSession" in parsed) {
            return parsed.currentSession ?? null;
        }
        return parsed as Session;
    }
    catch {
        return null;
    }
}

export async function logoutAndClearAuth(supabase: SupabaseClient) {
    clearSupabaseAuthStorage();
    await supabase.auth.signOut();
}
