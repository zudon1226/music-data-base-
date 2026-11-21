/** Stable cursor pagination for creator `scope=mine` mixtape catalog. */

export const MINE_CATALOG_DEFAULT_LIMIT = 40;
export const MINE_CATALOG_MAX_LIMIT = 50;
export const MINE_CATALOG_MAX_PAGES = 80;

/** Client stopped paging before the API reported the catalog end. */
export function isMineCatalogLoadIncomplete(pagesLoaded, hasMoreRemaining) {
    return Boolean(hasMoreRemaining) && pagesLoaded >= MINE_CATALOG_MAX_PAGES;
}

export function clampMineCatalogLimit(raw) {
    const n = Number(raw);
    if (!Number.isFinite(n)) return MINE_CATALOG_DEFAULT_LIMIT;
    return Math.min(MINE_CATALOG_MAX_LIMIT, Math.max(1, Math.floor(n)));
}

export function encodeMineCatalogCursor(row) {
    const updatedAt = String(row?.updated_at || row?.updatedAt || "").trim();
    const id = String(row?.id || "").trim();
    if (!updatedAt || !id) return "";
    const payload = JSON.stringify({ u: updatedAt, i: id });
    return Buffer.from(payload, "utf8").toString("base64url");
}

export function decodeMineCatalogCursor(token) {
    const value = String(token || "").trim();
    if (!value) return null;
    try {
        const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
        const updatedAt = String(parsed?.u || "").trim();
        const id = String(parsed?.i || "").trim();
        if (!updatedAt || !id) return null;
        return { updatedAt, id };
    }
    catch {
        return null;
    }
}

/** Keyset filter for `(updated_at desc, id desc)` pagination. */
export function mineCatalogCursorOrFilter(cursor) {
    const updatedAt = cursor.updatedAt.replace(/,/g, "");
    const id = cursor.id.replace(/,/g, "");
    return `updated_at.lt.${updatedAt},and(updated_at.eq.${updatedAt},id.lt.${id})`;
}

export function dedupeMixtapesById(rows) {
    const map = new Map();
    for (const row of Array.isArray(rows) ? rows : []) {
        const id = String(row?.id || "").trim();
        if (!id) continue;
        map.set(id, row);
    }
    return Array.from(map.values());
}

export function mergeMineCatalogPages(pages) {
    const merged = [];
    for (const page of Array.isArray(pages) ? pages : []) {
        for (const row of dedupeMixtapesById(page)) merged.push(row);
    }
    const byId = new Map(merged.map((row) => [String(row.id), row]));
    return Array.from(byId.values());
}

export function appendUniqueMixtapeIds(existingIds, rows) {
    const ids = new Set(Array.isArray(existingIds) ? existingIds : []);
    for (const row of Array.isArray(rows) ? rows : []) {
        const id = String(row?.id || "").trim();
        if (id) ids.add(id);
    }
    return [...ids];
}