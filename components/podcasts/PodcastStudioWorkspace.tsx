"use client";

import type { CSSProperties, FormEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    BookOpen,
    CheckCircle2,
    CircleAlert,
    Edit3,
    FileAudio,
    FileVideo,
    Image as ImageIcon,
    LoaderCircle,
    Mic2,
    Play,
    Plus,
    RefreshCw,
    Save,
    Send,
    Trash2,
    UploadCloud,
    X,
} from "lucide-react";
import { authFetch } from "@/lib/client-api-auth";
import {
    type PodcastEpisode,
    type PodcastPlaybackRequest,
    type PodcastShow,
} from "@/lib/podcast-types";
import { supabase } from "@/lib/supabase";
import { uploadFileToSignedSupabaseStorage } from "@/lib/supabase-storage-upload";
import { inspectVideoFileForUploadCompatibility } from "@/lib/video-upload-compatibility";
import styles from "./podcasts.module.css";

type PodcastStudioWorkspaceProps = {
    userId: string;
    onPlayPodcast?: (request: PodcastPlaybackRequest) => void | Promise<void>;
};

type ShowFormState = {
    title: string;
    description: string;
    coverImageUrl: string;
    coverStoragePath: string;
    category: string;
    languageCode: string;
    explicitContent: boolean;
    status: "draft" | "published";
};

type EpisodeFormState = {
    title: string;
    description: string;
    episodeNumber: string;
    seasonNumber: string;
    episodeType: PodcastEpisode["episodeType"];
    artworkUrl: string;
    status: "draft" | "published";
};

type ApiErrorBody = {
    error?: string;
    setupRequired?: boolean;
    episodeCount?: number;
};

type StudioCollectionResponse = ApiErrorBody & {
    shows?: PodcastShow[];
    episodes?: PodcastEpisode[];
};

type ShowMutationResponse = ApiErrorBody & {
    show?: PodcastShow;
};

type EpisodeMutationResponse = ApiErrorBody & {
    episode?: PodcastEpisode;
};

type PreparedUploadResponse = ApiErrorBody & {
    signedUrl?: string;
    token?: string;
    storagePath?: string;
    publicUrl?: string;
    contentType?: string;
};

type MediaVerification = {
    storagePath?: string;
    mimeType?: string;
    container?: string;
    videoCodec?: string;
    audioCodec?: string;
    mobileCompatible?: boolean | null;
    compatibilityStatus?: string;
    compatibilityReason?: string;
};

type VerificationResponse = ApiErrorBody & {
    verification?: MediaVerification;
};

type PlaybackResponse = ApiErrorBody & {
    signedUrl?: string;
    episode?: PodcastEpisode;
};

const EMPTY_SHOW_FORM: ShowFormState = {
    title: "",
    description: "",
    coverImageUrl: "",
    coverStoragePath: "",
    category: "Podcast",
    languageCode: "en",
    explicitContent: false,
    status: "draft",
};

const EMPTY_EPISODE_FORM: EpisodeFormState = {
    title: "",
    description: "",
    episodeNumber: "1",
    seasonNumber: "",
    episodeType: "audio",
    artworkUrl: "",
    status: "draft",
};

class PodcastApiError extends Error {
    readonly status: number;
    readonly setupRequired: boolean;
    readonly episodeCount: number | null;

    constructor(status: number, body: ApiErrorBody, fallback: string) {
        super(typeof body.error === "string" && body.error.trim() ? body.error : fallback);
        this.name = "PodcastApiError";
        this.status = status;
        this.setupRequired = body.setupRequired === true;
        this.episodeCount = typeof body.episodeCount === "number" && Number.isInteger(body.episodeCount)
            ? body.episodeCount
            : null;
    }
}

async function parseApiResponse<T extends object>(response: Response, fallback: string): Promise<T> {
    const body = (await response.json().catch(() => ({}))) as T & ApiErrorBody;
    if (!response.ok) throw new PodcastApiError(response.status, body, fallback);
    return body;
}

function imageStyle(url: string): CSSProperties | undefined {
    const cleanUrl = url.trim();
    return cleanUrl
        ? { backgroundImage: `linear-gradient(180deg, transparent 55%, rgba(4, 8, 22, 0.42)), url(${JSON.stringify(cleanUrl)})` }
        : undefined;
}

async function probeMediaDurationSeconds(
    file: File,
    episodeType: PodcastEpisode["episodeType"],
): Promise<number | null> {
    const objectUrl = URL.createObjectURL(file);
    const media = document.createElement(episodeType === "video" ? "video" : "audio");
    media.preload = "metadata";
    try {
        return await new Promise<number | null>((resolve) => {
            const timeout = window.setTimeout(() => resolve(null), 15_000);
            const finish = (value: number | null) => {
                window.clearTimeout(timeout);
                resolve(value);
            };
            media.onloadedmetadata = () => {
                const duration = Number(media.duration);
                finish(Number.isFinite(duration) && duration > 0 ? Math.round(duration) : null);
            };
            media.onerror = () => finish(null);
            media.src = objectUrl;
        });
    }
    finally {
        media.removeAttribute("src");
        media.load();
        URL.revokeObjectURL(objectUrl);
    }
}

function statusLabel(status: PodcastShow["status"] | PodcastEpisode["status"]) {
    return status.charAt(0).toUpperCase() + status.slice(1);
}

function numericEpisodeCount(show: PodcastShow, episodes: PodcastEpisode[]) {
    if (typeof show.episodeCount === "number" && Number.isInteger(show.episodeCount)) {
        return Math.max(0, show.episodeCount);
    }
    return episodes.filter((episode) => episode.podcastId === show.id).length;
}

export function PodcastStudioWorkspace({
    userId,
    onPlayPodcast,
}: PodcastStudioWorkspaceProps) {
    const showFormRef = useRef<HTMLElement | null>(null);
    const episodeFormRef = useRef<HTMLElement | null>(null);
    const [shows, setShows] = useState<PodcastShow[]>([]);
    const [episodes, setEpisodes] = useState<PodcastEpisode[]>([]);
    const [selectedShowId, setSelectedShowId] = useState("");
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState("");
    const [error, setError] = useState("");
    const [feedback, setFeedback] = useState("");
    const [setupRequired, setSetupRequired] = useState(false);
    const [pendingAction, setPendingAction] = useState("");

    const [showForm, setShowForm] = useState<ShowFormState>(() => ({ ...EMPTY_SHOW_FORM }));
    const [editingShowId, setEditingShowId] = useState("");
    const [showCoverFile, setShowCoverFile] = useState<File | null>(null);
    const [showCoverInputKey, setShowCoverInputKey] = useState(0);

    const [episodeForm, setEpisodeForm] = useState<EpisodeFormState>(() => ({ ...EMPTY_EPISODE_FORM }));
    const [editingEpisodeId, setEditingEpisodeId] = useState("");
    const [mediaFile, setMediaFile] = useState<File | null>(null);
    const [artworkFile, setArtworkFile] = useState<File | null>(null);
    const [mediaInputKey, setMediaInputKey] = useState(0);
    const [artworkInputKey, setArtworkInputKey] = useState(0);
    const [uploadStage, setUploadStage] = useState("");
    const [uploadProgress, setUploadProgress] = useState(0);
    const [studioEditorMode, setStudioEditorMode] = useState<"idle" | "show" | "episode">("idle");

    const selectedShow = useMemo(
        () => shows.find((show) => show.id === selectedShowId) || null,
        [selectedShowId, shows],
    );
    const selectedEpisodes = useMemo(
        () => episodes.filter((episode) => episode.podcastId === selectedShowId),
        [episodes, selectedShowId],
    );

    const loadStudio = useCallback(async (signal?: AbortSignal) => {
        if (!userId) {
            setLoading(false);
            setLoadError("A creator account is required to open Podcast Studio.");
            return;
        }
        setLoading(true);
        setLoadError("");
        try {
            const response = await authFetch(
                supabase,
                `/api/podcasts?scope=mine&userId=${encodeURIComponent(userId)}&limit=100`,
                { cache: "no-store", signal },
            );
            const body = await parseApiResponse<StudioCollectionResponse>(
                response,
                "Your podcasts could not be loaded.",
            );
            const nextShows = Array.isArray(body.shows) ? body.shows : [];
            const nextEpisodes = Array.isArray(body.episodes) ? body.episodes : [];
            setShows(nextShows);
            setEpisodes(nextEpisodes);
            setSelectedShowId((current) => (
                nextShows.some((show) => show.id === current) ? current : (nextShows[0]?.id || "")
            ));
            setSetupRequired(false);
        }
        catch (caught) {
            if (signal?.aborted) return;
            if (caught instanceof PodcastApiError && caught.status === 409 && caught.setupRequired) {
                setSetupRequired(true);
            }
            setShows([]);
            setEpisodes([]);
            setLoadError(caught instanceof Error ? caught.message : "Your podcasts could not be loaded.");
        }
        finally {
            if (!signal?.aborted) setLoading(false);
        }
    }, [userId]);

    useEffect(() => {
        const controller = new AbortController();
        const timer = window.setTimeout(() => void loadStudio(controller.signal), 0);
        return () => {
            window.clearTimeout(timer);
            controller.abort();
        };
    }, [loadStudio]);

    function clearMessages() {
        setError("");
        setFeedback("");
    }

    function handleActionError(caught: unknown, fallback: string) {
        if (caught instanceof PodcastApiError && caught.status === 409 && caught.setupRequired) {
            setSetupRequired(true);
        }
        setError(caught instanceof Error ? caught.message : fallback);
    }

    async function authenticatedJson<T extends object>(
        path: string,
        method: "POST" | "PATCH" | "DELETE",
        payload: Record<string, unknown>,
        fallback: string,
    ) {
        const response = await authFetch(supabase, path, {
            method,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId, ...payload }),
            cache: "no-store",
            requireSession: true,
        });
        return parseApiResponse<T>(response, fallback);
    }

    function resetShowForm() {
        setEditingShowId("");
        setShowForm({ ...EMPTY_SHOW_FORM });
        setShowCoverFile(null);
        setShowCoverInputKey((current) => current + 1);
    }

    function startEditingShow(show: PodcastShow) {
        clearMessages();
        setStudioEditorMode("show");
        setEditingShowId(show.id);
        setSelectedShowId(show.id);
        setShowForm({
            title: show.title,
            description: show.description,
            coverImageUrl: show.coverImageUrl,
            coverStoragePath: show.coverStoragePath,
            category: show.category || "Podcast",
            languageCode: show.languageCode || "en",
            explicitContent: show.explicitContent,
            status: show.status === "published" ? "published" : "draft",
        });
        setShowCoverFile(null);
        setShowCoverInputKey((current) => current + 1);
    }

    function resetEpisodeForm() {
        setEditingEpisodeId("");
        setEpisodeForm({ ...EMPTY_EPISODE_FORM });
        setMediaFile(null);
        setArtworkFile(null);
        setMediaInputKey((current) => current + 1);
        setArtworkInputKey((current) => current + 1);
        setUploadStage("");
        setUploadProgress(0);
    }

    function startEditingEpisode(episode: PodcastEpisode) {
        clearMessages();
        setStudioEditorMode("episode");
        setSelectedShowId(episode.podcastId);
        setEditingEpisodeId(episode.id);
        setEpisodeForm({
            title: episode.title,
            description: episode.description,
            episodeNumber: String(episode.episodeNumber),
            seasonNumber: episode.seasonNumber == null ? "" : String(episode.seasonNumber),
            episodeType: episode.episodeType,
            artworkUrl: episode.artworkUrl,
            status: episode.status === "published" ? "published" : "draft",
        });
        setMediaFile(null);
        setArtworkFile(null);
        setMediaInputKey((current) => current + 1);
        setArtworkInputKey((current) => current + 1);
        setUploadStage("");
        setUploadProgress(0);
    }

    async function prepareArtworkUpload(file: File, podcastId?: string) {
        const prepared = await authenticatedJson<PreparedUploadResponse>(
            "/api/podcasts/uploads",
            "POST",
            {
                action: "prepare-artwork",
                ...(podcastId ? { podcastId } : {}),
                fileName: file.name,
                contentType: file.type,
                fileSize: file.size,
            },
            "Podcast artwork upload could not be prepared.",
        );
        if (!prepared.signedUrl || !prepared.token || !prepared.storagePath) {
            throw new Error("Podcast artwork upload details are incomplete.");
        }
        await uploadFileToSignedSupabaseStorage(
            prepared.signedUrl,
            prepared.token,
            file,
            prepared.contentType || file.type,
        );
        return {
            storagePath: prepared.storagePath,
            publicUrl: prepared.publicUrl || "",
        };
    }

    async function submitShow(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        clearMessages();
        setPendingAction("save-show");
        try {
            let coverImageUrl = showForm.coverImageUrl.trim();
            let coverStoragePath = showForm.coverStoragePath;
            if (showCoverFile) {
                setUploadStage("Uploading show cover…");
                setUploadProgress(35);
                const uploaded = await prepareArtworkUpload(showCoverFile, editingShowId || undefined);
                coverImageUrl = uploaded.publicUrl;
                coverStoragePath = uploaded.storagePath;
                setUploadProgress(75);
            }
            const payload = {
                title: showForm.title,
                description: showForm.description,
                coverImageUrl,
                coverStoragePath,
                category: showForm.category,
                languageCode: showForm.languageCode,
                explicitContent: showForm.explicitContent,
                status: showForm.status,
            };
            const isEditing = Boolean(editingShowId);
            const body = await authenticatedJson<ShowMutationResponse>(
                isEditing ? `/api/podcasts/${editingShowId}` : "/api/podcasts",
                isEditing ? "PATCH" : "POST",
                payload,
                isEditing ? "Podcast show could not be updated." : "Podcast show could not be created.",
            );
            setUploadProgress(100);
            setFeedback(`${body.show?.title || showForm.title} was ${isEditing ? "updated" : "created"}.`);
            resetShowForm();
            setStudioEditorMode("idle");
            await loadStudio();
        }
        catch (caught) {
            handleActionError(caught, "Podcast show could not be saved.");
        }
        finally {
            setPendingAction("");
            setUploadStage("");
            setUploadProgress(0);
        }
    }

    async function changeShowStatus(show: PodcastShow) {
        const nextStatus = show.status === "published" ? "draft" : "published";
        clearMessages();
        setPendingAction(`show-status:${show.id}`);
        try {
            await authenticatedJson<ShowMutationResponse>(
                `/api/podcasts/${show.id}`,
                "PATCH",
                { status: nextStatus },
                "Podcast show status could not be changed.",
            );
            setFeedback(`${show.title} is now ${nextStatus}.`);
            await loadStudio();
        }
        catch (caught) {
            handleActionError(caught, "Podcast show status could not be changed.");
        }
        finally {
            setPendingAction("");
        }
    }

    async function deleteShow(show: PodcastShow) {
        clearMessages();
        const knownCount = numericEpisodeCount(show, episodes);
        const firstConfirmation = window.prompt(
            `Deleting "${show.title}" permanently deletes its episodes and stored media. Type the exact episode count (${knownCount}) to continue.`,
        );
        if (firstConfirmation === null) return;
        if (firstConfirmation.trim() !== String(knownCount)) {
            setError(`Deletion cancelled. Enter the exact episode count: ${knownCount}.`);
            return;
        }

        setPendingAction(`delete-show:${show.id}`);
        try {
            const sendDelete = async (confirmEpisodeCount: number) => {
                const response = await authFetch(supabase, `/api/podcasts/${show.id}`, {
                    method: "DELETE",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ userId, confirmEpisodeCount }),
                    cache: "no-store",
                    requireSession: true,
                });
                const body = (await response.json().catch(() => ({}))) as ApiErrorBody;
                return { response, body };
            };

            let result = await sendDelete(knownCount);
            if (result.response.status === 409 && typeof result.body.episodeCount === "number") {
                const authoritativeCount = result.body.episodeCount;
                const retryConfirmation = window.prompt(
                    `The episode count changed. Type the current exact count (${authoritativeCount}) to retry deletion once.`,
                );
                if (retryConfirmation === null) return;
                if (retryConfirmation.trim() !== String(authoritativeCount)) {
                    setError(`Deletion cancelled. Enter the exact episode count: ${authoritativeCount}.`);
                    return;
                }
                result = await sendDelete(authoritativeCount);
            }
            if (!result.response.ok) {
                throw new PodcastApiError(
                    result.response.status,
                    result.body,
                    "Podcast show could not be deleted.",
                );
            }
            if (editingShowId === show.id) resetShowForm();
            if (selectedShowId === show.id) resetEpisodeForm();
            setFeedback(`${show.title} and its episodes were deleted.`);
            await loadStudio();
        }
        catch (caught) {
            handleActionError(caught, "Podcast show could not be deleted.");
        }
        finally {
            setPendingAction("");
        }
    }

    async function createEpisode() {
        const showId = selectedShowId;
        if (!showId) throw new Error("Create or select a Podcast show first.");
        if (!mediaFile) throw new Error("Choose an audio or video episode file.");

        const durationSeconds = await probeMediaDurationSeconds(mediaFile, episodeForm.episodeType);
        let clientCompatibility: Awaited<ReturnType<typeof inspectVideoFileForUploadCompatibility>> | null = null;
        if (episodeForm.episodeType === "video") {
            setUploadStage("Checking video compatibility…");
            setUploadProgress(2);
            clientCompatibility = await inspectVideoFileForUploadCompatibility(mediaFile, (loaded, total) => {
                const ratio = total > 0 ? loaded / total : 0;
                setUploadProgress(Math.max(2, Math.min(15, Math.round(ratio * 15))));
            });
            if (!clientCompatibility.canPublish) {
                throw new Error(
                    clientCompatibility.publicationError
                    || clientCompatibility.compatibilityReason
                    || "This video cannot be published.",
                );
            }
        }

        setUploadStage("Preparing episode media…");
        setUploadProgress(18);
        const contentType = mediaFile.type || "application/octet-stream";
        const preparedMedia = await authenticatedJson<PreparedUploadResponse>(
            "/api/podcasts/uploads",
            "POST",
            {
                action: "prepare-media",
                podcastId: showId,
                episodeType: episodeForm.episodeType,
                fileName: mediaFile.name,
                contentType,
                fileSize: mediaFile.size,
            },
            "Episode media upload could not be prepared.",
        );
        if (!preparedMedia.signedUrl || !preparedMedia.token || !preparedMedia.storagePath) {
            throw new Error("Episode media upload details are incomplete.");
        }

        setUploadStage("Uploading episode media…");
        setUploadProgress(35);
        await uploadFileToSignedSupabaseStorage(
            preparedMedia.signedUrl,
            preparedMedia.token,
            mediaFile,
            preparedMedia.contentType || contentType,
        );

        setUploadStage("Verifying uploaded media…");
        setUploadProgress(64);
        const verified = await authenticatedJson<VerificationResponse>(
            "/api/podcasts/uploads",
            "POST",
            {
                action: "verify-media",
                podcastId: showId,
                episodeType: episodeForm.episodeType,
                storagePath: preparedMedia.storagePath,
                fileName: mediaFile.name,
                contentType: preparedMedia.contentType || contentType,
                fileSize: mediaFile.size,
            },
            "Uploaded episode media could not be verified.",
        );
        if (!verified.verification) {
            throw new Error("Episode media verification did not return a result.");
        }

        let artworkUrl = episodeForm.artworkUrl.trim();
        let artworkStoragePath = "";
        if (artworkFile) {
            setUploadStage("Uploading episode artwork…");
            setUploadProgress(76);
            const uploadedArtwork = await prepareArtworkUpload(artworkFile, showId);
            artworkUrl = uploadedArtwork.publicUrl;
            artworkStoragePath = uploadedArtwork.storagePath;
        }

        setUploadStage("Creating episode…");
        setUploadProgress(90);
        const verification = verified.verification;
        await authenticatedJson<EpisodeMutationResponse>(
            "/api/podcasts/episodes",
            "POST",
            {
                podcastId: showId,
                title: episodeForm.title,
                description: episodeForm.description,
                episodeNumber: Number(episodeForm.episodeNumber),
                seasonNumber: episodeForm.seasonNumber ? Number(episodeForm.seasonNumber) : null,
                episodeType: episodeForm.episodeType,
                storagePath: verification.storagePath || preparedMedia.storagePath,
                artworkUrl,
                artworkStoragePath,
                thumbnailUrl: artworkUrl,
                durationSeconds,
                fileName: mediaFile.name,
                fileSize: mediaFile.size,
                mimeType: verification.mimeType || preparedMedia.contentType || contentType,
                container: verification.container || clientCompatibility?.container || "",
                videoCodec: verification.videoCodec || clientCompatibility?.videoCodec || "",
                audioCodec: verification.audioCodec || clientCompatibility?.audioCodec || "",
                mobileCompatible: verification.mobileCompatible ?? clientCompatibility?.mobileCompatible ?? null,
                compatibilityStatus: verification.compatibilityStatus || clientCompatibility?.compatibilityStatus || "",
                compatibilityReason: verification.compatibilityReason || clientCompatibility?.compatibilityReason || "",
                status: episodeForm.status,
            },
            "Podcast episode could not be created.",
        );
        setUploadProgress(100);
    }

    async function updateEpisode() {
        if (!editingEpisodeId) return;
        await authenticatedJson<EpisodeMutationResponse>(
            `/api/podcasts/episodes/${editingEpisodeId}`,
            "PATCH",
            {
                title: episodeForm.title,
                description: episodeForm.description,
                episodeNumber: Number(episodeForm.episodeNumber),
                seasonNumber: episodeForm.seasonNumber ? Number(episodeForm.seasonNumber) : null,
                artworkUrl: episodeForm.artworkUrl,
                thumbnailUrl: episodeForm.artworkUrl,
                status: episodeForm.status,
            },
            "Podcast episode could not be updated.",
        );
    }

    async function submitEpisode(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        clearMessages();
        setPendingAction("save-episode");
        try {
            const wasEditing = Boolean(editingEpisodeId);
            if (wasEditing) await updateEpisode();
            else await createEpisode();
            setFeedback(`${episodeForm.title} was ${wasEditing ? "updated" : "created"}.`);
            resetEpisodeForm();
            setStudioEditorMode("idle");
            await loadStudio();
        }
        catch (caught) {
            handleActionError(caught, "Podcast episode could not be saved.");
        }
        finally {
            setPendingAction("");
            setUploadStage("");
            setUploadProgress(0);
        }
    }

    async function changeEpisodeStatus(episode: PodcastEpisode) {
        const nextStatus = episode.status === "published" ? "draft" : "published";
        clearMessages();
        setPendingAction(`episode-status:${episode.id}`);
        try {
            await authenticatedJson<EpisodeMutationResponse>(
                `/api/podcasts/episodes/${episode.id}`,
                "PATCH",
                { status: nextStatus },
                "Episode status could not be changed.",
            );
            setFeedback(`${episode.title} is now ${nextStatus}.`);
            await loadStudio();
        }
        catch (caught) {
            handleActionError(caught, "Episode status could not be changed.");
        }
        finally {
            setPendingAction("");
        }
    }

    async function deleteEpisode(episode: PodcastEpisode) {
        if (!window.confirm(`Permanently delete "${episode.title}" and its stored media?`)) return;
        clearMessages();
        setPendingAction(`delete-episode:${episode.id}`);
        try {
            await authenticatedJson<ApiErrorBody>(
                `/api/podcasts/episodes/${episode.id}`,
                "DELETE",
                {},
                "Podcast episode could not be deleted.",
            );
            if (editingEpisodeId === episode.id) resetEpisodeForm();
            setFeedback(`${episode.title} was deleted.`);
            await loadStudio();
        }
        catch (caught) {
            handleActionError(caught, "Podcast episode could not be deleted.");
        }
        finally {
            setPendingAction("");
        }
    }

    async function previewEpisode(episode: PodcastEpisode) {
        if (!onPlayPodcast) return;
        clearMessages();
        setPendingAction(`preview:${episode.id}`);
        try {
            const body = await authenticatedJson<PlaybackResponse>(
                "/api/podcasts/playback",
                "POST",
                { episodeId: episode.id, countPlay: false },
                "Podcast preview could not be opened.",
            );
            if (!body.signedUrl) throw new Error("Podcast preview URL is unavailable.");
            const resolvedEpisode = body.episode || episode;
            const context = selectedEpisodes.map((candidate) => (
                candidate.id === resolvedEpisode.id ? resolvedEpisode : candidate
            ));
            await onPlayPodcast({
                episode: resolvedEpisode,
                context,
                playableUrl: body.signedUrl,
                countMetric: false,
            });
        }
        catch (caught) {
            handleActionError(caught, "Podcast preview could not be opened.");
        }
        finally {
            setPendingAction("");
        }
    }

    function chooseShow(showId: string) {
        setSelectedShowId(showId);
        if (editingEpisodeId) {
            const editingEpisode = episodes.find((episode) => episode.id === editingEpisodeId);
            if (editingEpisode?.podcastId !== showId) resetEpisodeForm();
        }
    }

    function openCreatePodcastForm() {
        clearMessages();
        if (editingShowId) resetShowForm();
        setStudioEditorMode("show");
        window.setTimeout(() => {
            showFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 40);
    }

    function openCreateEpisodeForm() {
        clearMessages();
        if (editingEpisodeId) resetEpisodeForm();
        if (!selectedShowId && shows[0]?.id) setSelectedShowId(shows[0].id);
        setStudioEditorMode("episode");
        window.setTimeout(() => {
            episodeFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 40);
    }

    const showSaving = pendingAction === "save-show";
    const episodeSaving = pendingAction === "save-episode";

    return (
        <section className={`${styles.workspace} ${styles.studioWorkspace}`} aria-labelledby="podcast-studio-title">
            <header className={styles.studioHeader}>
                <div className={styles.studioHeadingIcon}><Mic2 size={25} aria-hidden="true" /></div>
                <div>
                    <p className={styles.eyebrow}>Creator tools</p>
                    <h2 id="podcast-studio-title">Podcast Studio</h2>
                    <p className={styles.lede}>Build your show, upload verified media, and control each release.</p>
                </div>
                <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={() => void loadStudio()}
                    disabled={loading || Boolean(pendingAction)}
                >
                    <RefreshCw className={loading ? styles.spinner : undefined} size={17} aria-hidden="true" />
                    Refresh
                </button>
            </header>

            {setupRequired ? (
                <div className={styles.setupBanner} role="alert">
                    <CircleAlert size={21} aria-hidden="true" />
                    <div>
                        <strong>Podcast setup is pending</strong>
                        <span>Apply the Podcast foundation migrations and storage bucket setup, then refresh Studio.</span>
                    </div>
                </div>
            ) : null}

            {error ? (
                <div className={styles.inlineAlert} role="alert">
                    <CircleAlert size={18} aria-hidden="true" />
                    <span>{error}</span>
                    <button type="button" onClick={() => setError("")} aria-label="Dismiss error">Dismiss</button>
                </div>
            ) : null}
            {feedback ? (
                <div className={styles.successBanner} role="status" aria-live="polite">
                    <CheckCircle2 size={18} aria-hidden="true" />
                    <span>{feedback}</span>
                    <button type="button" onClick={() => setFeedback("")} aria-label="Dismiss message">Dismiss</button>
                </div>
            ) : null}
            {uploadStage ? (
                <div className={styles.progressPanel} role="status" aria-live="polite">
                    <div>
                        <UploadCloud size={19} aria-hidden="true" />
                        <strong>{uploadStage}</strong>
                        <span>{uploadProgress}%</span>
                    </div>
                    <progress max={100} value={uploadProgress} aria-label={uploadStage} />
                </div>
            ) : null}

            {loading ? (
                <div className={styles.statePanel} role="status">
                    <LoaderCircle className={styles.spinner} size={28} aria-hidden="true" />
                    <strong>Loading Podcast Studio</strong>
                    <span>Retrieving your shows and episodes.</span>
                </div>
            ) : null}

            {!loading && loadError ? (
                <div className={styles.statePanel} role="alert">
                    <CircleAlert size={30} aria-hidden="true" />
                    <strong>Studio could not load</strong>
                    <span>{loadError}</span>
                    <button type="button" className={styles.primaryButton} onClick={() => void loadStudio()}>
                        <RefreshCw size={17} aria-hidden="true" />
                        Try again
                    </button>
                </div>
            ) : null}

            {!loading && !loadError ? (
                <>
                    <div className={styles.studioPrimaryActions} role="group" aria-label="Podcast Studio primary actions">
                        <button
                            type="button"
                            className={studioEditorMode === "show" ? styles.primaryButton : styles.secondaryButton}
                            aria-pressed={studioEditorMode === "show"}
                            onClick={openCreatePodcastForm}
                        >
                            <Plus size={17} aria-hidden="true" />
                            Create Podcast
                        </button>
                        <button
                            type="button"
                            className={studioEditorMode === "episode" ? styles.primaryButton : styles.secondaryButton}
                            aria-pressed={studioEditorMode === "episode"}
                            onClick={openCreateEpisodeForm}
                            disabled={shows.length === 0}
                            title={shows.length === 0 ? "Create a Podcast show first" : "Create a new episode"}
                        >
                            <UploadCloud size={17} aria-hidden="true" />
                            Create Episode
                        </button>
                    </div>

                    <div className={styles.studioGrid}>
                        <section className={styles.panel} aria-labelledby="my-podcast-shows-heading">
                            <div className={styles.panelHeading}>
                                <div>
                                    <p className={styles.eyebrow}>Podcast show management</p>
                                    <h3 id="my-podcast-shows-heading">Existing Podcasts</h3>
                                </div>
                                <button type="button" className={styles.compactButton} onClick={openCreatePodcastForm}>
                                    <Plus size={16} aria-hidden="true" />
                                    Create Podcast
                                </button>
                            </div>
                            {shows.length === 0 ? (
                                <div className={styles.compactEmpty}>
                                    <BookOpen size={27} aria-hidden="true" />
                                    <strong>No shows yet</strong>
                                    <span>Create your first show to start adding episodes.</span>
                                </div>
                            ) : (
                                <div className={styles.studioShowList}>
                                    {shows.map((show) => {
                                        const selected = show.id === selectedShowId;
                                        const count = numericEpisodeCount(show, episodes);
                                        const statusPending = pendingAction === `show-status:${show.id}`;
                                        const deletePending = pendingAction === `delete-show:${show.id}`;
                                        return (
                                            <article
                                                key={show.id}
                                                className={selected ? styles.selectedStudioShow : styles.studioShow}
                                            >
                                                <button
                                                    type="button"
                                                    className={styles.showSelectButton}
                                                    onClick={() => chooseShow(show.id)}
                                                    aria-pressed={selected}
                                                >
                                                    <span
                                                        className={styles.showThumb}
                                                        style={imageStyle(show.coverImageUrl)}
                                                        aria-hidden="true"
                                                    >
                                                        {!show.coverImageUrl ? <Mic2 size={20} aria-hidden="true" /> : null}
                                                    </span>
                                                    <span className={styles.showSelectCopy}>
                                                        <strong>{show.title}</strong>
                                                        <span>{count} {count === 1 ? "episode" : "episodes"} · {statusLabel(show.status)}</span>
                                                    </span>
                                                </button>
                                                <div className={styles.rowActions}>
                                                    <button
                                                        type="button"
                                                        onClick={() => startEditingShow(show)}
                                                        aria-label={`Edit ${show.title}`}
                                                    >
                                                        <Edit3 size={16} aria-hidden="true" />
                                                        Edit
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => void changeShowStatus(show)}
                                                        disabled={Boolean(pendingAction)}
                                                        aria-label={`${show.status === "published" ? "Unpublish" : "Publish"} ${show.title}`}
                                                    >
                                                        {statusPending
                                                            ? <LoaderCircle className={styles.spinner} size={16} aria-hidden="true" />
                                                            : <Send size={16} aria-hidden="true" />}
                                                        {show.status === "published" ? "Unpublish" : "Publish"}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className={styles.dangerTextButton}
                                                        onClick={() => void deleteShow(show)}
                                                        disabled={Boolean(pendingAction)}
                                                        aria-label={`Delete ${show.title}`}
                                                    >
                                                        {deletePending
                                                            ? <LoaderCircle className={styles.spinner} size={16} aria-hidden="true" />
                                                            : <Trash2 size={16} aria-hidden="true" />}
                                                        Delete
                                                    </button>
                                                </div>
                                            </article>
                                        );
                                    })}
                                </div>
                            )}
                        </section>

                        {studioEditorMode === "show" ? (
                        <section
                            ref={showFormRef}
                            className={styles.panel}
                            aria-labelledby="show-editor-heading"
                            id="podcast-create-show-panel"
                        >
                            <div className={styles.panelHeading}>
                                <div>
                                    <p className={styles.eyebrow}>{editingShowId ? "Update series" : "Podcast show management"}</p>
                                    <h3 id="show-editor-heading">{editingShowId ? "Edit Podcast" : "Create Podcast"}</h3>
                                </div>
                                {editingShowId ? (
                                    <button
                                        type="button"
                                        className={styles.iconButton}
                                        onClick={() => {
                                            resetShowForm();
                                            setStudioEditorMode("idle");
                                        }}
                                        aria-label="Cancel show editing"
                                    >
                                        <X size={18} aria-hidden="true" />
                                    </button>
                                ) : (
                                    <button
                                        type="button"
                                        className={styles.iconButton}
                                        onClick={() => setStudioEditorMode("idle")}
                                        aria-label="Close Create Podcast form"
                                    >
                                        <X size={18} aria-hidden="true" />
                                    </button>
                                )}
                            </div>
                            <form id="podcast-create-show-form" className={styles.form} onSubmit={submitShow}>
                                <label className={styles.field}>
                                    <span>Podcast Title</span>
                                    <input
                                        required
                                        maxLength={160}
                                        value={showForm.title}
                                        onChange={(event) => setShowForm((current) => ({ ...current, title: event.target.value }))}
                                        placeholder="The name listeners will see"
                                    />
                                </label>
                                <label className={styles.field}>
                                    <span>Description</span>
                                    <textarea
                                        maxLength={4000}
                                        rows={4}
                                        value={showForm.description}
                                        onChange={(event) => setShowForm((current) => ({ ...current, description: event.target.value }))}
                                        placeholder="What is this show about?"
                                    />
                                </label>
                                <div className={styles.formColumns}>
                                    <label className={styles.field}>
                                        <span>Category</span>
                                        <input
                                            required
                                            maxLength={100}
                                            value={showForm.category}
                                            onChange={(event) => setShowForm((current) => ({ ...current, category: event.target.value }))}
                                            placeholder="Music, Culture, News…"
                                        />
                                    </label>
                                    <label className={styles.field}>
                                        <span>Language code</span>
                                        <input
                                            required
                                            maxLength={20}
                                            value={showForm.languageCode}
                                            onChange={(event) => setShowForm((current) => ({ ...current, languageCode: event.target.value }))}
                                            placeholder="en"
                                            autoCapitalize="none"
                                        />
                                    </label>
                                </div>
                                <label className={styles.field}>
                                    <span>Cover image URL <small>optional</small></span>
                                    <input
                                        type="url"
                                        maxLength={1000}
                                        value={showForm.coverImageUrl}
                                        onChange={(event) => setShowForm((current) => ({
                                            ...current,
                                            coverImageUrl: event.target.value,
                                            coverStoragePath: event.target.value === current.coverImageUrl
                                                ? current.coverStoragePath
                                                : "",
                                        }))}
                                        placeholder="https://…"
                                    />
                                </label>
                                <label className={styles.fileField}>
                                    <span className={styles.fileIcon}><ImageIcon size={20} aria-hidden="true" /></span>
                                    <span>
                                        <strong>Upload a cover</strong>
                                        <small>{showCoverFile?.name || "JPEG, PNG, WebP, or GIF · 20 MB max"}</small>
                                    </span>
                                    <input
                                        key={showCoverInputKey}
                                        type="file"
                                        accept="image/jpeg,image/png,image/webp,image/gif"
                                        onChange={(event) => setShowCoverFile(event.target.files?.[0] || null)}
                                    />
                                </label>
                                <div className={styles.formColumns}>
                                    <label className={styles.field}>
                                        <span>Release status</span>
                                        <select
                                            value={showForm.status}
                                            onChange={(event) => setShowForm((current) => ({
                                                ...current,
                                                status: event.target.value === "published" ? "published" : "draft",
                                            }))}
                                        >
                                            <option value="draft">Draft</option>
                                            <option value="published">Published</option>
                                        </select>
                                    </label>
                                    <label className={styles.toggleField}>
                                        <input
                                            type="checkbox"
                                            checked={showForm.explicitContent}
                                            onChange={(event) => setShowForm((current) => ({
                                                ...current,
                                                explicitContent: event.target.checked,
                                            }))}
                                        />
                                        <span>
                                            <strong>Explicit content</strong>
                                            <small>Mark the show for listeners.</small>
                                        </span>
                                    </label>
                                </div>
                                <button type="submit" className={styles.primaryButton} disabled={showSaving || Boolean(pendingAction && !showSaving)}>
                                    {showSaving
                                        ? <LoaderCircle className={styles.spinner} size={18} aria-hidden="true" />
                                        : <Save size={18} aria-hidden="true" />}
                                    {showSaving ? "Saving…" : editingShowId ? "Save Podcast" : "Create Podcast"}
                                </button>
                            </form>
                        </section>
                        ) : null}
                    </div>

                    {studioEditorMode === "episode" ? (
                    <section
                        ref={episodeFormRef}
                        className={styles.panel}
                        aria-labelledby="episode-editor-heading"
                        id="podcast-create-episode-panel"
                    >
                        <div className={styles.panelHeading}>
                            <div>
                                <p className={styles.eyebrow}>Episode management</p>
                                <h3 id="episode-editor-heading">
                                    {editingEpisodeId ? "Edit Episode" : "Create Episode"}
                                </h3>
                            </div>
                            {editingEpisodeId ? (
                                <button type="button" className={styles.compactButton} onClick={openCreateEpisodeForm}>
                                    <Plus size={16} aria-hidden="true" />
                                    Create Episode
                                </button>
                            ) : (
                                <button
                                    type="button"
                                    className={styles.iconButton}
                                    onClick={() => setStudioEditorMode("idle")}
                                    aria-label="Close Create Episode form"
                                >
                                    <X size={18} aria-hidden="true" />
                                </button>
                            )}
                        </div>
                        {shows.length === 0 ? (
                            <div className={styles.compactEmpty}>
                                <Mic2 size={27} aria-hidden="true" />
                                <strong>Create a Podcast first</strong>
                                <span>Use Create Podcast above, then come back to upload an episode.</span>
                                <button type="button" className={styles.primaryButton} onClick={openCreatePodcastForm}>
                                    <Plus size={17} aria-hidden="true" />
                                    Create Podcast
                                </button>
                            </div>
                        ) : (
                            <form id="podcast-create-episode-form" className={styles.form} onSubmit={submitEpisode}>
                                <label className={styles.field}>
                                    <span>Select Podcast Show</span>
                                    <select
                                        required
                                        value={selectedShowId}
                                        disabled={Boolean(editingEpisodeId)}
                                        onChange={(event) => chooseShow(event.target.value)}
                                        aria-label="Select Podcast Show"
                                    >
                                        {shows.map((show) => (
                                            <option key={show.id} value={show.id}>{show.title}</option>
                                        ))}
                                    </select>
                                </label>
                                <div className={styles.formColumns}>
                                    <label className={styles.field}>
                                        <span>Episode Title</span>
                                        <input
                                            required
                                            maxLength={200}
                                            value={episodeForm.title}
                                            onChange={(event) => setEpisodeForm((current) => ({ ...current, title: event.target.value }))}
                                            placeholder="Episode title"
                                        />
                                    </label>
                                    <div className={styles.field}>
                                        <span>Episode Type</span>
                                        <div className={styles.episodeTypeToggle} role="group" aria-label="Episode Type">
                                            <button
                                                type="button"
                                                className={episodeForm.episodeType === "audio" ? styles.typeToggleActive : styles.typeToggleButton}
                                                aria-pressed={episodeForm.episodeType === "audio"}
                                                disabled={Boolean(editingEpisodeId)}
                                                onClick={() => {
                                                    setEpisodeForm((current) => ({ ...current, episodeType: "audio" }));
                                                    setMediaFile(null);
                                                    setMediaInputKey((current) => current + 1);
                                                }}
                                            >
                                                <FileAudio size={16} aria-hidden="true" />
                                                AUDIO
                                            </button>
                                            <button
                                                type="button"
                                                className={episodeForm.episodeType === "video" ? styles.typeToggleActive : styles.typeToggleButton}
                                                aria-pressed={episodeForm.episodeType === "video"}
                                                disabled={Boolean(editingEpisodeId)}
                                                onClick={() => {
                                                    setEpisodeForm((current) => ({ ...current, episodeType: "video" }));
                                                    setMediaFile(null);
                                                    setMediaInputKey((current) => current + 1);
                                                }}
                                            >
                                                <FileVideo size={16} aria-hidden="true" />
                                                VIDEO
                                            </button>
                                        </div>
                                    </div>
                                </div>
                                <label className={styles.field}>
                                    <span>Description</span>
                                    <textarea
                                        rows={4}
                                        maxLength={8000}
                                        value={episodeForm.description}
                                        onChange={(event) => setEpisodeForm((current) => ({ ...current, description: event.target.value }))}
                                        placeholder="Introduce this episode."
                                    />
                                </label>
                                <div className={styles.formColumnsThree}>
                                    <label className={styles.field}>
                                        <span>Episode Number</span>
                                        <input
                                            required
                                            type="number"
                                            min={1}
                                            step={1}
                                            value={episodeForm.episodeNumber}
                                            onChange={(event) => setEpisodeForm((current) => ({ ...current, episodeNumber: event.target.value }))}
                                        />
                                    </label>
                                    <label className={styles.field}>
                                        <span>Season Number <small>optional</small></span>
                                        <input
                                            type="number"
                                            min={1}
                                            step={1}
                                            value={episodeForm.seasonNumber}
                                            onChange={(event) => setEpisodeForm((current) => ({ ...current, seasonNumber: event.target.value }))}
                                        />
                                    </label>
                                    <label className={styles.field}>
                                        <span>Release status</span>
                                        <select
                                            value={episodeForm.status}
                                            onChange={(event) => setEpisodeForm((current) => ({
                                                ...current,
                                                status: event.target.value === "published" ? "published" : "draft",
                                            }))}
                                        >
                                            <option value="draft">Draft</option>
                                            <option value="published">Published</option>
                                        </select>
                                    </label>
                                </div>
                                {!editingEpisodeId ? (
                                    <>
                                        <label className={styles.fileField}>
                                            <span className={styles.fileIcon}>
                                                {episodeForm.episodeType === "video"
                                                    ? <FileVideo size={21} aria-hidden="true" />
                                                    : <FileAudio size={21} aria-hidden="true" />}
                                            </span>
                                            <span>
                                                <strong>
                                                    {episodeForm.episodeType === "video" ? "Video File" : "Audio File"}
                                                </strong>
                                                <small>
                                                    {mediaFile?.name || (
                                                        episodeForm.episodeType === "video"
                                                            ? "Choose MP4/M4V · H.264 + AAC · 1 GB max"
                                                            : "Choose MP3, M4A, or AAC · 100 MB max"
                                                    )}
                                                </small>
                                            </span>
                                            <input
                                                key={mediaInputKey}
                                                required
                                                type="file"
                                                aria-label={episodeForm.episodeType === "video" ? "Select video file" : "Select audio file"}
                                                accept={episodeForm.episodeType === "video"
                                                    ? "video/mp4,video/x-m4v,.mp4,.m4v"
                                                    : "audio/mpeg,audio/mp4,audio/aac,audio/m4a,audio/x-m4a,.mp3,.m4a,.aac"}
                                                onChange={(event) => setMediaFile(event.target.files?.[0] || null)}
                                            />
                                        </label>
                                        <label className={styles.fileField}>
                                            <span className={styles.fileIcon}><ImageIcon size={20} aria-hidden="true" /></span>
                                            <span>
                                                <strong>
                                                    {episodeForm.episodeType === "video" ? "Thumbnail / Artwork" : "Artwork"}
                                                    {" "}
                                                    <small>optional</small>
                                                </strong>
                                                <small>{artworkFile?.name || "JPEG, PNG, WebP, or GIF · 20 MB max"}</small>
                                            </span>
                                            <input
                                                key={artworkInputKey}
                                                type="file"
                                                accept="image/jpeg,image/png,image/webp,image/gif"
                                                onChange={(event) => setArtworkFile(event.target.files?.[0] || null)}
                                            />
                                        </label>
                                    </>
                                ) : (
                                    <p className={styles.formNote}>Media format and files remain unchanged while editing metadata.</p>
                                )}
                                <label className={styles.field}>
                                    <span>Artwork URL <small>optional</small></span>
                                    <input
                                        type="url"
                                        maxLength={1000}
                                        value={episodeForm.artworkUrl}
                                        onChange={(event) => setEpisodeForm((current) => ({ ...current, artworkUrl: event.target.value }))}
                                        placeholder="Use a URL, upload artwork above, or inherit the show cover"
                                    />
                                </label>
                                <button type="submit" className={styles.primaryButton} disabled={episodeSaving || Boolean(pendingAction && !episodeSaving)}>
                                    {episodeSaving
                                        ? <LoaderCircle className={styles.spinner} size={18} aria-hidden="true" />
                                        : editingEpisodeId
                                            ? <Save size={18} aria-hidden="true" />
                                            : <UploadCloud size={18} aria-hidden="true" />}
                                    {episodeSaving
                                        ? "Saving…"
                                        : editingEpisodeId
                                            ? "Save Episode"
                                            : episodeForm.status === "published"
                                                ? "Upload and Publish"
                                                : "Upload and Save"}
                                </button>
                            </form>
                        )}
                    </section>
                    ) : null}

                    <section className={styles.panel} aria-labelledby="studio-episodes-heading">
                        <div className={styles.panelHeading}>
                            <div>
                                <p className={styles.eyebrow}>Existing Episodes</p>
                                <h3 id="studio-episodes-heading">
                                    {selectedShow ? `${selectedShow.title} episodes` : "Episodes"}
                                </h3>
                            </div>
                            <span className={styles.countPill}>{selectedEpisodes.length}</span>
                        </div>
                        {selectedEpisodes.length === 0 ? (
                            <div className={styles.compactEmpty}>
                                <FileAudio size={27} aria-hidden="true" />
                                <strong>No episodes in this show</strong>
                                <span>Use the episode form to upload the first release.</span>
                            </div>
                        ) : (
                            <div className={styles.studioEpisodeList}>
                                {selectedEpisodes.map((episode) => {
                                    const artworkUrl = episode.thumbnailUrl || episode.artworkUrl || selectedShow?.coverImageUrl || "";
                                    const statusPending = pendingAction === `episode-status:${episode.id}`;
                                    const deletePending = pendingAction === `delete-episode:${episode.id}`;
                                    const previewPending = pendingAction === `preview:${episode.id}`;
                                    return (
                                        <article key={episode.id} className={styles.studioEpisode}>
                                            <div
                                                className={styles.episodeThumb}
                                                style={imageStyle(artworkUrl)}
                                                role="img"
                                                aria-label={`Artwork for ${episode.title}`}
                                            >
                                                {!artworkUrl
                                                    ? episode.episodeType === "video"
                                                        ? <FileVideo size={22} aria-hidden="true" />
                                                        : <FileAudio size={22} aria-hidden="true" />
                                                    : null}
                                            </div>
                                            <div className={styles.studioEpisodeCopy}>
                                                <div className={styles.episodeTitleLine}>
                                                    <strong>{episode.title}</strong>
                                                    <span className={episode.episodeType === "video" ? styles.videoBadge : styles.audioBadge}>
                                                        {episode.episodeType}
                                                    </span>
                                                    <span className={styles.statusPill}>{statusLabel(episode.status)}</span>
                                                </div>
                                                <span>
                                                    Season {episode.seasonNumber || 1}, episode {episode.episodeNumber}
                                                    {" · "}
                                                    {episode.episodeType === "video"
                                                        ? `${episode.viewCount} views · ${episode.likeCount ?? 0} likes`
                                                        : `${episode.playCount} plays · ${episode.likeCount ?? 0} likes`}
                                                </span>
                                            </div>
                                            <div className={styles.episodeManagerActions}>
                                                {onPlayPodcast ? (
                                                    <button
                                                        type="button"
                                                        onClick={() => void previewEpisode(episode)}
                                                        disabled={Boolean(pendingAction)}
                                                        aria-label={`Preview ${episode.title}`}
                                                    >
                                                        {previewPending
                                                            ? <LoaderCircle className={styles.spinner} size={16} aria-hidden="true" />
                                                            : <Play size={16} fill="currentColor" aria-hidden="true" />}
                                                        Preview
                                                    </button>
                                                ) : null}
                                                <button
                                                    type="button"
                                                    onClick={() => startEditingEpisode(episode)}
                                                    aria-label={`Edit ${episode.title}`}
                                                >
                                                    <Edit3 size={16} aria-hidden="true" />
                                                    Edit
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => void changeEpisodeStatus(episode)}
                                                    disabled={Boolean(pendingAction)}
                                                    aria-label={`${episode.status === "published" ? "Unpublish" : "Publish"} ${episode.title}`}
                                                >
                                                    {statusPending
                                                        ? <LoaderCircle className={styles.spinner} size={16} aria-hidden="true" />
                                                        : <Send size={16} aria-hidden="true" />}
                                                    {episode.status === "published" ? "Unpublish" : "Publish"}
                                                </button>
                                                <button
                                                    type="button"
                                                    className={styles.dangerTextButton}
                                                    onClick={() => void deleteEpisode(episode)}
                                                    disabled={Boolean(pendingAction)}
                                                    aria-label={`Delete ${episode.title}`}
                                                >
                                                    {deletePending
                                                        ? <LoaderCircle className={styles.spinner} size={16} aria-hidden="true" />
                                                        : <Trash2 size={16} aria-hidden="true" />}
                                                    Delete
                                                </button>
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
