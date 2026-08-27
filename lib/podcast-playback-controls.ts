export const PODCAST_SKIP_BACK_SECONDS = 15;
export const PODCAST_SKIP_FORWARD_SECONDS = 30;

export const PODCAST_PLAYBACK_RATES = [0.75, 1, 1.25, 1.5, 2] as const;
export type PodcastPlaybackRate = (typeof PODCAST_PLAYBACK_RATES)[number];

export const PODCAST_SLEEP_MINUTE_OPTIONS = [5, 15, 30, 60] as const;
export type PodcastSleepMinutes = (typeof PODCAST_SLEEP_MINUTE_OPTIONS)[number];
export type PodcastSleepMode = "off" | "end-of-episode" | PodcastSleepMinutes;

export function clampPodcastSeekSeconds(position: number, delta: number, duration: number) {
    const current = Number.isFinite(position) ? Math.max(0, position) : 0;
    const shift = Number.isFinite(delta) ? delta : 0;
    const next = Math.max(0, current + shift);
    if (!Number.isFinite(duration) || duration <= 0) return next;
    return Math.min(duration, next);
}

export function isPodcastPlaybackRate(value: unknown): value is PodcastPlaybackRate {
    return PODCAST_PLAYBACK_RATES.some((rate) => rate === value);
}

export function podcastSleepDurationMs(mode: PodcastSleepMode) {
    if (mode === "off" || mode === "end-of-episode") return 0;
    return mode * 60 * 1000;
}

export function isPodcastSleepEndOfEpisode(mode: PodcastSleepMode) {
    return mode === "end-of-episode";
}

export function podcastPlaybackRateLabel(rate: PodcastPlaybackRate) {
    return `${rate}x`;
}

export function podcastSleepModeLabel(mode: PodcastSleepMode) {
    if (mode === "off") return "Off";
    if (mode === "end-of-episode") return "End of episode";
    return `${mode} min`;
}
