const AUTH_CLEANUP_FLAG = "mdb_auth_cleanup_done";

function isLegacyAuthStorageKey(key: string) {
    const normalized = key.toLowerCase();
    if (normalized.startsWith("sb-")) {
        return false;
    }
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

export function runAuthStorageCleanupOnce() {
    if (typeof window === "undefined") {
        return;
    }
    if (sessionStorage.getItem(AUTH_CLEANUP_FLAG) === "true") {
        return;
    }

    for (const storage of [window.localStorage, window.sessionStorage]) {
        for (let index = storage.length - 1; index >= 0; index -= 1) {
            const key = storage.key(index);
            if (!key || !isLegacyAuthStorageKey(key)) {
                continue;
            }
            storage.removeItem(key);
        }
    }

    sessionStorage.setItem(AUTH_CLEANUP_FLAG, "true");
}
