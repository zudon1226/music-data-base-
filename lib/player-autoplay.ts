export const PLAYER_AUTOPLAY_STORAGE_KEY = "music-data-base:player-autoplay";
export const PLAYER_PLAYBACK_USER_INITIATED_KEY = "music-data-base:playback-user-initiated";

export function readAutoplayEnabled(): boolean {
    if (typeof window === "undefined") {
        return false;
    }
    try {
        return window.localStorage.getItem(PLAYER_AUTOPLAY_STORAGE_KEY) === "1";
    }
    catch {
        return false;
    }
}

export function writeAutoplayEnabled(enabled: boolean): void {
    if (typeof window === "undefined") {
        return;
    }
    try {
        window.localStorage.setItem(PLAYER_AUTOPLAY_STORAGE_KEY, enabled ? "1" : "0");
    }
    catch {
        // ignore quota / private mode
    }
}

export function markUserInitiatedPlayback(): void {
    if (typeof window === "undefined") {
        return;
    }
    try {
        window.sessionStorage.setItem(PLAYER_PLAYBACK_USER_INITIATED_KEY, "1");
    }
    catch {
        // ignore
    }
}

export function hasUserInitiatedPlayback(): boolean {
    if (typeof window === "undefined") {
        return false;
    }
    try {
        return window.sessionStorage.getItem(PLAYER_PLAYBACK_USER_INITIATED_KEY) === "1";
    }
    catch {
        return false;
    }
}

export type AutoplayPickable = { id: string };

/** Pick the next autoplay song without immediately repeating the current track when alternatives exist. */
export function pickAutoplayNextSong<T extends AutoplayPickable>(
    catalog: T[],
    currentId: string | null | undefined,
    shuffleOn: boolean,
    pickRandom: (items: T[]) => T | null,
): T | null {
    if (catalog.length === 0) {
        return null;
    }
    if (shuffleOn) {
        const pool = currentId ? catalog.filter((entry) => entry.id !== currentId) : catalog;
        if (pool.length > 0) {
            return pickRandom(pool) || pool[0];
        }
        return catalog.length === 1 ? catalog[0] : null;
    }
    const currentIndex = currentId ? catalog.findIndex((entry) => entry.id === currentId) : -1;
    if (currentIndex >= 0 && currentIndex < catalog.length - 1) {
        return catalog[currentIndex + 1];
    }
    const withoutCurrent = currentId ? catalog.filter((entry) => entry.id !== currentId) : catalog;
    if (withoutCurrent.length > 0) {
        return withoutCurrent[0];
    }
    return catalog.length === 1 ? catalog[0] : null;
}
