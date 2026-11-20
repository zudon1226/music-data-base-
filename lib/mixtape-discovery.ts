import type { Mixtape, MixtapeCategory, MixtapeTrack } from "@/lib/mixtape-types";

export type MixtapeDiscoverySection = "discover" | "featured" | "recent" | "favorites";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isMixtapeDiscoveryUuid(value: string) {
    return UUID_PATTERN.test(value);
}

export function normalizeMixtapeSearchQuery(value: string) {
    return value.trim().slice(0, 80).toLowerCase();
}

function textMatches(haystack: string | undefined, query: string) {
    return Boolean(query) && String(haystack || "").toLowerCase().includes(query);
}

export function isPublishedMixtape(mixtape: Mixtape) {
    return mixtape.status === "published" && mixtape.moderationState === "clear";
}

export function isPublishedMixtapeTrack(track: MixtapeTrack) {
    return track.status === "published" && track.moderationState === "clear";
}

export function mixtapeMatchesQuery(mixtape: Mixtape, query: string) {
    if (!query) return true;
    return textMatches(mixtape.title, query)
        || textMatches(mixtape.creatorName, query)
        || textMatches(mixtape.description, query)
        || textMatches(mixtape.genre, query)
        || textMatches(mixtape.categoryLabel, query);
}

export function mixtapeTrackMatchesQuery(track: MixtapeTrack, query: string) {
    if (!query) return true;
    return textMatches(track.title, query)
        || textMatches(track.mixtapeTitle, query)
        || textMatches(track.creatorName, query)
        || textMatches(track.description, query);
}

export function uniqueMixtapeCategories(
    mixtapes: Mixtape[],
    categories: MixtapeCategory[] = [],
): MixtapeCategory[] {
    if (categories.length > 0) return categories;
    const slugs = new Map<string, MixtapeCategory>();
    for (const mixtape of mixtapes) {
        if (!mixtape.categoryId || !mixtape.categoryLabel) continue;
        slugs.set(mixtape.categoryId, {
            id: mixtape.categoryId,
            slug: mixtape.categorySlug || mixtape.categoryId,
            label: mixtape.categoryLabel,
            sortOrder: 0,
            isActive: true,
        });
    }
    return [...slugs.values()].sort((left, right) => left.label.localeCompare(right.label));
}

export function filterMixtapeDiscovery(input: {
    mixtapes: Mixtape[];
    tracks: MixtapeTrack[];
    query?: string;
    categoryId?: string;
    featuredOnly?: boolean;
}) {
    const query = normalizeMixtapeSearchQuery(input.query || "");
    const categoryId = String(input.categoryId || "").trim();

    let mixtapes = input.mixtapes.filter((mixtape) => isPublishedMixtape(mixtape));
    let tracks = input.tracks.filter((track) => isPublishedMixtapeTrack(track));

    if (input.featuredOnly) {
        mixtapes = mixtapes.filter((mixtape) => mixtape.isFeatured);
        const ids = new Set(mixtapes.map((mixtape) => mixtape.id));
        tracks = tracks.filter((track) => ids.has(track.mixtapeId));
    }

    if (categoryId) {
        mixtapes = mixtapes.filter((mixtape) => mixtape.categoryId === categoryId);
        const ids = new Set(mixtapes.map((mixtape) => mixtape.id));
        tracks = tracks.filter((track) => ids.has(track.mixtapeId));
    }

    if (query) {
        const matchingIds = new Set<string>();
        for (const mixtape of mixtapes) {
            if (mixtapeMatchesQuery(mixtape, query)) matchingIds.add(mixtape.id);
        }
        for (const track of tracks) {
            if (mixtapeTrackMatchesQuery(track, query)) matchingIds.add(track.mixtapeId);
        }
        mixtapes = mixtapes.filter((mixtape) => matchingIds.has(mixtape.id));
        tracks = tracks.filter((track) => matchingIds.has(track.mixtapeId));
    }

    return { mixtapes, tracks };
}

export function sortMixtapesRecent(mixtapes: Mixtape[]) {
    return [...mixtapes].sort((left, right) => {
        const leftStamp = left.publishedAt || left.createdAt;
        const rightStamp = right.publishedAt || right.createdAt;
        return rightStamp.localeCompare(leftStamp);
    });
}

export function filterFavoritedMixtapeDiscovery(input: {
    mixtapes: Mixtape[];
    tracks: MixtapeTrack[];
    favoriteMixtapeIds: Iterable<string>;
}) {
    const favoriteIds = new Set(input.favoriteMixtapeIds);
    const mixtapes = input.mixtapes.filter((mixtape) => (
        isPublishedMixtape(mixtape) && favoriteIds.has(mixtape.id)
    ));
    const mixtapeIds = new Set(mixtapes.map((mixtape) => mixtape.id));
    const tracks = input.tracks.filter((track) => (
        isPublishedMixtapeTrack(track) && mixtapeIds.has(track.mixtapeId)
    ));
    return { mixtapes, tracks };
}