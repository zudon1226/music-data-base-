import { isPublishedPodcastEpisode } from "@/lib/podcast-discovery";
import type { PodcastEpisode } from "@/lib/podcast-types";

export const PODCAST_RESUME_MIN_SECONDS = 5;
export const PODCAST_RESUME_COMPLETED_RATIO = 0.95;
export const PODCAST_CONTINUE_LISTENING_LIMIT = 5;

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

function finiteSeconds(value: unknown) {
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
}

export function isEligiblePodcastResume(source: PodcastResumeProgress) {
    const episodeId = String(source.episodeId || "").trim();
    const position = finiteSeconds(source.position);
    if (!episodeId || position < PODCAST_RESUME_MIN_SECONDS) return false;
    if (source.completed === true) return false;
    const duration = finiteSeconds(source.duration);
    if (duration > 0 && position >= duration * PODCAST_RESUME_COMPLETED_RATIO) return false;
    return true;
}

export function podcastResumeStartSeconds(source: PodcastResumeProgress) {
    if (!isEligiblePodcastResume(source)) return 0;
    const position = finiteSeconds(source.position);
    const duration = finiteSeconds(source.duration);
    if (duration > 0) return Math.min(position, duration);
    return position;
}

export function selectContinueListeningPodcasts(input: {
    progress: PodcastResumeProgress[];
    publishedEpisodes: PodcastEpisode[];
    limit?: number;
}): PodcastContinueListeningItem[] {
    const published = new Map<string, PodcastEpisode>();
    for (const episode of input.publishedEpisodes) {
        if (episode.id && isPublishedPodcastEpisode(episode)) published.set(episode.id, episode);
    }
    const seen = new Set<string>();
    const selected: PodcastContinueListeningItem[] = [];
    const limit = Math.max(1, input.limit || PODCAST_CONTINUE_LISTENING_LIMIT);
    const ranked = [...input.progress].sort((left, right) => {
        const rightTime = Date.parse(String(right.playedAt || "")) || 0;
        const leftTime = Date.parse(String(left.playedAt || "")) || 0;
        return rightTime - leftTime;
    });

    for (const row of ranked) {
        const episodeId = String(row.episodeId || "").trim();
        if (!episodeId || seen.has(episodeId)) continue;
        const episode = published.get(episodeId);
        if (!episode) continue;
        const duration = finiteSeconds(row.duration) || finiteSeconds(episode.durationSeconds);
        const position = podcastResumeStartSeconds({
            episodeId,
            position: row.position,
            duration,
            completed: row.completed,
        });
        if (position < PODCAST_RESUME_MIN_SECONDS) continue;
        seen.add(episodeId);
        selected.push({ episode, position, duration });
        if (selected.length >= limit) break;
    }

    return selected;
}
