import type { PodcastEpisode, PodcastShow, PodcastStatus } from "@/lib/podcast-types";

export type PodcastAnalyticsTotals = {
    shows: {
        total: number;
        published: number;
        unpublished: number;
    };
    episodes: {
        total: number;
        audio: number;
        video: number;
        published: number;
        unpublished: number;
    };
    engagement: {
        audioPlays: number;
        videoViews: number;
        likes: number;
        followers: number;
    };
};

export type PodcastShowAnalyticsRow = {
    id: string;
    title: string;
    episodeCount: number;
    followers: number;
    audioPlays: number;
    videoViews: number;
    likes: number;
};

export type PodcastEpisodeAnalyticsRow = {
    id: string;
    title: string;
    showTitle: string;
    episodeType: "audio" | "video";
    status: PodcastStatus;
    metricKind: "plays" | "views";
    metricCount: number;
    likeCount: number;
};

export type PodcastAnalyticsPayload = {
    totals: PodcastAnalyticsTotals;
    shows: PodcastShowAnalyticsRow[];
    episodes: PodcastEpisodeAnalyticsRow[];
};

function isPublishedStatus(status: string) {
    return status === "published";
}

function safeCount(value: number | null | undefined) {
    return Number.isFinite(value) ? Math.max(0, Number(value)) : 0;
}

export function buildPodcastAnalytics(
    shows: PodcastShow[],
    episodes: PodcastEpisode[],
): PodcastAnalyticsPayload {
    const ownedShows = shows.filter((show) => show.id);
    const ownedShowIds = new Set(ownedShows.map((show) => show.id));
    const ownedEpisodes = episodes.filter((episode) => (
        episode.id && ownedShowIds.has(episode.podcastId)
    ));

    const followersByCreator = new Map<string, number>();
    for (const show of ownedShows) {
        if (!show.userId || followersByCreator.has(show.userId)) continue;
        followersByCreator.set(show.userId, safeCount(show.followerCount));
    }

    const showRows = ownedShows.map((show) => {
        const showEpisodes = ownedEpisodes.filter((episode) => episode.podcastId === show.id);
        const audioEpisodes = showEpisodes.filter((episode) => episode.episodeType === "audio");
        const videoEpisodes = showEpisodes.filter((episode) => episode.episodeType === "video");
        return {
            id: show.id,
            title: show.title,
            episodeCount: showEpisodes.length,
            followers: safeCount(show.followerCount),
            audioPlays: audioEpisodes.reduce((total, episode) => total + safeCount(episode.playCount), 0),
            videoViews: videoEpisodes.reduce((total, episode) => total + safeCount(episode.viewCount), 0),
            likes: showEpisodes.reduce((total, episode) => total + safeCount(episode.likeCount), 0),
        } satisfies PodcastShowAnalyticsRow;
    });

    const episodeRows = ownedEpisodes.map((episode) => {
        const isVideo = episode.episodeType === "video";
        return {
            id: episode.id,
            title: episode.title,
            showTitle: episode.podcastTitle || ownedShows.find((show) => show.id === episode.podcastId)?.title || "Podcast",
            episodeType: isVideo ? "video" : "audio",
            status: episode.status,
            metricKind: isVideo ? "views" : "plays",
            metricCount: isVideo ? safeCount(episode.viewCount) : safeCount(episode.playCount),
            likeCount: safeCount(episode.likeCount),
        } satisfies PodcastEpisodeAnalyticsRow;
    });

    const audioEpisodes = ownedEpisodes.filter((episode) => episode.episodeType === "audio");
    const videoEpisodes = ownedEpisodes.filter((episode) => episode.episodeType === "video");

    return {
        totals: {
            shows: {
                total: ownedShows.length,
                published: ownedShows.filter((show) => isPublishedStatus(show.status)).length,
                unpublished: ownedShows.filter((show) => !isPublishedStatus(show.status)).length,
            },
            episodes: {
                total: ownedEpisodes.length,
                audio: audioEpisodes.length,
                video: videoEpisodes.length,
                published: ownedEpisodes.filter((episode) => isPublishedStatus(episode.status)).length,
                unpublished: ownedEpisodes.filter((episode) => !isPublishedStatus(episode.status)).length,
            },
            engagement: {
                audioPlays: audioEpisodes.reduce((total, episode) => total + safeCount(episode.playCount), 0),
                videoViews: videoEpisodes.reduce((total, episode) => total + safeCount(episode.viewCount), 0),
                likes: ownedEpisodes.reduce((total, episode) => total + safeCount(episode.likeCount), 0),
                followers: [...followersByCreator.values()].reduce((total, count) => total + count, 0),
            },
        },
        shows: showRows,
        episodes: episodeRows,
    };
}
