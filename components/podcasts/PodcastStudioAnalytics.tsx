"use client";

import { useCallback, useEffect, useState } from "react";
import {
    BarChart3,
    CircleAlert,
    FileAudio,
    FileVideo,
    LoaderCircle,
    RefreshCw,
} from "lucide-react";
import { authFetch } from "@/lib/client-api-auth";
import type {
    PodcastAnalyticsPayload,
    PodcastEpisodeAnalyticsRow,
    PodcastShowAnalyticsRow,
} from "@/lib/podcast-analytics";
import { supabase } from "@/lib/supabase";
import { podcastCountFormatter } from "./podcast-display";
import styles from "./podcasts.module.css";

type PodcastStudioAnalyticsProps = {
    userId: string;
};

type AnalyticsResponse = {
    error?: string;
    analytics?: PodcastAnalyticsPayload;
};

type MetricCard = {
    key: string;
    label: string;
    value: number;
};

function statusLabel(status: PodcastEpisodeAnalyticsRow["status"]) {
    return status.charAt(0).toUpperCase() + status.slice(1);
}

function formatCount(value: number) {
    return podcastCountFormatter.format(Math.max(0, value));
}

export function PodcastStudioAnalytics({ userId }: PodcastStudioAnalyticsProps) {
    const [analytics, setAnalytics] = useState<PodcastAnalyticsPayload | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const loadAnalytics = useCallback(async (signal?: AbortSignal) => {
        if (!userId) {
            setLoading(false);
            setError("A creator account is required to load Podcast analytics.");
            return;
        }
        setLoading(true);
        setError("");
        try {
            const response = await authFetch(
                supabase,
                `/api/podcasts/analytics?userId=${encodeURIComponent(userId)}`,
                { cache: "no-store", signal, requireSession: true },
            );
            const body = (await response.json().catch(() => ({}))) as AnalyticsResponse;
            if (!response.ok) {
                throw new Error(typeof body.error === "string" && body.error.trim()
                    ? body.error
                    : "Podcast analytics could not be loaded.");
            }
            if (!body.analytics) {
                throw new Error("Podcast analytics could not be loaded.");
            }
            setAnalytics(body.analytics);
        }
        catch (caught) {
            if (signal?.aborted) return;
            setAnalytics(null);
            setError(caught instanceof Error ? caught.message : "Podcast analytics could not be loaded.");
        }
        finally {
            if (!signal?.aborted) setLoading(false);
        }
    }, [userId]);

    useEffect(() => {
        const controller = new AbortController();
        const timer = window.setTimeout(() => void loadAnalytics(controller.signal), 0);
        return () => {
            window.clearTimeout(timer);
            controller.abort();
        };
    }, [loadAnalytics]);

    const totals = analytics?.totals;
    const showRows = analytics?.shows || [];
    const episodeRows = analytics?.episodes || [];
    const metricCards: MetricCard[] = totals
        ? [
            { key: "shows-total", label: "Podcast shows", value: totals.shows.total },
            { key: "shows-published", label: "Published shows", value: totals.shows.published },
            { key: "shows-draft", label: "Draft shows", value: totals.shows.unpublished },
            { key: "episodes-total", label: "Episodes", value: totals.episodes.total },
            { key: "episodes-audio", label: "Audio episodes", value: totals.episodes.audio },
            { key: "episodes-video", label: "Video episodes", value: totals.episodes.video },
            { key: "episodes-published", label: "Published episodes", value: totals.episodes.published },
            { key: "episodes-draft", label: "Draft episodes", value: totals.episodes.unpublished },
            { key: "plays", label: "Audio plays", value: totals.engagement.audioPlays },
            { key: "views", label: "Video views", value: totals.engagement.videoViews },
            { key: "likes", label: "Episode likes", value: totals.engagement.likes },
            { key: "followers", label: "Podcast followers", value: totals.engagement.followers },
        ]
        : [];

    return (
        <section className={styles.analyticsSection} aria-labelledby="podcast-studio-analytics-heading">
            <div className={styles.panelHeading}>
                <div>
                    <p className={styles.eyebrow}>Creator analytics</p>
                    <h3 id="podcast-studio-analytics-heading">Podcast Analytics</h3>
                </div>
                <button
                    type="button"
                    className={styles.compactButton}
                    onClick={() => void loadAnalytics()}
                    disabled={loading}
                >
                    <RefreshCw className={loading ? styles.spinner : undefined} size={16} aria-hidden="true" />
                    Refresh analytics
                </button>
            </div>

            {loading && !analytics ? (
                <div className={styles.analyticsState} role="status">
                    <LoaderCircle className={styles.spinner} size={22} aria-hidden="true" />
                    <span>Loading current podcast counters.</span>
                </div>
            ) : null}

            {error ? (
                <div className={styles.analyticsState} role="alert">
                    <CircleAlert size={22} aria-hidden="true" />
                    <span>{error}</span>
                </div>
            ) : null}

            {!error && totals ? (
                <>
                    <div className={styles.analyticsMetricGrid} role="list" aria-label="Podcast analytics totals">
                        {metricCards.map((card) => (
                            <article key={card.key} className={styles.analyticsMetricCard} role="listitem">
                                <span>{card.label}</span>
                                <strong>{formatCount(card.value)}</strong>
                            </article>
                        ))}
                    </div>

                    <div className={styles.analyticsTables}>
                        <section className={styles.analyticsTable} aria-labelledby="podcast-show-analytics-heading">
                            <div className={styles.analyticsTableHeading}>
                                <BarChart3 size={16} aria-hidden="true" />
                                <h4 id="podcast-show-analytics-heading">Per-show analytics</h4>
                                <span className={styles.countPill}>{showRows.length}</span>
                            </div>
                            {showRows.length === 0 ? (
                                <p className={styles.analyticsEmpty}>No owned podcast shows yet.</p>
                            ) : (
                                <div className={styles.analyticsRowList}>
                                    <div className={`${styles.analyticsShowRow} ${styles.analyticsRowHeader}`} aria-hidden="true">
                                        <span>Show</span>
                                        <span>Episodes</span>
                                        <span>Followers</span>
                                        <span>Audio plays</span>
                                        <span>Video views</span>
                                        <span>Likes</span>
                                    </div>
                                    {showRows.map((show: PodcastShowAnalyticsRow) => (
                                        <article key={show.id} className={styles.analyticsShowRow}>
                                            <strong data-label="Show">{show.title}</strong>
                                            <span data-label="Episodes">{formatCount(show.episodeCount)}</span>
                                            <span data-label="Followers">{formatCount(show.followers)}</span>
                                            <span data-label="Audio plays">{formatCount(show.audioPlays)}</span>
                                            <span data-label="Video views">{formatCount(show.videoViews)}</span>
                                            <span data-label="Likes">{formatCount(show.likes)}</span>
                                        </article>
                                    ))}
                                </div>
                            )}
                        </section>

                        <section className={styles.analyticsTable} aria-labelledby="podcast-episode-analytics-heading">
                            <div className={styles.analyticsTableHeading}>
                                <BarChart3 size={16} aria-hidden="true" />
                                <h4 id="podcast-episode-analytics-heading">Per-episode analytics</h4>
                                <span className={styles.countPill}>{episodeRows.length}</span>
                            </div>
                            {episodeRows.length === 0 ? (
                                <p className={styles.analyticsEmpty}>No owned podcast episodes yet.</p>
                            ) : (
                                <div className={styles.analyticsRowList}>
                                    <div className={`${styles.analyticsEpisodeRow} ${styles.analyticsRowHeader}`} aria-hidden="true">
                                        <span>Episode</span>
                                        <span>Show</span>
                                        <span>Type</span>
                                        <span>Status</span>
                                        <span>Plays or views</span>
                                        <span>Likes</span>
                                    </div>
                                    {episodeRows.map((episode) => (
                                        <article key={episode.id} className={styles.analyticsEpisodeRow}>
                                            <strong data-label="Episode">{episode.title}</strong>
                                            <span data-label="Show">{episode.showTitle}</span>
                                            <span data-label="Type" className={episode.episodeType === "video" ? styles.videoBadge : styles.audioBadge}>
                                                {episode.episodeType === "video"
                                                    ? <><FileVideo size={12} aria-hidden="true" /> Video</>
                                                    : <><FileAudio size={12} aria-hidden="true" /> Audio</>}
                                            </span>
                                            <span data-label="Status" className={styles.statusPill}>{statusLabel(episode.status)}</span>
                                            <span data-label={episode.metricKind === "views" ? "Video views" : "Audio plays"}>
                                                {formatCount(episode.metricCount)}
                                                {" "}
                                                {episode.metricKind === "views"
                                                    ? (episode.metricCount === 1 ? "view" : "views")
                                                    : (episode.metricCount === 1 ? "play" : "plays")}
                                            </span>
                                            <span data-label="Likes">
                                                {formatCount(episode.likeCount)}
                                                {" "}
                                                {episode.likeCount === 1 ? "like" : "likes"}
                                            </span>
                                        </article>
                                    ))}
                                </div>
                            )}
                        </section>
                    </div>
                </>
            ) : null}
        </section>
    );
}
