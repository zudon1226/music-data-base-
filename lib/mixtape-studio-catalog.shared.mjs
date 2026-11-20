/** Pure helpers for Mixtape Studio catalog merge (client + tests). */

/** @param {Array<{ id: string }>} list @param {{ id: string }} mixtape */
export function upsertMixtapeById(list, mixtape) {
    const rest = list.filter((item) => item.id !== mixtape.id);
    return [mixtape, ...rest];
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