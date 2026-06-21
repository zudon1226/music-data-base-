import {
    MAX_ACCESS_TOKEN_LENGTH,
    SUPABASE_AUTH_STORAGE_KEY,
    validateAccessToken,
} from "./auth-session-guard";

export { SUPABASE_AUTH_STORAGE_KEY };

function parseAuthStorageAccessToken(value: string) {
    if (!value || value === "null") {
        return null;
    }
    try {
        const parsed = JSON.parse(value) as {
            access_token?: unknown;
            currentSession?: { access_token?: unknown };
            session?: { access_token?: unknown };
        };
        const token = parsed.access_token
            ?? parsed.currentSession?.access_token
            ?? parsed.session?.access_token;
        return typeof token === "string" ? token : null;
    }
    catch {
        return null;
    }
}

function isSupabaseAuthStorageKey(key: string) {
    return key.startsWith("sb-") || key.includes("-auth-token");
}

function isValidAuthStorageValue(value: string) {
    const accessToken = parseAuthStorageAccessToken(value);
    if (accessToken === null) {
        return true;
    }
    return validateAccessToken(accessToken).valid;
}

/**
 * Supabase auth.storage adapter.
 * Invalid sessions never leave storage: getItem returns null so GoTrueClient
 * _recoverAndRefresh (auth-js GoTrueClient.js:3815) cannot hydrate a bad token.
 */
export function createSupabaseAuthStorage() {
    const backing = window.localStorage;
    return {
        getItem: (key: string) => {
            const value = backing.getItem(key);
            if (!value || !isSupabaseAuthStorageKey(key)) {
                return value;
            }
            if (!isValidAuthStorageValue(value)) {
                backing.removeItem(key);
                return null;
            }
            return value;
        },
        setItem: (key: string, value: string) => {
            if (isSupabaseAuthStorageKey(key) && !isValidAuthStorageValue(value)) {
                return;
            }
            backing.setItem(key, value);
        },
        removeItem: (key: string) => {
            backing.removeItem(key);
        },
    };
}
