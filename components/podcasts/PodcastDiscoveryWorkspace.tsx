"use client";

import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
    Bookmark,
    BookmarkCheck,
    CircleAlert,
    Heart,
    Headphones,
    LoaderCircle,
    Play,
    Radio,
    RefreshCw,
    UserPlus,
    UserCheck,
    Video,
} from "lucide-react";
import { authFetch } from "@/lib/client-api-auth";
import {
    type PodcastEpisode,
    type PodcastPlaybackRequest,
    type PodcastShow,
    type PodcastTab,
} from "@/lib/podcast-types";
import { supabase } from "@/lib/supabase";
import styles from "./podcasts.module.css";

type PodcastDiscoveryWorkspaceProps = {
    userId: string;
    onPlayPodcast: (request: PodcastPlaybackRequest) => void | Promise<void>;
};

type PodcastCollectionResponse = {
    shows?: PodcastShow[];
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

type PodcastLikesResponse = {
    likedEpisodeIds?: string[];
    error?: string;
};

type SaveKind = "podcast_show" | "podcast_episode";

const PODCAST_TABS: PodcastTab[] = ["All", "Audio", "Video"];
const countFormatter = new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 });

function imageStyle(url: string): CSSProperties | undefined {
    const cleanUrl = url.trim();
    return cleanUrl
        ? { backgroundImage: `linear-gradient(180deg, transparent 55%, rgba(4, 8, 22, 0.38)), url(${JSON.stringify(cleanUrl)})` }
        : undefined;
}

function formatDuration(durationSeconds: number | null) {
    if (durationSeconds == null || !Number.isFinite(durationSeconds) || durationSeconds < 0) return "";
    const total = Math.round(durationSeconds);
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;
    return hours > 0
        ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
        : `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatAudienceCount(episode: PodcastEpisode) {
    const metricCount = episode.episodeType === "video" ? episode.viewCount : episode.playCount;
    const metricNoun = episode.episodeType === "video"
        ? (metricCount === 1 ? "view" : "views")
        : (metricCount === 1 ? "play" : "plays");
    const likes = Math.max(0, episode.likeCount || 0);
    const likeNoun = likes === 1 ? "like" : "likes";
    return `${countFormatter.format(metricCount)} ${metricNoun} · ${countFormatter.format(likes)} ${likeNoun}`;
}

function responseError(body: { error?: string }, fallback: string) {
    return typeof body.error === "string" && body.error.trim() ? body.error : fallback;
}

export function PodcastDiscoveryWorkspace({
    userId,
    onPlayPodcast,
}: PodcastDiscoveryWorkspaceProps) {
    const [activeTab, setActiveTab] = useState<PodcastTab>("All");
    const [shows, setShows] = useState<PodcastShow[]>([]);
    const [episodes, setEpisodes] = useState<PodcastEpisode[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState("");
    const [actionError, setActionError] = useState("");
    const [playingEpisodeId, setPlayingEpisodeId] = useState("");
    const [savedShowIds, setSavedShowIds] = useState<Set<string>>(() => new Set());
    const [savedEpisodeIds, setSavedEpisodeIds] = useState<Set<string>>(() => new Set());
    const [likedEpisodeIds, setLikedEpisodeIds] = useState<Set<string>>(() => new Set());
    const [followingCreatorIds, setFollowingCreatorIds] = useState<Set<string>>(() => new Set());
    const [savedLoading, setSavedLoading] = useState(Boolean(userId));
    const [savingKeys, setSavingKeys] = useState<Set<string>>(() => new Set());
    const [followKeys, setFollowKeys] = useState<Set<string>>(() => new Set());

    const loadPodcasts = useCallback(async (signal?: AbortSignal) => {
        setLoading(true);
        setLoadError("");
        const type = activeTab === "All" ? "" : `?type=${activeTab.toLowerCase()}`;
        try {
            const response = await fetch(`/api/podcasts${type}`, {
                cache: "no-store",
                signal,
            });
            const body = (await response.json().catch(() => ({}))) as PodcastCollectionResponse;
            if (!response.ok) {
                throw new Error(responseError(body, "Podcasts could not be loaded."));
            }
            setShows(Array.isArray(body.shows) ? body.shows : []);
            setEpisodes(Array.isArray(body.episodes) ? body.episodes : []);
        }
        catch (error) {
            if (signal?.aborted) return;
            setShows([]);
            setEpisodes([]);
            setLoadError(error instanceof Error ? error.message : "Podcasts could not be loaded.");
        }
        finally {
            if (!signal?.aborted) setLoading(false);
        }
    }, [activeTab]);

    useEffect(() => {
        const controller = new AbortController();
        const timer = window.setTimeout(() => void loadPodcasts(controller.signal), 0);
        return () => {
            window.clearTimeout(timer);
            controller.abort();
        };
    }, [loadPodcasts]);

    useEffect(() => {
        const controller = new AbortController();
        const timer = window.setTimeout(() => {
            if (!userId) {
                setSavedShowIds(new Set());
                setSavedEpisodeIds(new Set());
                setLikedEpisodeIds(new Set());
                setFollowingCreatorIds(new Set());
                setSavedLoading(false);
                return;
            }

            setSavedLoading(true);
            void (async () => {
                try {
                    const response = await authFetch(
                        supabase,
                        `/api/library-saves?userId=${encodeURIComponent(userId)}`,
                        { cache: "no-store", signal: controller.signal },
                    );
                    const body = (await response.json().catch(() => ({}))) as LibrarySavesResponse;
                    if (!response.ok) {
                        throw new Error(responseError(body, "Saved podcasts could not be loaded."));
                    }
                    setSavedShowIds(new Set(Array.isArray(body.podcastShowIds) ? body.podcastShowIds : []));
                    setSavedEpisodeIds(new Set(Array.isArray(body.podcastEpisodeIds) ? body.podcastEpisodeIds : []));
                    const likesResponse = await authFetch(
                        supabase,
                        `/api/podcasts/likes?userId=${encodeURIComponent(userId)}`,
                        { cache: "no-store", signal: controller.signal },
                    );
                    const likesBody = (await likesResponse.json().catch(() => ({}))) as PodcastLikesResponse;
                    if (likesResponse.ok) {
                        setLikedEpisodeIds(new Set(Array.isArray(likesBody.likedEpisodeIds) ? likesBody.likedEpisodeIds : []));
                    }
                }
                catch (error) {
                    if (controller.signal.aborted) return;
                    setActionError(error instanceof Error ? error.message : "Saved podcasts could not be loaded.");
                }
                finally {
                    if (!controller.signal.aborted) setSavedLoading(false);
                }
            })();
        }, 0);
        return () => {
            window.clearTimeout(timer);
            controller.abort();
        };
    }, [userId]);

    useEffect(() => {
        if (!userId || shows.length === 0) {
            setFollowingCreatorIds(new Set());
            return;
        }
        const controller = new AbortController();
        const creatorIds = [...new Set(shows.map((show) => show.userId).filter(Boolean))];
        void (async () => {
            try {
                const next = new Set<string>();
                await Promise.all(creatorIds.map(async (targetUserId) => {
                    if (targetUserId === userId) return;
                    const response = await authFetch(
                        supabase,
                        `/api/follows?userId=${encodeURIComponent(userId)}&targetUserId=${encodeURIComponent(targetUserId)}`,
                        { cache: "no-store", signal: controller.signal },
                    );
                    const body = await response.json().catch(() => ({})) as { isFollowing?: boolean };
                    if (body.isFollowing) next.add(targetUserId);
                }));
                if (!controller.signal.aborted) setFollowingCreatorIds(next);
            }
            catch {
                if (!controller.signal.aborted) setFollowingCreatorIds(new Set());
            }
        })();
        return () => controller.abort();
    }, [userId, shows]);

    async function toggleFollowCreator(creatorUserId: string) {
        if (!userId || !creatorUserId || creatorUserId === userId) return;
        const pendingKey = `follow:${creatorUserId}`;
        if (followKeys.has(pendingKey)) return;
        const currentlyFollowing = followingCreatorIds.has(creatorUserId);
        setFollowKeys((current) => new Set(current).add(pendingKey));
        setActionError("");
        try {
            const response = await authFetch(supabase, "/api/follows", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    userId,
                    targetUserId: creatorUserId,
                    follow: !currentlyFollowing,
                }),
            });
            const body = await response.json().catch(() => ({})) as { error?: string; isFollowing?: boolean };
            if (!response.ok) throw new Error(responseError(body, "Follow could not be updated."));
            setFollowingCreatorIds((current) => {
                const next = new Set(current);
                if (body.isFollowing ?? !currentlyFollowing) next.add(creatorUserId);
                else next.delete(creatorUserId);
                return next;
            });
            setShows((current) => current.map((show) => {
                if (show.userId !== creatorUserId) return show;
                const delta = (body.isFollowing ?? !currentlyFollowing) ? 1 : -1;
                return {
                    ...show,
                    followerCount: Math.max(0, (show.followerCount || 0) + delta),
                };
            }));
        }
        catch (error) {
            setActionError(error instanceof Error ? error.message : "Follow could not be updated.");
        }
        finally {
            setFollowKeys((current) => {
                const next = new Set(current);
                next.delete(pendingKey);
                return next;
            });
        }
    }

    const visibleShows = useMemo(() => {
        if (activeTab === "All") return shows;
        const showIds = new Set(episodes.map((episode) => episode.podcastId));
        return shows.filter((show) => showIds.has(show.id));
    }, [activeTab, episodes, shows]);

    async function playEpisode(selectedEpisode: PodcastEpisode) {
        setPlayingEpisodeId(selectedEpisode.id);
        setActionError("");
        try {
            const bodyPayload = {
                episodeId: selectedEpisode.id,
                countPlay: false,
                ...(userId ? { userId } : {}),
            };
            const requestInit = {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(bodyPayload),
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
                throw new Error(responseError(body, "This episode is not ready to play."));
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

    async function toggleSave(itemId: string, itemType: SaveKind) {
        if (!userId) return;
        const savedSet = itemType === "podcast_show" ? savedShowIds : savedEpisodeIds;
        const isSaved = savedSet.has(itemId);
        const pendingKey = `${itemType}:${itemId}`;
        setSavingKeys((current) => new Set(current).add(pendingKey));
        setActionError("");
        try {
            const response = await authFetch(supabase, "/api/library-saves", {
                method: isSaved ? "DELETE" : "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userId, itemId, itemType }),
                cache: "no-store",
                requireSession: true,
            });
            const body = (await response.json().catch(() => ({}))) as { error?: string };
            if (!response.ok) {
                throw new Error(responseError(body, isSaved ? "Podcast could not be removed." : "Podcast could not be saved."));
            }
            const update = (current: Set<string>) => {
                const next = new Set(current);
                if (isSaved) next.delete(itemId);
                else next.add(itemId);
                return next;
            };
            if (itemType === "podcast_show") setSavedShowIds(update);
            else setSavedEpisodeIds(update);
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

    async function toggleLike(episode: PodcastEpisode) {
        if (!userId) return;
        const pendingKey = `like:${episode.id}`;
        if (savingKeys.has(pendingKey)) return;
        const currentlyLiked = likedEpisodeIds.has(episode.id);
        setSavingKeys((current) => new Set(current).add(pendingKey));
        setActionError("");
        try {
            const response = await authFetch(supabase, "/api/podcasts/likes", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    userId,
                    episodeId: episode.id,
                    like: !currentlyLiked,
                }),
                cache: "no-store",
                requireSession: true,
            });
            const body = (await response.json().catch(() => ({}))) as {
                error?: string;
                liked?: boolean;
                likeCount?: number;
            };
            if (!response.ok) throw new Error(responseError(body, "Like could not be updated."));
            const liked = body.liked ?? !currentlyLiked;
            setLikedEpisodeIds((current) => {
                const next = new Set(current);
                if (liked) next.add(episode.id);
                else next.delete(episode.id);
                return next;
            });
            setEpisodes((current) => current.map((item) => {
                if (item.id !== episode.id) return item;
                return {
                    ...item,
                    likeCount: typeof body.likeCount === "number"
                        ? Math.max(0, body.likeCount)
                        : Math.max(0, (item.likeCount || 0) + (liked ? 1 : -1)),
                };
            }));
        }
        catch (error) {
            setActionError(error instanceof Error ? error.message : "Like could not be updated.");
        }
        finally {
            setSavingKeys((current) => {
                const next = new Set(current);
                next.delete(pendingKey);
                return next;
            });
        }
    }

    const isEmpty = !loading && !loadError && visibleShows.length === 0 && episodes.length === 0;

    return (
        <section className={styles.workspace} aria-labelledby="podcast-discovery-title">
            <header className={styles.discoveryHeader}>
                <div>
                    <p className={styles.eyebrow}>Listen and watch</p>
                    <h2 id="podcast-discovery-title">Podcast discovery</h2>
                    <p className={styles.lede}>New conversations, stories, and video shows from ZMusic creators.</p>
                </div>
                <Radio className={styles.headerIcon} aria-hidden="true" />
            </header>

            <div className={styles.tabs} role="tablist" aria-label="Filter podcasts by format">
                {PODCAST_TABS.map((tab) => (
                    <button
                        key={tab}
                        type="button"
                        role="tab"
                        aria-selected={activeTab === tab}
                        className={activeTab === tab ? styles.activeTab : styles.tab}
                        onClick={() => setActiveTab(tab)}
                    >
                        {tab === "Audio" ? <Headphones size={17} aria-hidden="true" /> : null}
                        {tab === "Video" ? <Video size={17} aria-hidden="true" /> : null}
                        {tab}
                    </button>
                ))}
            </div>

            {actionError ? (
                <div className={styles.inlineAlert} role="alert">
                    <CircleAlert size={18} aria-hidden="true" />
                    <span>{actionError}</span>
                    <button type="button" onClick={() => setActionError("")} aria-label="Dismiss message">Dismiss</button>
                </div>
            ) : null}

            {loading ? (
                <div className={styles.statePanel} role="status" aria-live="polite">
                    <LoaderCircle className={styles.spinner} size={28} aria-hidden="true" />
                    <strong>Loading podcasts</strong>
                    <span>Finding the latest published shows and episodes.</span>
                </div>
            ) : null}

            {!loading && loadError ? (
                <div className={styles.statePanel} role="alert">
                    <CircleAlert size={30} aria-hidden="true" />
                    <strong>Podcasts are unavailable</strong>
                    <span>{loadError}</span>
                    <button type="button" className={styles.primaryButton} onClick={() => void loadPodcasts()}>
                        <RefreshCw size={17} aria-hidden="true" />
                        Try again
                    </button>
                </div>
            ) : null}

            {isEmpty ? (
                <div className={styles.statePanel} role="status">
                    {activeTab === "Video"
                        ? <Video size={32} aria-hidden="true" />
                        : <Headphones size={32} aria-hidden="true" />}
                    <strong>No {activeTab === "All" ? "" : `${activeTab.toLowerCase()} `}podcasts yet</strong>
                    <span>Published podcasts will appear here as creators add them.</span>
                </div>
            ) : null}

            {!loading && !loadError && visibleShows.length > 0 ? (
                <section className={styles.contentSection} aria-labelledby="podcast-shows-heading">
                    <div className={styles.sectionHeading}>
                        <div>
                            <p className={styles.eyebrow}>Browse by series</p>
                            <h3 id="podcast-shows-heading">Podcast shows</h3>
                        </div>
                        <span>{visibleShows.length} {visibleShows.length === 1 ? "show" : "shows"}</span>
                    </div>
                    <div className={styles.showGrid}>
                        {visibleShows.map((show) => {
                            const saved = savedShowIds.has(show.id);
                            const saving = savingKeys.has(`podcast_show:${show.id}`);
                            const following = followingCreatorIds.has(show.userId);
                            const followPending = followKeys.has(`follow:${show.userId}`);
                            const canFollow = Boolean(userId && show.userId && show.userId !== userId);
                            return (
                                <article key={show.id} className={styles.showCard}>
                                    <div
                                        className={styles.showCover}
                                        style={imageStyle(show.coverImageUrl)}
                                        role="img"
                                        aria-label={`Cover art for ${show.title}`}
                                    >
                                        {!show.coverImageUrl ? <Radio size={34} aria-hidden="true" /> : null}
                                        <span className={styles.coverBadge}>Podcast</span>
                                    </div>
                                    <div className={styles.cardBody}>
                                        <div className={styles.cardTitleRow}>
                                            <div className={styles.minWidthZero}>
                                                <h4>{show.title}</h4>
                                                <p>{show.creatorName || "Independent creator"}</p>
                                            </div>
                                            {userId ? (
                                                <button
                                                    type="button"
                                                    className={styles.iconButton}
                                                    aria-label={saved ? `Remove ${show.title} from Library` : `Save ${show.title} to Library`}
                                                    aria-pressed={saved}
                                                    title={saved ? "Remove from Library" : "Save to Library"}
                                                    disabled={savedLoading || saving}
                                                    onClick={() => void toggleSave(show.id, "podcast_show")}
                                                >
                                                    {saving
                                                        ? <LoaderCircle className={styles.spinner} size={19} aria-hidden="true" />
                                                        : saved
                                                            ? <BookmarkCheck size={19} aria-hidden="true" />
                                                            : <Bookmark size={19} aria-hidden="true" />}
                                                </button>
                                            ) : null}
                                        </div>
                                        <p className={styles.description}>{show.description || "A new Podcast series."}</p>
                                        <div className={styles.metadata}>
                                            <span>{show.category || "Podcast"}</span>
                                            {typeof show.episodeCount === "number" ? (
                                                <span>{show.episodeCount} {show.episodeCount === 1 ? "episode" : "episodes"}</span>
                                            ) : null}
                                            <span>{countFormatter.format(show.followerCount || 0)} {(show.followerCount || 0) === 1 ? "follower" : "followers"}</span>
                                            {show.explicitContent ? <span>Explicit</span> : null}
                                        </div>
                                        {canFollow ? (
                                            <div className={styles.cardActions}>
                                                <button
                                                    type="button"
                                                    className={styles.secondaryButton}
                                                    aria-pressed={following}
                                                    disabled={followPending}
                                                    onClick={() => void toggleFollowCreator(show.userId)}
                                                    aria-label={following ? `Unfollow ${show.creatorName || "creator"}` : `Follow ${show.creatorName || "creator"}`}
                                                >
                                                    {followPending
                                                        ? <LoaderCircle className={styles.spinner} size={16} aria-hidden="true" />
                                                        : following
                                                            ? <UserCheck size={16} aria-hidden="true" />
                                                            : <UserPlus size={16} aria-hidden="true" />}
                                                    {following ? "Following" : "Follow"}
                                                </button>
                                            </div>
                                        ) : null}
                                    </div>
                                </article>
                            );
                        })}
                    </div>
                </section>
            ) : null}

            {!loading && !loadError && episodes.length > 0 ? (
                <section className={styles.contentSection} aria-labelledby="podcast-episodes-heading">
                    <div className={styles.sectionHeading}>
                        <div>
                            <p className={styles.eyebrow}>Ready to play</p>
                            <h3 id="podcast-episodes-heading">Latest episodes</h3>
                        </div>
                        <span>{episodes.length} {episodes.length === 1 ? "episode" : "episodes"}</span>
                    </div>
                    <div className={styles.episodeGrid}>
                        {episodes.map((episode) => {
                            const artworkUrl = episode.thumbnailUrl || episode.artworkUrl;
                            const saved = savedEpisodeIds.has(episode.id);
                            const liked = likedEpisodeIds.has(episode.id);
                            const saving = savingKeys.has(`podcast_episode:${episode.id}`);
                            const liking = savingKeys.has(`like:${episode.id}`);
                            const playing = playingEpisodeId === episode.id;
                            const duration = formatDuration(episode.durationSeconds);
                            return (
                                <article
                                    key={episode.id}
                                    className={`${styles.episodeCard} ${
                                        episode.episodeType === "video" ? styles.episodeCardVideo : styles.episodeCardAudio
                                    }`}
                                >
                                    <div
                                        className={styles.episodeArtwork}
                                        style={imageStyle(artworkUrl)}
                                        role="img"
                                        aria-label={`Artwork for ${episode.title}`}
                                    >
                                        {!artworkUrl
                                            ? episode.episodeType === "video"
                                                ? <Video size={30} aria-hidden="true" />
                                                : <Headphones size={30} aria-hidden="true" />
                                            : null}
                                        <span className={episode.episodeType === "video" ? styles.videoBadge : styles.audioBadge}>
                                            {episode.episodeType === "video"
                                                ? <Video size={13} aria-hidden="true" />
                                                : <Headphones size={13} aria-hidden="true" />}
                                            {episode.episodeType === "video" ? "Video" : "Audio"}
                                        </span>
                                    </div>
                                    <div className={styles.cardBody}>
                                        <p className={styles.showName}>{episode.podcastTitle}</p>
                                        <h4>{episode.title}</h4>
                                        <p className={styles.creatorName}>{episode.creatorName || "Independent creator"}</p>
                                        <p className={styles.description}>{episode.description || "Listen to this Podcast episode."}</p>
                                        <div className={styles.metadata}>
                                            <span>S{episode.seasonNumber || 1} · E{episode.episodeNumber}</span>
                                            {duration ? <span>{duration}</span> : null}
                                            <span>{formatAudienceCount(episode)}</span>
                                        </div>
                                        <div className={styles.cardActions}>
                                            <button
                                                type="button"
                                                className={styles.playButton}
                                                disabled={Boolean(playingEpisodeId)}
                                                onClick={() => void playEpisode(episode)}
                                                aria-label={`Play ${episode.title}`}
                                            >
                                                {playing
                                                    ? <LoaderCircle className={styles.spinner} size={18} aria-hidden="true" />
                                                    : <Play size={18} fill="currentColor" aria-hidden="true" />}
                                                {playing ? "Opening…" : episode.episodeType === "video" ? "Watch" : "Play"}
                                            </button>
                                            {userId ? (
                                                <>
                                                    <button
                                                        type="button"
                                                        className={styles.secondaryButton}
                                                        aria-label={liked ? `Unlike ${episode.title}` : `Like ${episode.title}`}
                                                        aria-pressed={liked}
                                                        disabled={savedLoading || liking}
                                                        onClick={() => void toggleLike(episode)}
                                                    >
                                                        {liking
                                                            ? <LoaderCircle className={styles.spinner} size={18} aria-hidden="true" />
                                                            : <Heart size={18} fill={liked ? "currentColor" : "none" } aria-hidden="true" />}
                                                        {liked ? "Liked" : "Like"}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className={styles.secondaryButton}
                                                        aria-label={saved ? `Remove ${episode.title} from Library` : `Save ${episode.title} to Library`}
                                                        aria-pressed={saved}
                                                        disabled={savedLoading || saving}
                                                        onClick={() => void toggleSave(episode.id, "podcast_episode")}
                                                    >
                                                        {saving
                                                            ? <LoaderCircle className={styles.spinner} size={18} aria-hidden="true" />
                                                            : saved
                                                                ? <BookmarkCheck size={18} aria-hidden="true" />
                                                                : <Bookmark size={18} aria-hidden="true" />}
                                                        {saved ? "Saved" : "Save"}
                                                    </button>
                                                </>
                                            ) : null}
                                        </div>
                                    </div>
                                </article>
                            );
                        })}
                    </div>
                </section>
            ) : null}
        </section>
    );
}
