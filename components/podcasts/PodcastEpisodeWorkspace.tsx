"use client";

import { useCallback, useEffect, useState } from "react";
import {
    ArrowLeft,
    Bookmark,
    BookmarkCheck,
    CircleAlert,
    Headphones,
    Heart,
    LoaderCircle,
    Play,
    Share2,
    UserCheck,
    UserPlus,
    Video,
} from "lucide-react";
import { authFetch } from "@/lib/client-api-auth";
import { podcastShareUrl } from "@/lib/podcast-routes";
import {
    type PodcastEpisode,
    type PodcastPlaybackRequest,
    type PodcastShow,
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

type PodcastEpisodeWorkspaceProps = {
    userId: string;
    episodeId: string;
    onPlayPodcast: (request: PodcastPlaybackRequest) => void | Promise<void>;
    onOpenShow: (showId: string) => void;
};

type EpisodeDetailResponse = {
    episode?: PodcastEpisode;
    show?: PodcastShow;
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

export function PodcastEpisodeWorkspace({
    userId,
    episodeId,
    onPlayPodcast,
    onOpenShow,
}: PodcastEpisodeWorkspaceProps) {
    const [episode, setEpisode] = useState<PodcastEpisode | null>(null);
    const [show, setShow] = useState<PodcastShow | null>(null);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState("");
    const [actionError, setActionError] = useState("");
    const [shareMessage, setShareMessage] = useState("");
    const [playing, setPlaying] = useState(false);
    const [liked, setLiked] = useState(false);
    const [saved, setSaved] = useState(false);
    const [following, setFollowing] = useState(false);
    const [savedLoading, setSavedLoading] = useState(Boolean(userId));
    const [savingKeys, setSavingKeys] = useState<Set<string>>(() => new Set());

    const loadEpisode = useCallback(async (signal?: AbortSignal) => {
        setLoading(true);
        setLoadError("");
        try {
            const response = await fetch(`/api/podcasts/episodes/${encodeURIComponent(episodeId)}`, {
                cache: "no-store",
                signal,
            });
            const body = (await response.json().catch(() => ({}))) as EpisodeDetailResponse;
            if (!response.ok || !body.episode) {
                throw new Error(podcastResponseError(body, "This Podcast episode could not be loaded."));
            }
            setEpisode(body.episode);
            setShow(body.show || null);
        }
        catch (error) {
            if (signal?.aborted) return;
            setEpisode(null);
            setShow(null);
            setLoadError(error instanceof Error ? error.message : "This Podcast episode could not be loaded.");
        }
        finally {
            if (!signal?.aborted) setLoading(false);
        }
    }, [episodeId]);

    useEffect(() => {
        const controller = new AbortController();
        const timer = window.setTimeout(() => void loadEpisode(controller.signal), 0);
        return () => {
            window.clearTimeout(timer);
            controller.abort();
        };
    }, [loadEpisode]);

    useEffect(() => {
        if (!userId || !episode) {
            setLiked(false);
            setSaved(false);
            setFollowing(false);
            setSavedLoading(false);
            return;
        }
        const controller = new AbortController();
        setSavedLoading(true);
        void (async () => {
            try {
                const creatorId = episode.userId;
                const [savesResponse, likesResponse, followResponse] = await Promise.all([
                    authFetch(
                        supabase,
                        `/api/library-saves?userId=${encodeURIComponent(userId)}`,
                        { cache: "no-store", signal: controller.signal },
                    ),
                    authFetch(
                        supabase,
                        `/api/podcasts/likes?userId=${encodeURIComponent(userId)}`,
                        { cache: "no-store", signal: controller.signal },
                    ),
                    creatorId && creatorId !== userId
                        ? authFetch(
                            supabase,
                            `/api/follows?userId=${encodeURIComponent(userId)}&targetUserId=${encodeURIComponent(creatorId)}`,
                            { cache: "no-store", signal: controller.signal },
                        )
                        : Promise.resolve(null),
                ]);
                const savesBody = (await savesResponse.json().catch(() => ({}))) as LibrarySavesResponse;
                if (savesResponse.ok) {
                    setSaved((savesBody.podcastEpisodeIds || []).includes(episode.id));
                }
                const likesBody = (await likesResponse.json().catch(() => ({}))) as PodcastLikesResponse;
                if (likesResponse.ok) {
                    setLiked((likesBody.likedEpisodeIds || []).includes(episode.id));
                }
                if (followResponse) {
                    const followBody = await followResponse.json().catch(() => ({})) as { isFollowing?: boolean };
                    setFollowing(Boolean(followBody.isFollowing));
                }
            }
            catch {
                if (!controller.signal.aborted) {
                    setLiked(false);
                    setSaved(false);
                    setFollowing(false);
                }
            }
            finally {
                if (!controller.signal.aborted) setSavedLoading(false);
            }
        })();
        return () => controller.abort();
    }, [userId, episode]);

    async function playCurrentEpisode() {
        if (!episode) return;
        setPlaying(true);
        setActionError("");
        try {
            const requestInit = {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    episodeId: episode.id,
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
            const resolvedEpisode = body.episode || episode;
            setEpisode(resolvedEpisode);
            await onPlayPodcast({
                episode: resolvedEpisode,
                context: [resolvedEpisode],
                playableUrl: body.signedUrl,
                countMetric: true,
            });
        }
        catch (error) {
            setActionError(error instanceof Error ? error.message : "This episode could not be played.");
        }
        finally {
            setPlaying(false);
        }
    }

    async function toggleLike() {
        if (!userId || !episode) return;
        const pendingKey = `like:${episode.id}`;
        if (savingKeys.has(pendingKey)) return;
        setSavingKeys((current) => new Set(current).add(pendingKey));
        setActionError("");
        try {
            const response = await authFetch(supabase, "/api/podcasts/likes", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    userId,
                    episodeId: episode.id,
                    like: !liked,
                }),
                cache: "no-store",
                requireSession: true,
            });
            const body = (await response.json().catch(() => ({}))) as {
                error?: string;
                liked?: boolean;
                likeCount?: number;
            };
            if (!response.ok) throw new Error(podcastResponseError(body, "Like could not be updated."));
            const nextLiked = body.liked ?? !liked;
            setLiked(nextLiked);
            setEpisode((current) => current
                ? {
                    ...current,
                    likeCount: typeof body.likeCount === "number"
                        ? Math.max(0, body.likeCount)
                        : Math.max(0, (current.likeCount || 0) + (nextLiked ? 1 : -1)),
                }
                : current);
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

    async function toggleSave() {
        if (!userId || !episode) return;
        const pendingKey = `podcast_episode:${episode.id}`;
        if (savingKeys.has(pendingKey)) return;
        setSavingKeys((current) => new Set(current).add(pendingKey));
        setActionError("");
        try {
            const response = await authFetch(supabase, "/api/library-saves", {
                method: saved ? "DELETE" : "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userId, itemId: episode.id, itemType: "podcast_episode" }),
                cache: "no-store",
                requireSession: true,
            });
            const body = (await response.json().catch(() => ({}))) as { error?: string };
            if (!response.ok) {
                throw new Error(podcastResponseError(body, "Podcast could not be saved."));
            }
            setSaved((current) => !current);
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

    async function toggleFollowCreator() {
        const creatorId = episode?.userId || show?.userId || "";
        if (!userId || !creatorId || creatorId === userId) return;
        const pendingKey = `follow:${creatorId}`;
        if (savingKeys.has(pendingKey)) return;
        setSavingKeys((current) => new Set(current).add(pendingKey));
        setActionError("");
        try {
            const response = await authFetch(supabase, "/api/follows", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    userId,
                    targetUserId: creatorId,
                    follow: !following,
                }),
            });
            const body = await response.json().catch(() => ({})) as { error?: string; isFollowing?: boolean };
            if (!response.ok) throw new Error(podcastResponseError(body, "Follow could not be updated."));
            setFollowing(body.isFollowing ?? !following);
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

    async function copyShareLink() {
        if (!episode) return;
        const shareUrl = podcastShareUrl("episode", episode.id);
        try {
            await navigator.clipboard.writeText(shareUrl);
            setShareMessage("Episode link copied.");
        }
        catch {
            window.prompt("Copy this link", shareUrl);
        }
    }

    const artworkUrl = episode
        ? (episode.thumbnailUrl || episode.artworkUrl || show?.coverImageUrl || "")
        : "";
    const canFollow = Boolean(userId && episode?.userId && episode.userId !== userId);
    const liking = savingKeys.has(`like:${episode?.id || ""}`);
    const saving = savingKeys.has(`podcast_episode:${episode?.id || ""}`);
    const followPending = savingKeys.has(`follow:${episode?.userId || show?.userId || ""}`);
    const published = formatPodcastDate(episode?.publishedAt);
    const duration = formatPodcastDuration(episode?.durationSeconds ?? null);
    const showId = episode?.podcastId || show?.id || "";

    return (
        <section className={styles.workspace} aria-labelledby="podcast-episode-title">
            <div className={styles.detailNavRow}>
                <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={() => {
                        if (showId) onOpenShow(showId);
                    }}
                    disabled={!showId}
                >
                    <ArrowLeft size={16} aria-hidden="true" />
                    Back to Podcast show
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
                    <strong>Loading Podcast episode</strong>
                    <span>Fetching episode details.</span>
                </div>
            ) : null}

            {!loading && loadError ? (
                <div className={styles.statePanel} role="alert">
                    <CircleAlert size={32} aria-hidden="true" />
                    <strong>Podcast episode unavailable</strong>
                    <span>{loadError}</span>
                    <button type="button" className={styles.primaryButton} onClick={() => void loadEpisode()}>
                        Try again
                    </button>
                </div>
            ) : null}

            {!loading && episode ? (
                <header className={`${styles.detailHeader} ${styles.episodeDetailHeader}`}>
                    <div
                        className={`${styles.detailCover} ${
                            episode.episodeType === "video" ? styles.episodeDetailCoverVideo : ""
                        }`}
                        style={podcastImageStyle(artworkUrl)}
                        role="img"
                        aria-label={`Artwork for ${episode.title}`}
                    >
                        {!artworkUrl
                            ? episode.episodeType === "video"
                                ? <Video size={32} aria-hidden="true" />
                                : <Headphones size={32} aria-hidden="true" />
                            : null}
                        <span className={episode.episodeType === "video" ? styles.videoBadge : styles.audioBadge}>
                            {episode.episodeType === "video"
                                ? <Video size={13} aria-hidden="true" />
                                : <Headphones size={13} aria-hidden="true" />}
                            {episode.episodeType === "video" ? "Video Podcast" : "Audio Podcast"}
                        </span>
                    </div>
                    <div className={styles.detailCopy}>
                        <p className={styles.eyebrow}>Podcast episode</p>
                        <h2 id="podcast-episode-title">{episode.title}</h2>
                        {showId ? (
                            <button
                                type="button"
                                className={styles.showTitleLink}
                                onClick={() => onOpenShow(showId)}
                            >
                                {episode.podcastTitle || show?.title || "Podcast show"}
                            </button>
                        ) : (
                            <p className={styles.showName}>{episode.podcastTitle || "Podcast show"}</p>
                        )}
                        <p className={styles.creatorName}>{episode.creatorName || show?.creatorName || "Independent creator"}</p>
                        <p className={styles.detailDescription}>
                            {episode.description || "Listen to this Podcast episode."}
                        </p>
                        <div className={styles.metadata}>
                            {episode.seasonNumber != null ? <span>Season {episode.seasonNumber}</span> : null}
                            <span>Episode {episode.episodeNumber}</span>
                            {published ? <span>{published}</span> : null}
                            {duration ? <span>{duration}</span> : null}
                            <span>{formatPodcastAudience(episode)}</span>
                            <span>{podcastCountFormatter.format(episode.likeCount || 0)} {(episode.likeCount || 0) === 1 ? "like" : "likes"}</span>
                        </div>
                        <div className={styles.detailActions}>
                            <button
                                type="button"
                                className={styles.playButton}
                                disabled={playing}
                                onClick={() => void playCurrentEpisode()}
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
                                        aria-pressed={liked}
                                        disabled={savedLoading || liking}
                                        onClick={() => void toggleLike()}
                                    >
                                        {liking
                                            ? <LoaderCircle className={styles.spinner} size={16} aria-hidden="true" />
                                            : <Heart size={16} fill={liked ? "currentColor" : "none"} aria-hidden="true" />}
                                        {liked ? "Unlike" : "Like"}
                                    </button>
                                    <button
                                        type="button"
                                        className={styles.secondaryButton}
                                        aria-pressed={saved}
                                        disabled={savedLoading || saving}
                                        onClick={() => void toggleSave()}
                                    >
                                        {saving
                                            ? <LoaderCircle className={styles.spinner} size={16} aria-hidden="true" />
                                            : saved
                                                ? <BookmarkCheck size={16} aria-hidden="true" />
                                                : <Bookmark size={16} aria-hidden="true" />}
                                        {saved ? "Unsave" : "Save"}
                                    </button>
                                </>
                            ) : null}
                            {canFollow ? (
                                <button
                                    type="button"
                                    className={styles.secondaryButton}
                                    aria-pressed={following}
                                    disabled={followPending}
                                    onClick={() => void toggleFollowCreator()}
                                >
                                    {followPending
                                        ? <LoaderCircle className={styles.spinner} size={16} aria-hidden="true" />
                                        : following
                                            ? <UserCheck size={16} aria-hidden="true" />
                                            : <UserPlus size={16} aria-hidden="true" />}
                                    {following ? "Unfollow" : "Follow"}
                                </button>
                            ) : null}
                            <button type="button" className={styles.secondaryButton} onClick={() => void copyShareLink()}>
                                <Share2 size={16} aria-hidden="true" />
                                Share
                            </button>
                        </div>
                    </div>
                </header>
            ) : null}
        </section>
    );
}
