import type { CSSProperties } from "react";
import type { PodcastEpisode } from "@/lib/podcast-types";

export const podcastCountFormatter = new Intl.NumberFormat(undefined, {
    notation: "compact",
    maximumFractionDigits: 1,
});

export function podcastImageStyle(url: string): CSSProperties | undefined {
    const cleanUrl = url.trim();
    return cleanUrl
        ? { backgroundImage: `linear-gradient(180deg, transparent 55%, rgba(4, 8, 22, 0.38)), url(${JSON.stringify(cleanUrl)})` }
        : undefined;
}

export function formatPodcastDuration(durationSeconds: number | null) {
    if (durationSeconds == null || !Number.isFinite(durationSeconds) || durationSeconds < 0) return "";
    const total = Math.round(durationSeconds);
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;
    return hours > 0
        ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
        : `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function formatPodcastDate(value: string | null | undefined) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
    }).format(date);
}

export function formatPodcastAudience(episode: PodcastEpisode) {
    const metricCount = episode.episodeType === "video" ? episode.viewCount : episode.playCount;
    const metricNoun = episode.episodeType === "video"
        ? (metricCount === 1 ? "view" : "views")
        : (metricCount === 1 ? "play" : "plays");
    return `${podcastCountFormatter.format(metricCount)} ${metricNoun}`;
}

export function podcastResponseError(body: { error?: string }, fallback: string) {
    return typeof body.error === "string" && body.error.trim() ? body.error : fallback;
}
