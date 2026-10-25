/**
 * Maps storage object paths to catalog moderation visibility (app + future storage RLS).
 * Used by tests and documented for SQL security-definer helpers.
 */

export const MODERATION_CLEAR = "clear";

export function normalizeObjectPath(value) {
    return String(value || "").trim().replace(/^\/+/, "");
}

/** True when a catalog row with this storage path may be read anonymously. */
export function isStorageObjectPubliclyReadable(catalogRows, objectPath, options = {}) {
    const path = normalizeObjectPath(objectPath);
    if (!path) return false;
    const rows = Array.isArray(catalogRows) ? catalogRows : [];
    const matches = rows.filter((row) => {
        const rowPath = normalizeObjectPath(row?.storage_path || row?.storagePath || "");
        return rowPath === path;
    });
    if (matches.length === 0) {
        return options.allowOrphanObjects === true;
    }
    if (matches.length !== 1) {
        return false;
    }
    const state = String(matches[0].moderation_state ?? "").trim();
    return state === MODERATION_CLEAR;
}
