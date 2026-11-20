import type { Mixtape, MixtapeTrack } from "@/lib/mixtape-types";

export type MixtapeAnalyticsTotals = {
    mixtapes: {
        total: number;
        published: number;
        unpublished: number;
    };
    tracks: {
        total: number;
        published: number;
        unpublished: number;
    };
    engagement: {
        /** Sum of mixtape.play_count (catalog counter; not session-verified). */
        catalogPlays: number;
        /** Sum of mixtape.favorite_count (catalog counter). */
        catalogFavorites: number;
        /** Rows in mixtape_plays for owned mixtapes when supplied by the API. */
        qualifiedPlays: number | null;
    };
};

export type MixtapeAnalyticsRow = {
    id: string;
    title: string;
    trackCount: number;
    playCount: number;
    favoriteCount: number;
    status: string;
};

export type MixtapeTrackAnalyticsRow = {
    id: string;
    title: string;
    mixtapeTitle: string;
    position: number;
    status: string;
    playCount: number;
    durationSeconds: number | null;
};

export type MixtapeAnalyticsPayload = {
    totals: MixtapeAnalyticsTotals;
    mixtapes: MixtapeAnalyticsRow[];
    tracks: MixtapeTrackAnalyticsRow[];
};

function isPublishedStatus(status: string) {
    return status === "published";
}

function safeCount(value: number | null | undefined) {
    return Number.isFinite(value) ? Math.max(0, Number(value)) : 0;
}

export function buildMixtapeAnalytics(
    mixtapes: Mixtape[],
    tracks: MixtapeTrack[],
    options: { qualifiedPlays?: number | null } = {},
): MixtapeAnalyticsPayload {
    const ownedMixtapes = mixtapes.filter((mixtape) => mixtape.id);
    const ownedIds = new Set(ownedMixtapes.map((mixtape) => mixtape.id));
    const ownedTracks = tracks.filter((track) => track.id && ownedIds.has(track.mixtapeId));

    const mixtapeRows = ownedMixtapes.map((mixtape) => {
        const mixtapeTracks = ownedTracks.filter((track) => track.mixtapeId === mixtape.id);
        return {
            id: mixtape.id,
            title: mixtape.title,
            trackCount: mixtapeTracks.length,
            playCount: safeCount(mixtape.playCount),
            favoriteCount: safeCount(mixtape.favoriteCount),
            status: mixtape.status,
        } satisfies MixtapeAnalyticsRow;
    });

    const trackRows = ownedTracks.map((track) => ({
        id: track.id,
        title: track.title,
        mixtapeTitle: track.mixtapeTitle
            || ownedMixtapes.find((mixtape) => mixtape.id === track.mixtapeId)?.title
            || "Mixtape",
        position: track.position,
        status: track.status,
        playCount: safeCount(track.playCount),
        durationSeconds: track.durationSeconds,
    } satisfies MixtapeTrackAnalyticsRow));

    return {
        totals: {
            mixtapes: {
                total: ownedMixtapes.length,
                published: ownedMixtapes.filter((mixtape) => isPublishedStatus(mixtape.status)).length,
                unpublished: ownedMixtapes.filter((mixtape) => !isPublishedStatus(mixtape.status)).length,
            },
            tracks: {
                total: ownedTracks.length,
                published: ownedTracks.filter((track) => isPublishedStatus(track.status)).length,
                unpublished: ownedTracks.filter((track) => !isPublishedStatus(track.status)).length,
            },
            engagement: {
                catalogPlays: ownedMixtapes.reduce((total, mixtape) => total + safeCount(mixtape.playCount), 0),
                catalogFavorites: ownedMixtapes.reduce((total, mixtape) => total + safeCount(mixtape.favoriteCount), 0),
                qualifiedPlays: options.qualifiedPlays ?? null,
            },
        },
        mixtapes: mixtapeRows,
        tracks: trackRows,
    };
}