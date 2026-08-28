import type { PodcastEpisode, PodcastShow, PodcastTab } from "@/lib/podcast-types";

export const PODCAST_DISCOVERY_SECTIONS = ["discover", "saved", "following"] as const;
export type PodcastDiscoverySection = (typeof PODCAST_DISCOVERY_SECTIONS)[number];

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isPodcastDiscoveryUuid(value: string) {
    return UUID_PATTERN.test(value);
}

export function normalizePodcastSearchQuery(value: string) {
    return value.trim().slice(0, 80).toLowerCase();
}

function textMatches(haystack: string | undefined, query: string) {
    return Boolean(query) && String(haystack || "").toLowerCase().includes(query);
}

export function isPublishedPodcastShow(show: PodcastShow) {
    return show.status === "published";
}

export function isPublishedPodcastEpisode(episode: PodcastEpisode) {
    return episode.status === "published";
}

export function podcastShowMatchesQuery(show: PodcastShow, query: string) {
    if (!query) return true;
    return textMatches(show.title, query)
        || textMatches(show.creatorName, query)
        || textMatches(show.description, query)
        || textMatches(show.category, query);
}

export function podcastEpisodeMatchesQuery(episode: PodcastEpisode, query: string) {
    if (!query) return true;
    return textMatches(episode.title, query)
        || textMatches(episode.podcastTitle, query)
        || textMatches(episode.creatorName, query)
        || textMatches(episode.description, query);
}

export function uniquePodcastCategories(shows: PodcastShow[]) {
    const categories = new Set<string>();
    for (const show of shows) {
        const category = String(show.category || "").trim();
        if (category) categories.add(category);
    }
    return [...categories].sort((left, right) => left.localeCompare(right, undefined, { sensitivity: "base" }));
}

export function mergePublishedPodcastCatalog(
    primaryShows: PodcastShow[],
    primaryEpisodes: PodcastEpisode[],
    extraShows: PodcastShow[] = [],
    extraEpisodes: PodcastEpisode[] = [],
) {
    const shows = new Map<string, PodcastShow>();
    const episodes = new Map<string, PodcastEpisode>();
    for (const show of [...primaryShows, ...extraShows]) {
        if (show.id && isPublishedPodcastShow(show)) shows.set(show.id, show);
    }
    for (const episode of [...primaryEpisodes, ...extraEpisodes]) {
        if (episode.id && isPublishedPodcastEpisode(episode)) episodes.set(episode.id, episode);
    }
    return {
        shows: [...shows.values()],
        episodes: [...episodes.values()],
    };
}

export function filterPodcastDiscovery(input: {
    shows: PodcastShow[];
    episodes: PodcastEpisode[];
    query?: string;
    category?: string;
    formatTab?: PodcastTab;
}) {
    const query = normalizePodcastSearchQuery(input.query || "");
    const category = String(input.category || "").trim().toLowerCase();
    const formatTab = input.formatTab || "All";

    let episodes = input.episodes.filter((episode) => {
        if (!isPublishedPodcastEpisode(episode)) return false;
        if (formatTab === "Audio") return episode.episodeType === "audio";
        if (formatTab === "Video") return episode.episodeType === "video";
        return true;
    });

    let shows = input.shows.filter((show) => isPublishedPodcastShow(show));
    if (formatTab !== "All") {
        const showIds = new Set(episodes.map((episode) => episode.podcastId));
        shows = shows.filter((show) => showIds.has(show.id));
    }

    if (category) {
        shows = shows.filter((show) => String(show.category || "").trim().toLowerCase() === category);
        const showIds = new Set(shows.map((show) => show.id));
        episodes = episodes.filter((episode) => showIds.has(episode.podcastId));
    }

    if (query) {
        const matchingShowIds = new Set<string>();
        for (const show of shows) {
            if (podcastShowMatchesQuery(show, query)) matchingShowIds.add(show.id);
        }
        for (const episode of episodes) {
            if (podcastEpisodeMatchesQuery(episode, query)) matchingShowIds.add(episode.podcastId);
        }
        shows = shows.filter((show) => matchingShowIds.has(show.id));
        episodes = episodes.filter((episode) => (
            matchingShowIds.has(episode.podcastId)
            && (
                podcastEpisodeMatchesQuery(episode, query)
                || podcastShowMatchesQuery(
                    shows.find((show) => show.id === episode.podcastId)
                        || input.shows.find((show) => show.id === episode.podcastId)
                        || {
                            id: episode.podcastId,
                            userId: episode.userId,
                            title: episode.podcastTitle,
                            description: "",
                            coverImageUrl: "",
                            coverStoragePath: "",
                            category: "",
                            languageCode: "en",
                            explicitContent: false,
                            status: "published",
                            publishedAt: episode.publishedAt,
                            createdAt: episode.createdAt,
                            updatedAt: episode.updatedAt,
                            creatorName: episode.creatorName,
                        },
                    query,
                )
            )
        ));
    }

    return { shows, episodes };
}

export function filterSavedPodcastDiscovery(input: {
    shows: PodcastShow[];
    episodes: PodcastEpisode[];
    savedShowIds: Iterable<string>;
    savedEpisodeIds: Iterable<string>;
}) {
    const savedShowIds = new Set(input.savedShowIds);
    const savedEpisodeIds = new Set(input.savedEpisodeIds);
    return {
        shows: input.shows.filter((show) => savedShowIds.has(show.id)),
        episodes: input.episodes.filter((episode) => savedEpisodeIds.has(episode.id)),
    };
}

export function filterFollowingPodcastDiscovery(input: {
    shows: PodcastShow[];
    episodes: PodcastEpisode[];
    followingShowIds: Iterable<string>;
    currentUserId?: string;
}) {
    const followingShowIds = new Set(input.followingShowIds);
    const currentUserId = String(input.currentUserId || "");
    const shows = input.shows.filter((show) => (
        Boolean(show.id)
        && followingShowIds.has(show.id)
        && Boolean(show.userId)
        && show.userId !== currentUserId
    ));
    const showIds = new Set(shows.map((show) => show.id));
    return {
        shows,
        episodes: input.episodes.filter((episode) => showIds.has(episode.podcastId)),
    };
}

export function missingSavedPodcastIds(input: {
    savedShowIds: Iterable<string>;
    savedEpisodeIds: Iterable<string>;
    knownShowIds: Iterable<string>;
    knownEpisodeIds: Iterable<string>;
}) {
    const knownShows = new Set(input.knownShowIds);
    const knownEpisodes = new Set(input.knownEpisodeIds);
    return {
        showIds: [...new Set(input.savedShowIds)].filter((id) => isPodcastDiscoveryUuid(id) && !knownShows.has(id)),
        episodeIds: [...new Set(input.savedEpisodeIds)].filter((id) => isPodcastDiscoveryUuid(id) && !knownEpisodes.has(id)),
    };
}

export function missingFollowedPodcastShowIds(input: {
    followedShowIds: Iterable<string>;
    knownShowIds: Iterable<string>;
}) {
    const knownShows = new Set(input.knownShowIds);
    return [...new Set(input.followedShowIds)].filter((id) => isPodcastDiscoveryUuid(id) && !knownShows.has(id));
}
