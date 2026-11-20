const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const PODCAST_RESUME_MIN_SECONDS = 5;
export const PODCAST_RESUME_COMPLETED_RATIO = 0.95;
export const PODCAST_CONTINUE_LISTENING_LIMIT = 5;

function finiteSeconds(value) {
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
}

function isPodcastDiscoveryUuid(value) {
    return UUID_PATTERN.test(String(value || "").trim());
}

function isPublishedPodcastEpisode(episode) {
    return episode?.status === "published";
}

export function isEligiblePodcastResume(source) {
    const episodeId = String(source.episodeId || "").trim();
    const position = finiteSeconds(source.position);
    if (!episodeId || position < PODCAST_RESUME_MIN_SECONDS) return false;
    if (source.completed === true) return false;
    const duration = finiteSeconds(source.duration);
    if (duration > 0 && position >= duration * PODCAST_RESUME_COMPLETED_RATIO) return false;
    return true;
}

export function podcastResumeStartSeconds(source) {
    if (!isEligiblePodcastResume(source)) return 0;
    const position = finiteSeconds(source.position);
    const duration = finiteSeconds(source.duration);
    if (duration > 0) return Math.min(position, duration);
    return position;
}

export function sanitizePodcastResumeProgressList(progress) {
    if (!Array.isArray(progress)) return [];
    const byEpisode = new Map();
    for (const row of progress) {
        if (!row || typeof row !== "object") continue;
        const episodeId = String(row.episodeId || "").trim();
        if (!episodeId || !isPodcastDiscoveryUuid(episodeId)) continue;
        const next = {
            episodeId,
            position: Math.max(0, Number(row.position) || 0),
            duration: Math.max(0, Number(row.duration) || 0) || undefined,
            completed: row.completed === true,
            playedAt: String(row.playedAt || ""),
        };
        const existing = byEpisode.get(episodeId);
        const nextTime = Date.parse(next.playedAt || "") || 0;
        const existingTime = Date.parse(existing?.playedAt || "") || 0;
        if (!existing || nextTime >= existingTime) byEpisode.set(episodeId, next);
    }
    return [...byEpisode.values()];
}

export function selectContinueListeningPodcasts(input) {
    const rankedInput = sanitizePodcastResumeProgressList(input.progress);
    const published = new Map();
    for (const episode of input.publishedEpisodes || []) {
        if (episode?.id && isPublishedPodcastEpisode(episode)) published.set(episode.id, episode);
    }
    const seen = new Set();
    const selected = [];
    const limit = Math.max(1, input.limit || PODCAST_CONTINUE_LISTENING_LIMIT);
    const ranked = [...rankedInput].sort((left, right) => {
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