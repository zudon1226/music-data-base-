"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
    ArrowLeft,
    Bookmark,
    BookmarkCheck,
    CircleAlert,
    Headphones,
    LoaderCircle,
    Play,
    Radio,
    Share2,
    UserCheck,
    UserPlus,
    Video,
} from "lucide-react";
import { authFetch } from "@/lib/client-api-auth";
import { sharePodcastLink } from "@/lib/podcast-share";
import {
    type PodcastEpisode,
    type PodcastPlaybackRequest,
    type PodcastShow,
    type PodcastTab,
} from "@/lib/podcast-types";
import { supabase } from "@/lib/supabase";
import {
    formatPodcastAudience,
    formatPodcastDate,
    formatPodcastDuration,
    podcastCountFormatter,
    podcastImageStyle,
    podcastResponseError,
} from "./podcast-display";
import styles from "./podcasts.module.css";

type PodcastShowWorkspaceProps = {
    userId: string;
    showId: string;
    onPlayPodcast: (request: PodcastPlaybackRequest) => void | Promise<void>;
    onOpenEpisode: (episodeId: string, showId: string) => void;
    onBackToDiscovery: () => void;
};

type ShowDetailResponse = {
    show?: PodcastShow;
    episodes?: PodcastEpisode[];
    error?: string;
};

type PodcastPlaybackResponse = {
    signedUrl?: string;
    episode?: PodcastEpisode;
    error?: string;
};

type LibrarySavesResponse = {
    podcastShowIds?: string[];
    podcastEpisodeIds?: string[];
    error?: string;
};

type SortOrder = "newest" | "oldest";

const PODCAST_TABS: PodcastTab[] = ["All", "Audio", "Video"];

export function PodcastShowWorkspace({
    userId,
    showId,
    onPlayPodcast,
    onOpenEpisode,
    onBackToDiscovery,
}: PodcastShowWorkspaceProps) {
    const [show, setShow] = useState<PodcastShow | null>(null);
    const [episodes, setEpisodes] = useState<PodcastEpisode[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState("");
    const [actionError, setActionError] = useState("");
    const [shareMessage, setShareMessage] = useState("");
    const [activeTab, setActiveTab] = useState<PodcastTab>("All");
    const [sortOrder, setSortOrder] = useState<SortOrder>("newest");
    const [playingEpisodeId, setPlayingEpisodeId] = useState("");
    const [savedShow, setSavedShow] = useState(false);
    const [following, setFollowing] = useState(false);
    const [savedLoading, setSavedLoading] = useState(Boolean(userId));
    const [savingKeys, setSavingKeys] = useState<Set<string>>(() => new Set());

    const loadShow = useCallback(async (signal?: AbortSignal) => {
        setLoading(true);
        setLoadError("");
        try {
            const response = await fetch(`/api/podcasts/${encodeURIComponent(showId)}`, {
                cache: "no-store",
                signal,
            });
            const body = (await response.json().catch(() => ({}))) as ShowDetailResponse;
            if (!response.ok || !body.show) {
                throw new Error(podcastResponseError(body, "This Podcast show could not be loaded."));
            }
            setShow(body.show);
            setEpisodes(Array.isArray(body.episodes) ? body.episodes : []);
        }
        catch (error) {
            if (signal?.aborted) return;
            setShow(null);
            setEpisodes([]);
            setLoadError(error instanceof Error ? error.message : "This Podcast show could not be loaded.");
        }
        finally {
            if (!signal?.aborted) setLoading(false);
        }
    }, [showId]);

    useEffect(() => {
        const controller = new AbortController();
        const timer = window.setTimeout(() => void loadShow(controller.signal), 0);
        return () => {
            window.clearTimeout(timer);
            controller.abort();
        };
    }, [loadShow]);

    useEffect(() => {
        if (!userId || !show) {
            setSavedShow(false);
            setFollowing(false);
            setSavedLoading(false);
            return;
        }
        const controller = new AbortController();
        setSavedLoading(true);
        void (async () => {
            try {
                const [savesResponse, followResponse] = await Promise.all([
                    authFetch(
                        supabase,
                        `/api/library-saves?userId=${encodeURIComponent(userId)}`,
                        { cache: "no-store", signal: controller.signal },
                    ),
                    show.userId && show.userId !== userId
                        ? authFetch(
                            supabase,
                            `/api/podcasts/follows?userId=${encodeURIComponent(userId)}&showId=${encodeURIComponent(show.id)}`,
                            { cache: "no-store", signal: controller.signal },
                        )
                        : Promise.resolve(null),
                ]);
                const savesBody = (await savesResponse.json().catch(() => ({}))) as LibrarySavesResponse;
                if (savesResponse.ok) {
                    setSavedShow((savesBody.podcastShowIds || []).includes(show.id));
                }
                if (followResponse) {
                    const followBody = await followResponse.json().catch(() => ({})) as { isFollowing?: boolean };
                    setFollowing(Boolean(followBody.isFollowing));
                }
            }
            catch {
                if (!controller.signal.aborted) {
                    setSavedShow(false);
                    setFollowing(false);
                }
            }
            finally {
                if (!controller.signal.aborted) setSavedLoading(false);
            }
        })();
        return () => controller.abort();
    }, [userId, show]);

    const visibleEpisodes = useMemo(() => {
        const filtered = episodes.filter((episode) => {
            if (activeTab === "Audio") return episode.episodeType === "audio";
            if (activeTab === "Video") return episode.episodeType === "video";
            return true;
        });
        return [...filtered].sort((left, right) => {
            const leftTime = Date.parse(left.publishedAt || left.createdAt) || 0;
            const rightTime = Date.parse(right.publishedAt || right.createdAt) || 0;
            return sortOrder === "newest" ? rightTime - leftTime : leftTime - rightTime;
        });
    }, [activeTab, episodes, sortOrder]);

    async function playEpisode(selectedEpisode: PodcastEpisode) {
        setPlayingEpisodeId(selectedEpisode.id);
        setActionError("");
        try {
            const requestInit = {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    episodeId: selectedEpisode.id,
                    countPlay: false,
                    ...(userId ? { userId } : {}),
                }),
                cache: "no-store" as const,
            };
            const response = userId
                ? await authFetch(supabase, "/api/podcasts/playback", {
                    ...requestInit,
                    requireSession: true,
                })
                : await fetch("/api/podcasts/playback", requestInit);
            const body = (await response.json().catch(() => ({}))) as PodcastPlaybackResponse;
            if (!response.ok || !body.signedUrl) {
                throw new Error(podcastResponseError(body, "This episode is not ready to play."));
            }
            const resolvedEpisode = body.episode || selectedEpisode;
            const context = episodes.map((episode) => (
                episode.id === resolvedEpisode.id ? resolvedEpisode : episode
            ));
            setEpisodes(context);
            await onPlayPodcast({
                episode: resolvedEpisode,
                context,
                playableUrl: body.signedUrl,
                countMetric: true,
            });
        }
        catch (error) {
            setActionError(error instanceof Error ? error.message : "This episode could not be played.");
        }
        finally {
            setPlayingEpisodeId("");
        }
    }

    async function toggleSaveShow() {
        if (!userId || !show) return;
        const pendingKey = `podcast_show:${show.id}`;
        if (savingKeys.has(pendingKey)) return;
        setSavingKeys((current) => new Set(current).add(pendingKey));
        setActionError("");
        try {
            const response = await authFetch(supabase, "/api/library-saves", {
                method: savedShow ? "DELETE" : "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userId, itemId: show.id, itemType: "podcast_show" }),
                cache: "no-store",
                requireSession: true,
            });
            const body = (await response.json().catch(() => ({}))) as { error?: string };
            if (!response.ok) {
                throw new Error(podcastResponseError(body, "Podcast could not be saved."));
            }
            setSavedShow((current) => !current);
        }
        catch (error) {
            setActionError(error instanceof Error ? error.message : "Your Library could not be updated.");
        }
        finally {
            setSavingKeys((current) => {
                const next = new Set(current);
                next.delete(pendingKey);
                return next;
            });
        }
    }

    async function toggleFollowShow() {
        if (!userId || !show?.id || !show.userId || show.userId === userId) return;
        const pendingKey = `follow-show:${show.id}`;
        if (savingKeys.has(pendingKey)) return;
        setSavingKeys((current) => new Set(current).add(pendingKey));
        setActionError("");
        try {
            const response = await authFetch(supabase, "/api/podcasts/follows", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    userId,
                    showId: show.id,
                    follow: !following,
                }),
            });
            const body = await response.json().catch(() => ({})) as {
                error?: string;
                isFollowing?: boolean;
                followerCount?: number;
            };
            if (!response.ok) throw new Error(podcastResponseError(body, "Follow could not be updated."));
            const nextFollowing = body.isFollowing ?? !following;
            setFollowing(nextFollowing);
            setShow((current) => current
                ? {
                    ...current,
                    followerCount: typeof body.followerCount === "number"
                        ? Math.max(0, body.followerCount)
                        : Math.max(0, (current.followerCount || 0) + (nextFollowing ? 1 : -1)),
                }
                : current);
        }
        catch (error) {
            setActionError(error instanceof Error ? error.message : "Follow could not be updated.");
        }
        finally {
            setSavingKeys((current) => {
                const next = new Set(current);
                next.delete(pendingKey);
                return next;
            });
        }
    }

    async function shareShowLink() {
        if (!show) return;
        const result = await sharePodcastLink({
            kind: "show",
            id: show.id,
            title: show.title,
            text: `Listen to ${show.title} on Music Data Base.`,
        });
        if (result === "canceled") return;
        if (result === "shared") {
            setShareMessage("Ready to share.");
            return;
        }
        if (result === "copied") {
            setShareMessage("Show link copied.");
        }
    }

    const canFollow = Boolean(userId && show?.userId && show.userId !== userId);
    const savingShow = savingKeys.has(`podcast_show:${show?.id || ""}`);
    const followPending = savingKeys.has(`follow-show:${show?.id || ""}`);

    return (
        <section className={styles.workspace} aria-labelledby="podcast-show-title">
            <div className={styles.detailNavRow}>
                <button type="button" className={styles.secondaryButton} onClick={onBackToDiscovery}>
                    <ArrowLeft size={16} aria-hidden="true" />
                    Back to Podcasts
                </button>
            </div>

            {actionError ? (
                <div className={styles.inlineAlert} role="alert">
                    <CircleAlert size={18} aria-hidden="true" />
                    <span>{actionError}</span>
                    <button type="button" onClick={() => setActionError("")}>Dismiss</button>
                </div>
            ) : null}
            {shareMessage ? (
                <div className={styles.successBanner} role="status">
                    <span>{shareMessage}</span>
                    <button type="button" onClick={() => setShareMessage("")}>Dismiss</button>
                </div>
            ) : null}

            {loading ? (
                <div className={styles.statePanel} role="status">
                    <LoaderCircle className={styles.spinner} size={28} aria-hidden="true" />
                    <strong>Loading Podcast show</strong>
                    <span>Fetching published episodes and show details.</span>
                </div>
            ) : null}

            {!loading && loadError ? (
                <div className={styles.statePanel} role="alert">
                    <CircleAlert size={32} aria-hidden="true" />
                    <strong>Podcast show unavailable</strong>
                    <span>{loadError}</span>
                    <button type="button" className={styles.primaryButton} onClick={() => void loadShow()}>
                        Try again
                    </button>
                </div>
            ) : null}

            {!loading && show ? (
                <>
                    <header className={styles.detailHeader}>
                        <div
                            className={styles.detailCover}
                            style={podcastImageStyle(show.coverImageUrl)}
                            role="img"
                            aria-label={`Cover art for ${show.title}`}
                        >
                            {!show.coverImageUrl ? <Radio size={36} aria-hidden="true" /> : null}
                            <span className={styles.coverBadge}>Podcast</span>
                        </div>
                        <div className={styles.detailCopy}>
                            <p className={styles.eyebrow}>Podcast show</p>
                            <h2 id="podcast-show-title">{show.title}</h2>
                            <p className={styles.creatorName}>{show.creatorName || "Independent creator"}</p>
                            <p className={styles.detailDescription}>
                                {show.description || "A new Podcast series."}
                            </p>
                            <div className={styles.metadata}>
                                <span>Podcast</span>
                                {show.explicitContent ? <span>Explicit</span> : null}
                                <span>
                                    {show.episodeCount || episodes.length}
                                    {" "}
                                    {(show.episodeCount || episodes.length) === 1 ? "episode" : "episodes"}
                                </span>
                                <span>
                                    {podcastCountFormatter.format(show.followerCount || 0)}
                                    {" "}
                                    {(show.followerCount || 0) === 1 ? "follower" : "followers"}
                                </span>
                            </div>
                            <div className={styles.detailActions}>
                                {canFollow ? (
                                    <button
                                        type="button"
                                        className={styles.secondaryButton}
                                        aria-pressed={following}
                                        disabled={followPending}
                                        onClick={() => void toggleFollowShow()}
                                    >
                                        {followPending
                                            ? <LoaderCircle className={styles.spinner} size={16} aria-hidden="true" />
                                            : following
                                                ? <UserCheck size={16} aria-hidden="true" />
                                                : <UserPlus size={16} aria-hidden="true" />}
                                        {following ? "Unfollow" : "Follow"}
                                    </button>
                                ) : null}
                                {userId ? (
                                    <button
                                        type="button"
                                        className={styles.secondaryButton}
                                        aria-pressed={savedShow}
                                        disabled={savedLoading || savingShow}
                                        onClick={() => void toggleSaveShow()}
                                    >
                                        {savingShow
                                            ? <LoaderCircle className={styles.spinner} size={16} aria-hidden="true" />
                                            : savedShow
                                                ? <BookmarkCheck size={16} aria-hidden="true" />
                                                : <Bookmark size={16} aria-hidden="true" />}
                                        {savedShow ? "Saved" : "Save"}
                                    </button>
                                ) : null}
                                <button type="button" className={styles.secondaryButton} onClick={() => void shareShowLink()}>
                                    <Share2 size={16} aria-hidden="true" />
                                    Share
                                </button>
                            </div>
                        </div>
                    </header>

                    <section className={styles.contentSection} aria-labelledby="podcast-show-episodes-heading">
                        <div className={styles.sectionHeading}>
                            <div>
                                <p className={styles.eyebrow}>Episodes</p>
                                <h3 id="podcast-show-episodes-heading">Episode list</h3>
                            </div>
                            <span>{visibleEpisodes.length} {visibleEpisodes.length === 1 ? "episode" : "episodes"}</span>
                        </div>
                        <div className={styles.detailToolbar}>
                            <div className={styles.tabs} role="tablist" aria-label="Episode type">
                                {PODCAST_TABS.map((tab) => (
                                    <button
                                        key={tab}
                                        type="button"
                                        role="tab"
                                        aria-selected={activeTab === tab}
                                        className={activeTab === tab ? styles.activeTab : styles.tab}
                                        onClick={() => setActiveTab(tab)}
                                    >
                                        {tab}
                                    </button>
                                ))}
                            </div>
                            <label className={styles.sortField}>
                                <span>Sort</span>
                                <select
                                    value={sortOrder}
                                    onChange={(event) => setSortOrder(event.target.value === "oldest" ? "oldest" : "newest")}
                                >
                                    <option value="newest">Newest first</option>
                                    <option value="oldest">Oldest first</option>
                                </select>
                            </label>
                        </div>

                        {visibleEpisodes.length === 0 ? (
                            <div className={styles.statePanel} role="status">
                                {activeTab === "Video" ? <Video size={28} aria-hidden="true" /> : <Headphones size={28} aria-hidden="true" />}
                                <strong>No {activeTab === "All" ? "" : `${activeTab.toLowerCase()} `}episodes</strong>
                                <span>Published episodes for this filter will appear here.</span>
                            </div>
                        ) : (
                            <div className={styles.episodeGrid}>
                                {visibleEpisodes.map((episode) => {
                                    const artworkUrl = episode.thumbnailUrl || episode.artworkUrl || show.coverImageUrl;
                                    const playing = playingEpisodeId === episode.id;
                                    const duration = formatPodcastDuration(episode.durationSeconds);
                                    const published = formatPodcastDate(episode.publishedAt);
                                    return (
                                        <article
                                            key={episode.id}
                                            className={`${styles.episodeCard} ${
                                                episode.episodeType === "video" ? styles.episodeCardVideo : styles.episodeCardAudio
                                            }`}
                                        >
                                            <button
                                                type="button"
                                                className={styles.episodeArtwork}
                                                style={podcastImageStyle(artworkUrl)}
                                                onClick={() => onOpenEpisode(episode.id, show.id)}
                                                aria-label={`Open ${episode.title}`}
                                            >
                                                {!artworkUrl
                                                    ? episode.episodeType === "video"
                                                        ? <Video size={24} aria-hidden="true" />
                                                        : <Headphones size={24} aria-hidden="true" />
                                                    : null}
                                                <span className={episode.episodeType === "video" ? styles.videoBadge : styles.audioBadge}>
                                                    {episode.episodeType === "video"
                                                        ? <Video size={13} aria-hidden="true" />
                                                        : <Headphones size={13} aria-hidden="true" />}
                                                    {episode.episodeType === "video" ? "Video" : "Audio"}
                                                </span>
                                            </button>
                                            <div className={styles.cardBody}>
                                                <button
                                                    type="button"
                                                    className={styles.titleLink}
                                                    onClick={() => onOpenEpisode(episode.id, show.id)}
                                                >
                                                    <h4>{episode.title}</h4>
                                                </button>
                                                <p className={styles.creatorName}>{episode.creatorName || show.creatorName || "Independent creator"}</p>
                                                <div className={styles.metadata}>
                                                    {episode.seasonNumber != null ? <span>Season {episode.seasonNumber}</span> : null}
                                                    <span>Episode {episode.episodeNumber}</span>
                                                    <span>{formatPodcastAudience(episode)}</span>
                                                    <span>{podcastCountFormatter.format(episode.likeCount || 0)} {(episode.likeCount || 0) === 1 ? "like" : "likes"}</span>
                                                    {published ? <span>{published}</span> : null}
                                                    {duration ? <span>{duration}</span> : null}
                                                </div>
                                                <div className={styles.cardActions}>
                                                    <button
                                                        type="button"
                                                        className={styles.playButton}
                                                        disabled={Boolean(playingEpisodeId)}
                                                        onClick={() => void playEpisode(episode)}
                                                        aria-label={`${episode.episodeType === "video" ? "Watch" : "Play"} ${episode.title}`}
                                                    >
                                                        {playing
                                                            ? <LoaderCircle className={styles.spinner} size={18} aria-hidden="true" />
                                                            : <Play size={18} fill="currentColor" aria-hidden="true" />}
                                                        {playing ? "Opening…" : episode.episodeType === "video" ? "Watch" : "Play"}
                                                    </button>
                                                </div>
                                            </div>
                                        </article>
                                    );
                                })}
                            </div>
                        )}
                    </section>
                </>
            ) : null}
        </section>
    );
}
