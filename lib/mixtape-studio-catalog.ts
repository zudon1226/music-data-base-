import type { Mixtape } from "@/lib/mixtape-types";

export function upsertMixtapeById(list: Mixtape[], mixtape: Mixtape): Mixtape[] {
    const rest = list.filter((item) => item.id !== mixtape.id);
    return [mixtape, ...rest];
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