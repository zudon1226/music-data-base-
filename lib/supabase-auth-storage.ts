/**
 * Startup/logout storage cleanup only.
 * Does not read, parse, repair, or rewrite Supabase session tokens.
 * Supabase manages sb-* auth keys; this module removes legacy app auth keys.
 */

function isBrowser() {
    return typeof window !== "undefined";
}

export function isSupabaseAuthStorageKey(key: string) {
    return key.toLowerCase().startsWith("sb-");
}

function isLegacyAuthStorageKey(key: string) {
    if (isSupabaseAuthStorageKey(key)) {
        return false;
    }

    const normalized = key.toLowerCase();
    return normalized.includes("zmusic-auth")
        || normalized.includes("music-data-base-auth")
        || normalized.includes("mdbase-auth")
        || normalized.includes("access_token")
        || normalized.includes("accesstoken")
        || normalized.includes("refresh_token")
        || normalized.includes("authorization")
        || normalized.includes("bearer_token")
        || (normalized.includes("supabase") && (normalized.includes("auth") || normalized.includes("token")));
}

function removeMatchingKeys(storage: Storage, matcher: (key: string) => boolean) {
    const removed: string[] = [];
    for (let index = storage.length - 1; index >= 0; index -= 1) {
        const key = storage.key(index);
        if (!key || !matcher(key)) {
            continue;
        }
        storage.removeItem(key);
        removed.push(key);
    }
    return removed;
}

export function removeLegacyAuthStorageKeys() {
    if (!isBrowser()) {
        return [] as string[];
    }

    const removed = [
        ...removeMatchingKeys(window.localStorage, isLegacyAuthStorageKey),
        ...removeMatchingKeys(window.sessionStorage, isLegacyAuthStorageKey),
    ];

    if (removed.length > 0) {
        console.warn("LEGACY AUTH STORAGE REMOVED", { removedKeys: removed });
    }

    return removed;
}

export function clearSupabaseAuthStorage() {
    if (!isBrowser()) {
        return [] as string[];
    }

    const removed = [
        ...removeMatchingKeys(window.localStorage, isSupabaseAuthStorageKey),
        ...removeMatchingKeys(window.sessionStorage, isSupabaseAuthStorageKey),
    ];

    if (removed.length > 0) {
        console.warn("SUPABASE AUTH STORAGE CLEARED", { removedKeys: removed });
    }

    return removed;
}

export function cleanupAuthStorageOnStartup() {
    return removeLegacyAuthStorageKeys();
}
