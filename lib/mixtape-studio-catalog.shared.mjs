/** Pure helpers for Mixtape Studio catalog merge (client + tests). */

/** @param {Array<{ id: string }>} list @param {{ id: string }} mixtape */
export function upsertMixtapeById(list, mixtape) {
    const rest = list.filter((item) => item.id !== mixtape.id);
    return [mixtape, ...rest];
}

/** @param {Array<{ id: string }>} list @param {{ id: string }} track */
export function upsertTrackById(list, track) {
    const rest = list.filter((item) => item.id !== track.id);
    return [...rest, track];
}

/**
 * Server list is authoritative; keep a locally selected row not yet visible from the server.
 * @param {Array<{ id: string }>} serverMixtapes
 * @param {Array<{ id: string }>} localMixtapes
 * @param {string} preserveId
 */
export function mergeMineCatalogResponse(serverMixtapes, localMixtapes, preserveId) {
    const map = new Map(serverMixtapes.map((m) => [m.id, m]));
    if (preserveId) {
        const local = localMixtapes.find((m) => m.id === preserveId);
        if (local && !map.has(local.id)) map.set(local.id, local);
    }
    return Array.from(map.values());
}

/** Union by id; incoming wins on collision. */
export function mergeUniqueMixtapesById(existing, incoming) {
    const map = new Map((Array.isArray(existing) ? existing : []).map((m) => [m.id, m]));
    for (const row of Array.isArray(incoming) ? incoming : []) {
        const id = String(row?.id || "").trim();
        if (id) map.set(id, row);
    }
    return Array.from(map.values());
}

/** Merge track pages without dropping tracks only present locally (e.g. upsertTrackById). */
export function mergeCatalogTracksById(existing, incoming) {
    const map = new Map((Array.isArray(existing) ? existing : []).map((t) => [t.id, t]));
    for (const row of Array.isArray(incoming) ? incoming : []) {
        const id = String(row?.id || "").trim();
        if (id) map.set(id, row);
    }
    return Array.from(map.values());
}

/**
 * Apply one mine-catalog page onto current Studio state.
 * @param {Array<{ id: string }>} prevMixtapes
 * @param {Array<{ id: string }>} prevTracks
 * @param {Array<{ id: string }>} pageMixtapes
 * @param {Array<{ id: string }>} pageTracks
 * @param {string} preserveId
 */
export function applyProgressiveMineCatalogPage(prevMixtapes, prevTracks, pageMixtapes, pageTracks, preserveId) {
    const mixtapes = mergeMineCatalogResponse(
        mergeUniqueMixtapesById(prevMixtapes, pageMixtapes),
        prevMixtapes,
        preserveId,
    );
    const tracks = mergeCatalogTracksById(prevTracks, pageTracks);
    return { mixtapes, tracks };
}

/** Studio is interactive once the first page has been merged. */
export function isStudioCatalogInteractive(pagesLoaded) {
    return pagesLoaded >= 1;
}

/**
 * @param {number} requestSeq
 * @param {number} latestSeq
 * @param {boolean} aborted
 */
export function shouldApplyMineCatalogRequest(requestSeq, latestSeq, aborted) {
    return !aborted && requestSeq === latestSeq;
}

/**
 * @param {number} requestSeq
 * @param {number} latestSeq
 */
export function shouldClearStudioLoading(requestSeq, latestSeq) {
    return requestSeq === latestSeq;
}