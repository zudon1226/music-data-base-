import type { Mixtape, MixtapeTrack } from "@/lib/mixtape-types";
import {
    decodeMineCatalogCursor,
    encodeMineCatalogCursor,
    mergeMineCatalogPages,
} from "@/lib/mixtape-mine-catalog-pagination.mjs";

export {
    clampMineCatalogLimit,
    decodeMineCatalogCursor,
    encodeMineCatalogCursor,
    MINE_CATALOG_DEFAULT_LIMIT,
    MINE_CATALOG_MAX_LIMIT,
    isMineCatalogLoadIncomplete,
    MINE_CATALOG_MAX_PAGES,
    mergeMineCatalogPages,
} from "@/lib/mixtape-mine-catalog-pagination.mjs";

export function upsertTrackById(list: MixtapeTrack[], track: MixtapeTrack): MixtapeTrack[] {
    const rest = list.filter((item) => item.id !== track.id);
    return [...rest, track];
}

export function upsertMixtapeById(list: Mixtape[], mixtape: Mixtape): Mixtape[] {
    const rest = list.filter((item) => item.id !== mixtape.id);
    return [mixtape, ...rest];
}

export function mergeUniqueMixtapesById(existing: Mixtape[], incoming: Mixtape[]): Mixtape[] {
    const map = new Map(existing.map((item) => [item.id, item]));
    for (const row of incoming) {
        if (row.id) map.set(row.id, row);
    }
    return Array.from(map.values());
}

export function mergeCatalogTracksById(existing: MixtapeTrack[], incoming: MixtapeTrack[]): MixtapeTrack[] {
    const map = new Map(existing.map((item) => [item.id, item]));
    for (const row of incoming) {
        if (row.id) map.set(row.id, row);
    }
    return Array.from(map.values());
}

export function applyProgressiveMineCatalogPage(
    prevMixtapes: Mixtape[],
    prevTracks: MixtapeTrack[],
    pageMixtapes: Mixtape[],
    pageTracks: MixtapeTrack[],
    preserveId: string,
): { mixtapes: Mixtape[]; tracks: MixtapeTrack[] } {
    const mixtapes = mergeMineCatalogResponse(
        mergeUniqueMixtapesById(prevMixtapes, pageMixtapes),
        prevMixtapes,
        preserveId,
    );
    const tracks = mergeCatalogTracksById(prevTracks, pageTracks);
    return { mixtapes, tracks };
}

export function isStudioCatalogInteractive(pagesLoaded: number): boolean {
    return pagesLoaded >= 1;
}

export function mergeMineCatalogResponse(
    serverMixtapes: Mixtape[],
    localMixtapes: Mixtape[],
    preserveId: string,
): Mixtape[] {
    const map = new Map(serverMixtapes.map((item) => [item.id, item]));
    if (preserveId) {
        const local = localMixtapes.find((item) => item.id === preserveId);
        if (local && !map.has(local.id)) map.set(local.id, local);
    }
    return Array.from(map.values());
}

export function shouldApplyMineCatalogRequest(requestSeq: number, latestSeq: number, aborted: boolean) {
    return !aborted && requestSeq === latestSeq;
}

export function shouldClearStudioLoading(requestSeq: number, latestSeq: number) {
    return requestSeq === latestSeq;
}