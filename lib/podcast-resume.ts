import { isPublishedPodcastEpisode } from "@/lib/podcast-discovery";
import type { PodcastEpisode } from "@/lib/podcast-types";
import {
    PODCAST_CONTINUE_LISTENING_LIMIT,
    PODCAST_RESUME_COMPLETED_RATIO,
    PODCAST_RESUME_MIN_SECONDS,
    isEligiblePodcastResume,
    podcastResumeStartSeconds,
    sanitizePodcastResumeProgressList,
    selectContinueListeningPodcasts as selectContinueListeningPodcastsShared,
} from "@/lib/podcast-resume.shared.mjs";

export {
    PODCAST_CONTINUE_LISTENING_LIMIT,
    PODCAST_RESUME_COMPLETED_RATIO,
    PODCAST_RESUME_MIN_SECONDS,
    isEligiblePodcastResume,
    podcastResumeStartSeconds,
    sanitizePodcastResumeProgressList,
};

export type PodcastResumeProgress = {
    episodeId: string;
    position: number;
    duration?: number | null;
    completed?: boolean;
    playedAt?: string;
};

export type PodcastContinueListeningItem = {
    episode: PodcastEpisode;
    position: number;
    duration: number;
};

export function selectContinueListeningPodcasts(input: {
    progress: PodcastResumeProgress[];
    publishedEpisodes: PodcastEpisode[];
    limit?: number;
}): PodcastContinueListeningItem[] {
    const publishedEpisodes = input.publishedEpisodes.filter(isPublishedPodcastEpisode);
    return selectContinueListeningPodcastsShared({
        progress: input.progress,
        publishedEpisodes,
        limit: input.limit,
    }) as PodcastContinueListeningItem[];
}