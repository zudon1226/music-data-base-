/**
 * Client access/session schema migration.
 * Bump CLIENT_ACCESS_SCHEMA_VERSION whenever role/nav/workspace cache semantics change
 * so signed-in Listeners pick up corrected chrome without recreating accounts.
 */

export const CLIENT_ACCESS_SCHEMA_VERSION = 3;
export const CLIENT_ACCESS_SCHEMA_KEY = "mdb.access.schemaVersion";

/** Obsolete role / workspace / founding cache keys that must never drive chrome. */
export const OBSOLETE_ACCESS_STORAGE_KEYS = [
    "zml_account_role",
    "zml_accountRole",
    "zml_founding_role",
    "zml_foundingRole",
    "zml_nav_role",
    "zml_navCapabilities",
    "zml_workspace",
    "zml_active_view",
    "zml_activeView",
    "zml_show_upload",
    "zml_showUpload",
    "zml_creator_studio",
    "zml_creatorStudio",
    "zml_upload_mode",
    "zml_uploadMode",
    "mdb.accountRole",
    "mdb.foundingRole",
    "mdb.navCapabilities",
    "mdb.workspace",
    "mdb.activeView",
    "mdb.showUpload",
    "mdb.creatorStudio",
    "mdb.uploadMode",
    "mdb.rolesReady",
    "founding_role",
    "foundingRole",
    "account_role",
    "accountRole",
] as const;

function removeKey(storage: Storage, key: string) {
    try {
        storage.removeItem(key);
        return true;
    } catch {
        return false;
    }
}

function clearMatchingKeys(storage: Storage, predicate: (key: string) => boolean) {
    const cleared: string[] = [];
    for (let index = storage.length - 1; index >= 0; index -= 1) {
        const key = storage.key(index);
        if (!key || !predicate(key)) continue;
        if (removeKey(storage, key)) cleared.push(key);
    }
    return cleared;
}

/**
 * Migrate/clear stale role and workspace caches when the access schema advances.
 * Preserves auth tokens, locale, media queue, and library caches.
 */
export function migrateClientAccessSession(): {
    migrated: boolean;
    previousVersion: number;
    clearedKeys: string[];
} {
    if (typeof window === "undefined") {
        return { migrated: false, previousVersion: 0, clearedKeys: [] };
    }

    const previousRaw = window.localStorage.getItem(CLIENT_ACCESS_SCHEMA_KEY);
    const previousVersion = Number.parseInt(String(previousRaw || "0"), 10) || 0;
    if (previousVersion === CLIENT_ACCESS_SCHEMA_VERSION) {
        return { migrated: false, previousVersion, clearedKeys: [] };
    }

    const obsolete = new Set(OBSOLETE_ACCESS_STORAGE_KEYS.map((key) => key.toLowerCase()));
    const clearedKeys: string[] = [];

    for (const storage of [window.localStorage, window.sessionStorage]) {
        for (const key of OBSOLETE_ACCESS_STORAGE_KEYS) {
            if (storage.getItem(key) != null && removeKey(storage, key)) {
                clearedKeys.push(key);
            }
        }
        clearedKeys.push(
            ...clearMatchingKeys(storage, (key) => {
                const normalized = key.toLowerCase();
                if (obsolete.has(normalized)) return true;
                if (normalized.startsWith("sb-")) return false;
                if (normalized.includes("media-queue")) return false;
                if (normalized.includes("preferredlanguage")) return false;
                if (normalized.includes("zml_library") || normalized.includes("zml_liked")) return false;
                return (
                    normalized.includes("accountrole")
                    || normalized.includes("foundingrole")
                    || normalized.includes("navcapability")
                    || normalized.includes("nav_role")
                    || (normalized.includes("workspace") && normalized.includes("mdb"))
                    || normalized.includes("showupload")
                    || normalized.includes("creatorstudio")
                );
            }),
        );
    }

    window.localStorage.setItem(CLIENT_ACCESS_SCHEMA_KEY, String(CLIENT_ACCESS_SCHEMA_VERSION));
    return {
        migrated: true,
        previousVersion,
        clearedKeys: [...new Set(clearedKeys)],
    };
}

export function readClientAccessSchemaVersion() {
    if (typeof window === "undefined") return 0;
    return Number.parseInt(String(window.localStorage.getItem(CLIENT_ACCESS_SCHEMA_KEY) || "0"), 10) || 0;
}
