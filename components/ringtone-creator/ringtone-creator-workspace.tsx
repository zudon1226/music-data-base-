"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { Session } from "@supabase/supabase-js";
import {
    RINGTONE_ALLOWED_AUDIO_MIME_TYPES,
    RINGTONE_DEFAULT_DURATION_SECONDS,
    RINGTONE_SOURCE_MAX_BYTES,
    RINGTONE_STATUSES,
    type RingtoneStatus,
} from "@/lib/ringtone-constants";
import {
    clampRingtoneDuration,
    createEmptyRingtoneForm,
    deleteOrArchiveRingtone,
    duplicateRingtone,
    formatRingtoneClientError,
    returnRingtoneToReview,
    fetchMyRingtones,
    fetchOwnedSourceSongs,
    fetchRingtoneSales,
    formToSavePayload,
    formatClipClock,
    formatRingtoneMoney,
    maxClipStartSeconds,
    prepareRingtoneSourceUpload,
    saveRingtoneDraft,
    signRingtoneSourceUrl,
    submitRingtoneForReview,
    type CreateRingtoneFormState,
    type RingtoneProduct,
    type RingtoneSalesSummary,
    type RingtoneSourceSong,
} from "@/lib/ringtone-creator-client";
import { useTranslation } from "@/lib/i18n/provider";
import { getDesktopSupabaseClient } from "@/lib/supabase";
import { RingtoneClipTimeline } from "./ringtone-clip-timeline";

export type RingtonePreviewRequest = {
    id: string;
    title: string;
    artworkUrl: string;
    audioUrl: string;
    clipStartSeconds: number;
    clipEndSeconds: number;
    durationSeconds: number;
};

type RingtoneCreatorWorkspaceProps = {
    userId: string;
    session: Session | null;
    canCreateRingtones: boolean;
    accessDenied: boolean;
    onPreviewRingtone: (request: RingtonePreviewRequest) => void;
    onStopRingtonePreview: () => void;
    activeRingtonePreviewId: string | null;
    ringtonePreviewPlaying: boolean;
};

type WizardStep = 1 | 2 | 3 | 4 | 5;
type ListFilter = "all" | RingtoneStatus;
type ListSort = "newest" | "oldest" | "title" | "price" | "status";
type ProcessState = "idle" | "uploading" | "processing" | "ready" | "failed";

const FILTERS: ListFilter[] = [
    "all",
    "draft",
    "processing",
    "pending_review",
    "approved",
    "rejected",
    "published",
    "suspended",
    "archived",
];

export function RingtoneCreatorWorkspace({
    userId,
    session,
    canCreateRingtones,
    accessDenied,
    onPreviewRingtone,
    onStopRingtonePreview,
    activeRingtonePreviewId,
    ringtonePreviewPlaying,
}: RingtoneCreatorWorkspaceProps) {
    const { t } = useTranslation();
    const [mode, setMode] = useState<"list" | "create" | "sales">("list");
    const [ringtones, setRingtones] = useState<RingtoneProduct[]>([]);
    const [sourceSongs, setSourceSongs] = useState<RingtoneSourceSong[]>([]);
    const [salesSummary, setSalesSummary] = useState<RingtoneSalesSummary>({
        saleCount: 0,
        earningsCents: 0,
        revenueCents: 0,
        currency: "USD",
    });
    const [filter, setFilter] = useState<ListFilter>("all");
    const [sort, setSort] = useState<ListSort>("newest");
    const [search, setSearch] = useState("");
    const [step, setStep] = useState<WizardStep>(1);
    const [form, setForm] = useState<CreateRingtoneFormState>(createEmptyRingtoneForm());
    const [editingId, setEditingId] = useState<string>("");
    const [error, setError] = useState("");
    const [statusMessage, setStatusMessage] = useState("");
    const [processState, setProcessState] = useState<ProcessState>("idle");
    const [loading, setLoading] = useState(true);
    const [pending, startTransition] = useTransition();
    const [sourceFileName, setSourceFileName] = useState("");
    const [sourceSongsLoading, setSourceSongsLoading] = useState(false);
    const [sourceSongsError, setSourceSongsError] = useState("");
    const submitLockRef = useRef(false);
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    const statusLabel = (ringtone: RingtoneProduct | string) => {
        if (typeof ringtone === "string") {
            const map: Record<string, string> = {
                draft: t("ringtones.draft"),
                processing: t("ringtones.processing"),
                pending_review: t("ringtones.pendingReview"),
                approved: t("ringtones.approved"),
                rejected: t("ringtones.rejected"),
                published: t("ringtones.published"),
                suspended: t("ringtones.suspended"),
                archived: t("ringtones.archived"),
            };
            return map[ringtone] || ringtone;
        }
        if (ringtone.last_processing_error_code && ringtone.status === "draft") {
            return t("ringtones.processingFailed");
        }
        if (ringtone.status === "processing") return t("ringtones.processing");
        const map: Record<string, string> = {
            draft: t("ringtones.draft"),
            processing: t("ringtones.processing"),
            pending_review: t("ringtones.pendingReview"),
            approved: t("ringtones.approved"),
            rejected: t("ringtones.rejected"),
            published: t("ringtones.published"),
            suspended: t("ringtones.suspended"),
            archived: t("ringtones.archived"),
        };
        return map[ringtone.status] || ringtone.status;
    };

    async function reloadAll() {
        setLoading(true);
        setSourceSongsLoading(true);
        setError("");
        setSourceSongsError("");
        const [mine, songs, sales] = await Promise.all([
            fetchMyRingtones(userId, session),
            fetchOwnedSourceSongs(userId, session),
            fetchRingtoneSales(userId, session),
        ]);
        if (!mine.ok) {
            setError(mine.error || t("ringtones.creatorAccessDenied"));
            setRingtones([]);
        } else {
            setRingtones(mine.ringtones);
        }
        if (!songs.ok) {
            setSourceSongs([]);
            setSourceSongsError(songs.error || t("ringtones.actionCouldNotComplete"));
            console.warn("[ringtone-creator] source-songs load failed", {
                userId,
                status: songs.status,
                error: songs.error,
            });
        } else {
            setSourceSongs(songs.songs);
            console.info("[ringtone-creator] source-songs loaded", {
                userId,
                eligibleCount: songs.songs.length,
            });
        }
        if (sales.ok) setSalesSummary(sales.summary);
        setSourceSongsLoading(false);
        setLoading(false);
    }

    useEffect(() => {
        if (!canCreateRingtones || !userId) {
            setLoading(false);
            return;
        }
        void reloadAll();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [canCreateRingtones, userId, session?.access_token]);

    const filteredRingtones = useMemo(() => {
        const query = search.trim().toLowerCase();
        let rows = [...ringtones];
        if (filter !== "all") rows = rows.filter((row) => row.status === filter);
        if (query) {
            rows = rows.filter((row) => {
                const sourceTitle = sourceSongs.find((song) => song.id === row.source_song_id)?.title || "";
                return row.title.toLowerCase().includes(query)
                    || sourceTitle.toLowerCase().includes(query);
            });
        }
        rows.sort((a, b) => {
            if (sort === "title") return a.title.localeCompare(b.title);
            if (sort === "price") return a.price_cents - b.price_cents;
            if (sort === "status") return a.status.localeCompare(b.status);
            if (sort === "oldest") {
                return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
            }
            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        });
        return rows;
    }, [filter, ringtones, search, sort, sourceSongs]);

    function updateForm(patch: Partial<CreateRingtoneFormState>) {
        setForm((previous) => ({ ...previous, ...patch }));
    }

    function beginCreate() {
        setEditingId("");
        setForm(createEmptyRingtoneForm());
        setSourceFileName("");
        setStep(1);
        setProcessState("idle");
        setError("");
        setStatusMessage("");
        setMode("create");
        onStopRingtonePreview();
    }

    function beginEdit(ringtone: RingtoneProduct) {
        const sourceSong = sourceSongs.find((song) => song.id === ringtone.source_song_id);
        setEditingId(ringtone.id);
        setForm({
            sourceKind: ringtone.source_kind,
            sourceSongId: ringtone.source_song_id || "",
            sourceSongTitle: sourceSong?.title || "",
            sourceAudioUrl: sourceSong?.audioUrl || ringtone.preview_url || "",
            sourceStoragePath: ringtone.source_storage_path || "",
            sourceDurationSeconds: sourceSong?.durationSeconds
                || Number((ringtone.clip_end_seconds || 0) + 1)
                || ringtone.duration_seconds,
            ownershipConfirmed: Boolean(ringtone.ownership_confirmed),
            clipStartSeconds: Number(ringtone.clip_start_seconds) || 0,
            durationSeconds: Number(ringtone.duration_seconds) || 30,
            title: ringtone.title,
            description: ringtone.description || "",
            artworkUrl: ringtone.artwork_url || "",
            priceDollars: ((Number(ringtone.price_cents) || 0) / 100).toFixed(2),
            currency: (ringtone.currency as CreateRingtoneFormState["currency"]) || "USD",
            isExplicit: Boolean(ringtone.is_explicit),
            iphoneAvailable: ringtone.iphone_available !== false,
            androidAvailable: ringtone.android_available !== false,
        });
        setStep(2);
        setMode("create");
        setError("");
        setStatusMessage("");
        setProcessState("ready");
    }

    async function selectOwnedSong(song: RingtoneSourceSong) {
        if (!song.audioUrl && !song.storagePath) {
            setError(t("ringtones.previewUnavailable"));
            return;
        }
        if (song.durationSeconds > 0 && song.durationSeconds < 15) {
            setError(t("ringtones.sourceTooShort"));
            return;
        }
        const duration = clampRingtoneDuration(song.durationSeconds || RINGTONE_DEFAULT_DURATION_SECONDS);
        updateForm({
            sourceKind: "owned_song",
            sourceSongId: song.id,
            sourceSongTitle: song.title,
            sourceAudioUrl: song.audioUrl,
            sourceStoragePath: song.storagePath || "",
            sourceDurationSeconds: song.durationSeconds,
            ownershipConfirmed: true,
            artworkUrl: form.artworkUrl || song.artworkUrl,
            title: form.title || `${song.title} Ringtone`,
            durationSeconds: duration,
            clipStartSeconds: Math.min(form.clipStartSeconds, maxClipStartSeconds(song.durationSeconds || duration, duration)),
        });
        setSourceFileName("");
        setProcessState("ready");
        setError("");
        setStep(2);
    }

    function switchSourceKind(nextKind: "owned_song" | "upload") {
        if (form.sourceKind === nextKind) return;
        updateForm({
            sourceKind: nextKind,
            sourceSongId: "",
            sourceSongTitle: "",
            sourceAudioUrl: "",
            sourceStoragePath: "",
            sourceDurationSeconds: 0,
            ownershipConfirmed: nextKind === "owned_song",
            clipStartSeconds: 0,
            durationSeconds: RINGTONE_DEFAULT_DURATION_SECONDS,
        });
        setSourceFileName("");
        setProcessState("idle");
        setError("");
        if (fileInputRef.current) fileInputRef.current.value = "";
        onStopRingtonePreview();
    }

    async function handleSourceUpload(file: File | null) {
        if (!file) return;
        setSourceFileName(file.name);
        if (!form.ownershipConfirmed) {
            setError(t("ringtones.ownershipRequired"));
            return;
        }
        const mimeType = (file.type || "").toLowerCase();
        if (!(RINGTONE_ALLOWED_AUDIO_MIME_TYPES as readonly string[]).includes(mimeType)) {
            setError(t("ringtones.unsupportedAudioType"));
            return;
        }
        if (file.size > RINGTONE_SOURCE_MAX_BYTES) {
            setError(t("ringtones.fileTooLarge"));
            return;
        }

        setProcessState("uploading");
        setStatusMessage(t("ringtones.uploading"));
        setError("");
        try {
            const prepared = await prepareRingtoneSourceUpload({
                userId,
                session,
                mimeType,
                byteLength: file.size,
                ownershipConfirmed: true,
            });
            if (!prepared.ok) {
                throw new Error(String(prepared.body.error || t("ringtones.uploadFailed")));
            }
            const token = String(prepared.body.token || "");
            const storagePath = String(prepared.body.storagePath || "");
            const bucket = String(prepared.body.bucket || "ringtone-source");
            if (!token || !storagePath) {
                throw new Error(t("ringtones.uploadFailed"));
            }

            const desktopSupabase = getDesktopSupabaseClient();
            const uploaded = await desktopSupabase.storage
                .from(bucket)
                .uploadToSignedUrl(storagePath, token, file, {
                    contentType: mimeType,
                    upsert: false,
                });
            if (uploaded.error) {
                throw new Error(uploaded.error.message || t("ringtones.uploadFailed"));
            }

            const signed = await signRingtoneSourceUrl({ userId, session, storagePath });
            if (!signed.ok) {
                throw new Error(String(signed.body.error || t("ringtones.uploadFailed")));
            }

            const objectUrl = URL.createObjectURL(file);
            const audio = new Audio(objectUrl);
            await new Promise<void>((resolve, reject) => {
                audio.onloadedmetadata = () => resolve();
                audio.onerror = () => reject(new Error(t("ringtones.uploadFailed")));
            });
            const sourceDurationSeconds = Number(audio.duration) || 0;
            URL.revokeObjectURL(objectUrl);
            if (sourceDurationSeconds < 15) {
                setProcessState("failed");
                setError(t("ringtones.sourceTooShort"));
                return;
            }

            const duration = clampRingtoneDuration(sourceDurationSeconds);
            updateForm({
                sourceKind: "upload",
                sourceSongId: "",
                sourceSongTitle: "",
                sourceAudioUrl: String(signed.body.signedUrl || ""),
                sourceStoragePath: storagePath,
                sourceDurationSeconds,
                durationSeconds: duration,
                clipStartSeconds: 0,
                title: form.title || file.name.replace(/\.[^.]+$/, "").slice(0, 120),
            });
            setProcessState("ready");
            setStatusMessage(t("ringtones.ready"));
            setStep(2);
        } catch (uploadError) {
            setProcessState("failed");
            setError(uploadError instanceof Error ? uploadError.message : t("ringtones.uploadFailed"));
        }
    }

    async function previewCurrentClip() {
        let audioUrl = form.sourceAudioUrl;
        if (form.sourceKind === "upload" && form.sourceStoragePath) {
            const signed = await signRingtoneSourceUrl({
                userId,
                session,
                storagePath: form.sourceStoragePath,
            });
            if (signed.ok) audioUrl = String(signed.body.signedUrl || audioUrl);
        }
        if (!audioUrl) {
            setError(t("ringtones.previewUnavailable"));
            return;
        }
        onPreviewRingtone({
            id: editingId || `draft-${form.sourceSongId || form.sourceStoragePath || "new"}`,
            title: form.title || t("ringtones.previewRingtone"),
            artworkUrl: form.artworkUrl,
            audioUrl,
            clipStartSeconds: form.clipStartSeconds,
            clipEndSeconds: form.clipStartSeconds + form.durationSeconds,
            durationSeconds: form.durationSeconds,
        });
    }

    async function persist(submitForReview: boolean) {
        if (submitLockRef.current || pending) return;
        submitLockRef.current = true;
        setError("");
        setStatusMessage(submitForReview ? t("ringtones.submitting") : t("ringtones.savingDraft"));
        setProcessState("processing");

        startTransition(async () => {
            try {
                const payload = formToSavePayload(form, !editingId && submitForReview);
                if (!Number.isFinite(Number(payload.priceCents)) || Number(payload.priceCents) < 0) {
                    throw new Error(t("ringtones.invalidPrice"));
                }
                const saved = await saveRingtoneDraft({
                    userId,
                    session,
                    ringtoneId: editingId || undefined,
                    payload,
                });
                if (!saved.ok) {
                    throw new Error(String(saved.body.error || t("ringtones.saveFailed")));
                }
                const ringtone = saved.body.ringtone as RingtoneProduct;
                setEditingId(ringtone.id);

                if (submitForReview) {
                    const submitted = await submitRingtoneForReview({
                        userId,
                        session,
                        ringtoneId: ringtone.id,
                    });
                    if (!submitted.ok) {
                        throw new Error(String(submitted.body.error || t("ringtones.submitFailed")));
                    }
                    const next = (submitted.body.ringtone || {}) as RingtoneProduct;
                    if (next.status === "pending_review") {
                        setStatusMessage(t("ringtones.submittedForReview"));
                    } else if (next.status === "processing") {
                        setStatusMessage(t("ringtones.processingStarted"));
                    } else {
                        setStatusMessage(t("ringtones.processingCompleted"));
                    }
                } else {
                    setStatusMessage(t("ringtones.draftSaved"));
                }

                setProcessState("ready");
                await reloadAll();
                if (submitForReview) {
                    setMode("list");
                    onStopRingtonePreview();
                }
            } catch (saveError) {
                setProcessState("failed");
                setError(saveError instanceof Error ? saveError.message : t("ringtones.saveFailed"));
            } finally {
                submitLockRef.current = false;
            }
        });
    }

    if (accessDenied || !canCreateRingtones) {
        return (
            <section className="ringtone-creator-page dashboard-page" data-ringtone-creator="denied">
                <h1>{t("ringtones.myRingtones")}</h1>
                <p className="ringtone-access-denied" role="alert">{t("ringtones.creatorAccessDenied")}</p>
            </section>
        );
    }

    return (
        <section className="ringtone-creator-page dashboard-page" data-ringtone-creator="workspace">
            <header className="ringtone-creator-header">
                <div>
                    <h1>{t("ringtones.myRingtones")}</h1>
                    <p>{t("ringtones.creatorSubtitle")}</p>
                </div>
                <div className="ringtone-creator-actions" role="tablist" aria-label={t("ringtones.myRingtones")}>
                    <button
                        type="button"
                        role="tab"
                        aria-selected={mode === "list"}
                        aria-current={mode === "list" ? "page" : undefined}
                        className={mode === "list" ? "active" : ""}
                        onClick={() => setMode("list")}
                    >
                        {t("ringtones.myRingtones")}
                    </button>
                    <button
                        type="button"
                        role="tab"
                        aria-selected={mode === "create"}
                        aria-current={mode === "create" ? "page" : undefined}
                        className={mode === "create" ? "active" : ""}
                        onClick={beginCreate}
                    >
                        {t("ringtones.create")}
                    </button>
                    <button
                        type="button"
                        role="tab"
                        aria-selected={mode === "sales"}
                        aria-current={mode === "sales" ? "page" : undefined}
                        className={mode === "sales" ? "active" : ""}
                        onClick={() => setMode("sales")}
                    >
                        {t("ringtones.sales")}
                    </button>
                </div>
            </header>

            <div className="sr-only" aria-live="polite">{statusMessage}</div>
            {error ? <p className="ringtone-error" role="alert">{error}</p> : null}

            {mode === "sales" ? (
                <div className="dashboard-panel ringtone-sales-panel">
                    <h2>{t("ringtones.earnings")}</h2>
                    <div className="dashboard-grid">
                        <div>
                            <strong>{salesSummary.saleCount}</strong>
                            <span>{t("ringtones.sales")}</span>
                        </div>
                        <div>
                            <strong>{formatRingtoneMoney(salesSummary.earningsCents, salesSummary.currency)}</strong>
                            <span>{t("ringtones.earnings")}</span>
                        </div>
                        <div>
                            <strong>{formatRingtoneMoney(salesSummary.revenueCents, salesSummary.currency)}</strong>
                            <span>{t("ringtones.price")}</span>
                        </div>
                        <div>
                            <strong>{formatRingtoneMoney((salesSummary as { platformFeeCents?: number }).platformFeeCents || 0, salesSummary.currency)}</strong>
                            <span>{t("ringtones.platformFees")}</span>
                        </div>
                    </div>
                </div>
            ) : null}

            {mode === "list" ? (
                <div className="ringtone-list-shell">
                    <div className="ringtone-list-controls">
                        <label>
                            <span className="sr-only">{t("ringtones.search")}</span>
                            <input
                                value={search}
                                onChange={(event) => setSearch(event.target.value)}
                                placeholder={t("ringtones.searchPlaceholder")}
                            />
                        </label>
                        <label>
                            <span>{t("ringtones.filter")}</span>
                            <select value={filter} onChange={(event) => setFilter(event.target.value as ListFilter)}>
                                {FILTERS.map((value) => (
                                    <option key={value} value={value}>
                                        {value === "all" ? t("ringtones.filterAll") : statusLabel(value)}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <label>
                            <span>{t("ringtones.sort")}</span>
                            <select value={sort} onChange={(event) => setSort(event.target.value as ListSort)}>
                                <option value="newest">{t("ringtones.sortNewest")}</option>
                                <option value="oldest">{t("ringtones.sortOldest")}</option>
                                <option value="title">{t("ringtones.sortTitle")}</option>
                                <option value="price">{t("ringtones.sortPrice")}</option>
                                <option value="status">{t("ringtones.sortStatus")}</option>
                            </select>
                        </label>
                        <button type="button" className="save-upload" onClick={beginCreate}>
                            {t("ringtones.create")}
                        </button>
                    </div>

                    {loading ? <p>{t("ringtones.loading")}</p> : null}
                    {!loading && filteredRingtones.length === 0 ? (
                        <div className="dashboard-empty-card">
                            <p>{t("ringtones.emptyList")}</p>
                            <button type="button" className="save-upload" onClick={beginCreate}>
                                {t("ringtones.create")}
                            </button>
                        </div>
                    ) : null}

                    <div className="ringtone-card-grid">
                        {filteredRingtones.map((ringtone) => {
                            const sourceLabel = ringtone.source_kind === "owned_song"
                                ? (sourceSongs.find((song) => song.id === ringtone.source_song_id)?.title
                                    || t("ringtones.existingSong"))
                                : t("ringtones.uploadSource");
                            const canEdit = ["draft", "processing", "pending_review", "rejected", "archived"].includes(ringtone.status);
                            return (
                                <article key={ringtone.id} className="dashboard-panel ringtone-card">
                                    <img
                                        src={ringtone.artwork_url || "/music-data-base-logo.png"}
                                        alt=""
                                        width={72}
                                        height={72}
                                    />
                                    <div className="ringtone-card-body">
                                        <h3>{ringtone.title}</h3>
                                        <p>{sourceLabel}</p>
                                        <p>
                                            {ringtone.duration_seconds}s · {formatRingtoneMoney(ringtone.price_cents, ringtone.currency)} · {statusLabel(ringtone)}
                                            {ringtone.revision_number ? ` · ${t("ringtones.revision")} ${ringtone.revision_number}` : ""}
                                        </p>
                                        <p className="ringtone-card-dates">
                                            {t("ringtones.created")}: {new Date(ringtone.created_at).toLocaleDateString()}
                                            {" · "}
                                            {t("ringtones.updated")}: {new Date(ringtone.updated_at).toLocaleDateString()}
                                        </p>
                                        {ringtone.status === "processing" ? (
                                            <p className="ringtone-processing" role="status" aria-live="polite">
                                                {t("ringtones.processingStarted")}
                                            </p>
                                        ) : null}
                                        {ringtone.last_processing_error ? (
                                            <p className="ringtone-rejection" role="status">
                                                {t("ringtones.processingFailed")}: {ringtone.last_processing_error}
                                            </p>
                                        ) : null}
                                        {ringtone.status === "rejected" && ringtone.review_notes ? (
                                            <p className="ringtone-rejection" role="status">
                                                {t("ringtones.rejectionReason")}: {ringtone.review_notes}
                                            </p>
                                        ) : null}
                                        <div className="ringtone-card-actions">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const song = sourceSongs.find((item) => item.id === ringtone.source_song_id);
                                                    const audioUrl = ringtone.preview_url || song?.audioUrl || "";
                                                    if (!audioUrl) {
                                                        setError(t("ringtones.previewUnavailable"));
                                                        return;
                                                    }
                                                    onPreviewRingtone({
                                                        id: ringtone.id,
                                                        title: ringtone.title,
                                                        artworkUrl: ringtone.artwork_url,
                                                        audioUrl,
                                                        clipStartSeconds: Number(ringtone.clip_start_seconds) || 0,
                                                        clipEndSeconds: Number(ringtone.clip_end_seconds) || Number(ringtone.duration_seconds) || 30,
                                                        durationSeconds: Number(ringtone.duration_seconds) || 30,
                                                    });
                                                }}
                                            >
                                                {activeRingtonePreviewId === ringtone.id && ringtonePreviewPlaying
                                                    ? t("ringtones.pausePreview")
                                                    : t("ringtones.previewRingtone")}
                                            </button>
                                            {canEdit && ringtone.status !== "archived" ? (
                                                <button type="button" onClick={() => beginEdit(ringtone)}>
                                                    {t("ringtones.edit")}
                                                </button>
                                            ) : null}
                                            {["published", "suspended", "archived"].includes(ringtone.status) ? (
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        startTransition(async () => {
                                                            const result = await returnRingtoneToReview({
                                                                userId,
                                                                session,
                                                                ringtoneId: ringtone.id,
                                                                status: ringtone.status,
                                                            });
                                                            if (!result.ok) {
                                                                setError(formatRingtoneClientError(
                                                                    result.body.error || t("ringtones.actionCouldNotComplete"),
                                                                    t("ringtones.actionCouldNotComplete"),
                                                                ));
                                                                return;
                                                            }
                                                            setStatusMessage(t("ringtones.requestRevision"));
                                                            await reloadAll();
                                                        });
                                                    }}
                                                >
                                                    {t("ringtones.requestRevision")}
                                                </button>
                                            ) : null}
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    startTransition(async () => {
                                                        const result = await duplicateRingtone({
                                                            userId,
                                                            session,
                                                            ringtoneId: ringtone.id,
                                                        });
                                                        if (!result.ok) {
                                                            setError(formatRingtoneClientError(
                                                                result.body.error || t("ringtones.duplicateFailed"),
                                                                t("ringtones.actionCouldNotComplete"),
                                                            ));
                                                            return;
                                                        }
                                                        await reloadAll();
                                                    });
                                                }}
                                            >
                                                {t("ringtones.duplicate")}
                                            </button>
                                            {["draft", "rejected"].includes(ringtone.status) ? (
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        if (submitLockRef.current) return;
                                                        submitLockRef.current = true;
                                                        startTransition(async () => {
                                                            try {
                                                                const result = await submitRingtoneForReview({
                                                                    userId,
                                                                    session,
                                                                    ringtoneId: ringtone.id,
                                                                    retry: Boolean(ringtone.last_processing_error_code),
                                                                });
                                                                if (!result.ok) {
                                                                    setError(String(result.body.error || t("ringtones.submitFailed")));
                                                                    return;
                                                                }
                                                                setStatusMessage(t("ringtones.submittedForReview"));
                                                                await reloadAll();
                                                            } finally {
                                                                submitLockRef.current = false;
                                                            }
                                                        });
                                                    }}
                                                >
                                                    {ringtone.last_processing_error_code
                                                        ? t("ringtones.retryProcessing")
                                                        : t("ringtones.submitForReview")}
                                                </button>
                                            ) : null}
                                            {ringtone.status === "draft" ? (
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        if (!window.confirm(t("ringtones.confirmDeleteRingtone"))) return;
                                                        startTransition(async () => {
                                                            const result = await deleteOrArchiveRingtone({
                                                                userId,
                                                                session,
                                                                ringtoneId: ringtone.id,
                                                                status: ringtone.status,
                                                            });
                                                            if (!result.ok) {
                                                                setError(formatRingtoneClientError(
                                                                    result.body.error || t("ringtones.deleteFailed"),
                                                                    t("ringtones.actionCouldNotComplete"),
                                                                ));
                                                                return;
                                                            }
                                                            const action = String(result.body.action || "");
                                                            if (action === "archived") {
                                                                setStatusMessage(t("ringtones.ringtoneArchivedInstead"));
                                                            } else if (action === "already_archived") {
                                                                setStatusMessage(t("ringtones.ringtoneAlreadyArchived"));
                                                            } else {
                                                                setStatusMessage(t("ringtones.ringtoneDeleted"));
                                                            }
                                                            await reloadAll();
                                                        });
                                                    }}
                                                >
                                                    {t("ringtones.delete")}
                                                </button>
                                            ) : null}
                                            {["published", "approved", "suspended", "rejected"].includes(ringtone.status) ? (
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        startTransition(async () => {
                                                            const result = await deleteOrArchiveRingtone({
                                                                userId,
                                                                session,
                                                                ringtoneId: ringtone.id,
                                                                status: ringtone.status,
                                                            });
                                                            if (!result.ok) {
                                                                setError(formatRingtoneClientError(
                                                                    result.body.error || t("ringtones.deleteFailed"),
                                                                    t("ringtones.actionCouldNotComplete"),
                                                                ));
                                                                return;
                                                            }
                                                            setStatusMessage(t("ringtones.archived"));
                                                            await reloadAll();
                                                        });
                                                    }}
                                                >
                                                    {t("ringtones.archiveRingtone")}
                                                </button>
                                            ) : null}
                                            {ringtone.status === "archived" ? (
                                                <button type="button" disabled aria-disabled="true">
                                                    {t("ringtones.archived")}
                                                </button>
                                            ) : null}
                                        </div>
                                    </div>
                                </article>
                            );
                        })}
                    </div>
                </div>
            ) : null}

            {mode === "create" ? (
                <div className="upload-shell ringtone-wizard" data-ringtone-wizard-step={step}>
                    <div
                        className="upload-mode-tabs ringtone-wizard-steps"
                        role="tablist"
                        aria-label={t("ringtones.create")}
                    >
                        {[1, 2, 3, 4, 5].map((value) => (
                            <button
                                key={value}
                                type="button"
                                role="tab"
                                aria-selected={step === value}
                                aria-current={step === value ? "step" : undefined}
                                className={step === value ? "active" : ""}
                                onClick={() => setStep(value as WizardStep)}
                            >
                                {value === 1 ? t("ringtones.chooseSource")
                                    : value === 2 ? t("ringtones.selectClip")
                                        : value === 3 ? t("ringtones.productDetails")
                                            : value === 4 ? t("ringtones.review")
                                                : t("ringtones.saveDraft")}
                            </button>
                        ))}
                    </div>

                    <div className="upload-card ringtone-wizard-card">
                        <p className="ringtone-process-state" role="status">
                            {processState === "uploading" ? t("ringtones.uploading")
                                : processState === "processing" ? t("ringtones.processing")
                                    : processState === "failed" ? t("ringtones.failed")
                                        : processState === "ready" ? t("ringtones.ready")
                                            : t("ringtones.chooseSource")}
                        </p>

                        {step === 1 ? (
                            <div className="ringtone-step">
                                <h2>{t("ringtones.chooseSource")}</h2>
                                <div className="upload-mode-tabs ringtone-source-tabs" role="group" aria-label={t("ringtones.chooseSource")}>
                                    <button
                                        type="button"
                                        aria-pressed={form.sourceKind === "owned_song"}
                                        className={form.sourceKind === "owned_song" ? "active" : ""}
                                        onClick={() => switchSourceKind("owned_song")}
                                    >
                                        {t("ringtones.createFromSong")}
                                    </button>
                                    <button
                                        type="button"
                                        aria-pressed={form.sourceKind === "upload"}
                                        className={form.sourceKind === "upload" ? "active" : ""}
                                        onClick={() => switchSourceKind("upload")}
                                    >
                                        {t("ringtones.uploadSource")}
                                    </button>
                                </div>

                                {form.sourceKind === "owned_song" ? (
                                    <div className="ringtone-source-list" role="listbox" aria-label={t("ringtones.existingSong")}>
                                        {sourceSongsLoading ? <p>{t("ringtones.loading")}</p> : null}
                                        {!sourceSongsLoading && sourceSongsError ? (
                                            <p className="ringtone-error" role="alert">{sourceSongsError}</p>
                                        ) : null}
                                        {!sourceSongsLoading && !sourceSongsError && sourceSongs.length === 0 ? (
                                            <p>{t("ringtones.noOwnedSongs")}</p>
                                        ) : null}
                                        {!sourceSongsLoading && !sourceSongsError
                                            ? sourceSongs.map((song) => (
                                            <article
                                                key={song.id}
                                                className={`ringtone-source-card${form.sourceSongId === song.id ? " selected" : ""}`}
                                                role="option"
                                                aria-selected={form.sourceSongId === song.id}
                                            >
                                                <img src={song.artworkUrl || "/music-data-base-logo.png"} alt="" width={48} height={48} />
                                                <div className="ringtone-source-card-body">
                                                    <strong>{song.title}</strong>
                                                    <small>
                                                        {song.artist || t("ringtones.existingSong")}
                                                        {song.durationSeconds > 0 ? ` · ${formatClipClock(song.durationSeconds)}` : ""}
                                                    </small>
                                                    <button
                                                        type="button"
                                                        className="ringtone-use-song-btn"
                                                        onClick={() => void selectOwnedSong(song)}
                                                    >
                                                        {t("ringtones.create")}
                                                    </button>
                                                </div>
                                            </article>
                                            ))
                                            : null}
                                    </div>
                                ) : (
                                    <div className="ringtone-upload-source">
                                        <label className="ringtone-checkbox" htmlFor="ringtone-ownership-upload">
                                            <input
                                                id="ringtone-ownership-upload"
                                                type="checkbox"
                                                checked={form.ownershipConfirmed}
                                                onChange={(event) => updateForm({ ownershipConfirmed: event.target.checked })}
                                            />
                                            <span>{t("ringtones.ownershipConfirmation")}</span>
                                        </label>
                                        <div className="ringtone-file-row">
                                            <input
                                                ref={fileInputRef}
                                                type="file"
                                                accept={RINGTONE_ALLOWED_AUDIO_MIME_TYPES.join(",")}
                                                disabled={!form.ownershipConfirmed || processState === "uploading"}
                                                onChange={(event) => void handleSourceUpload(event.target.files?.[0] || null)}
                                            />
                                            {sourceFileName ? (
                                                <span className="ringtone-file-name" title={sourceFileName}>
                                                    {sourceFileName}
                                                </span>
                                            ) : null}
                                        </div>
                                        {processState === "failed" ? (
                                            <button type="button" onClick={() => fileInputRef.current?.click()}>
                                                {t("ringtones.retryUpload")}
                                            </button>
                                        ) : null}
                                    </div>
                                )}
                            </div>
                        ) : null}

                        {step === 2 ? (
                            <div className="ringtone-step">
                                <h2>{t("ringtones.selectClip")}</h2>
                                <RingtoneClipTimeline
                                    sourceDurationSeconds={form.sourceDurationSeconds}
                                    clipStartSeconds={form.clipStartSeconds}
                                    durationSeconds={form.durationSeconds}
                                    labels={{
                                        clipStart: t("ringtones.clipStart"),
                                        clipEnd: t("ringtones.clipEnd"),
                                        duration: t("ringtones.duration"),
                                        sourceDuration: t("ringtones.sourceDuration"),
                                    }}
                                    onChange={({ clipStartSeconds, durationSeconds }) => {
                                        updateForm({ clipStartSeconds, durationSeconds });
                                    }}
                                />
                                <button type="button" onClick={() => void previewCurrentClip()}>
                                    {t("ringtones.previewRingtone")}
                                </button>
                            </div>
                        ) : null}

                        {step === 3 ? (
                            <div className="ringtone-step ringtone-details-grid">
                                <h2>{t("ringtones.productDetails")}</h2>
                                <label className="ringtone-field">
                                    <span>{t("ringtones.titleField")}</span>
                                    <input
                                        value={form.title}
                                        maxLength={160}
                                        onChange={(event) => updateForm({ title: event.target.value })}
                                    />
                                </label>
                                <label className="ringtone-field">
                                    <span>{t("ringtones.description")}</span>
                                    <textarea
                                        value={form.description}
                                        maxLength={4000}
                                        rows={4}
                                        onChange={(event) => updateForm({ description: event.target.value })}
                                    />
                                </label>
                                <label className="ringtone-field">
                                    <span>{t("ringtones.artworkUrl")}</span>
                                    <input
                                        value={form.artworkUrl}
                                        onChange={(event) => updateForm({ artworkUrl: event.target.value })}
                                    />
                                </label>
                                <label className="ringtone-field">
                                    <span>{t("ringtones.price")}</span>
                                    <input
                                        value={form.priceDollars}
                                        inputMode="decimal"
                                        onChange={(event) => updateForm({ priceDollars: event.target.value })}
                                    />
                                </label>
                                <label className="ringtone-field">
                                    <span>{t("ringtones.currency")}</span>
                                    <select
                                        value={form.currency}
                                        onChange={(event) => updateForm({
                                            currency: event.target.value as CreateRingtoneFormState["currency"],
                                        })}
                                    >
                                        {["USD", "EUR", "GBP", "CAD", "AUD"].map((currency) => (
                                            <option key={currency} value={currency}>{currency}</option>
                                        ))}
                                    </select>
                                </label>
                                <div className="ringtone-checkbox-stack" role="group" aria-label={t("ringtones.details")}>
                                    <label className="ringtone-checkbox" htmlFor="ringtone-explicit">
                                        <input
                                            id="ringtone-explicit"
                                            type="checkbox"
                                            checked={form.isExplicit}
                                            onChange={(event) => updateForm({ isExplicit: event.target.checked })}
                                        />
                                        <span>{t("ringtones.explicitContent")}</span>
                                    </label>
                                    <label className="ringtone-checkbox" htmlFor="ringtone-iphone-ready">
                                        <input
                                            id="ringtone-iphone-ready"
                                            type="checkbox"
                                            checked={form.iphoneAvailable}
                                            onChange={(event) => updateForm({ iphoneAvailable: event.target.checked })}
                                        />
                                        <span>{t("ringtones.iphoneReady")}</span>
                                    </label>
                                    <label className="ringtone-checkbox" htmlFor="ringtone-android-ready">
                                        <input
                                            id="ringtone-android-ready"
                                            type="checkbox"
                                            checked={form.androidAvailable}
                                            onChange={(event) => updateForm({ androidAvailable: event.target.checked })}
                                        />
                                        <span>{t("ringtones.androidReady")}</span>
                                    </label>
                                    <label className="ringtone-checkbox" htmlFor="ringtone-ownership-details">
                                        <input
                                            id="ringtone-ownership-details"
                                            type="checkbox"
                                            checked={form.ownershipConfirmed || form.sourceKind === "owned_song"}
                                            disabled={form.sourceKind === "owned_song"}
                                            onChange={(event) => updateForm({ ownershipConfirmed: event.target.checked })}
                                            required={form.sourceKind !== "owned_song"}
                                            aria-required={form.sourceKind !== "owned_song"}
                                        />
                                        <span>{t("ringtones.ownershipConfirmation")}</span>
                                    </label>
                                </div>
                            </div>
                        ) : null}

                        {step === 4 ? (
                            <div className="ringtone-step ringtone-review">
                                <h2>{t("ringtones.review")}</h2>
                                <img
                                    src={form.artworkUrl || "/music-data-base-logo.png"}
                                    alt=""
                                    width={96}
                                    height={96}
                                />
                                <p><strong>{form.title || t("ringtones.create")}</strong></p>
                                <p>{form.description}</p>
                                <p>
                                    {t("ringtones.clipStart")}: {formatClipClock(form.clipStartSeconds)}
                                    {" · "}
                                    {t("ringtones.clipEnd")}: {formatClipClock(form.clipStartSeconds + form.durationSeconds)}
                                    {" · "}
                                    {t("ringtones.duration")}: {form.durationSeconds}s
                                </p>
                                <p>
                                    {t("ringtones.price")}: {formatRingtoneMoney(Math.round(Number(form.priceDollars || 0) * 100), form.currency)}
                                </p>
                                <p>
                                    {form.sourceKind === "owned_song"
                                        ? `${t("ringtones.existingSong")}: ${form.sourceSongTitle || form.sourceSongId}`
                                        : t("ringtones.uploadSource")}
                                </p>
                                <p>{t("ringtones.filePreparationNotice")}</p>
                                <p>{t("ringtones.iphoneInstallHint")}</p>
                                <p>{t("ringtones.androidInstallHint")}</p>
                                <button type="button" onClick={() => void previewCurrentClip()}>
                                    {t("ringtones.previewRingtone")}
                                </button>
                            </div>
                        ) : null}

                        {step === 5 ? (
                            <div className="ringtone-step">
                                <h2>{t("ringtones.saveOrSubmit")}</h2>
                                <p>{t("ringtones.noDirectPublishHint")}</p>
                                <div className="dashboard-form-actions ringtone-final-actions">
                                    <button
                                        type="button"
                                        className="save-upload"
                                        disabled={pending || submitLockRef.current}
                                        onClick={() => void persist(false)}
                                    >
                                        {t("ringtones.saveDraft")}
                                    </button>
                                    <button
                                        type="button"
                                        className="save-upload"
                                        disabled={pending || submitLockRef.current}
                                        onClick={() => void persist(true)}
                                    >
                                        {t("ringtones.submitForReview")}
                                    </button>
                                </div>
                            </div>
                        ) : null}

                        <div className="dashboard-form-actions ringtone-wizard-nav">
                            <button
                                type="button"
                                disabled={step === 1}
                                onClick={() => setStep((value) => Math.max(1, value - 1) as WizardStep)}
                            >
                                {t("ringtones.back")}
                            </button>
                            <button
                                type="button"
                                disabled={step === 5}
                                onClick={() => setStep((value) => Math.min(5, value + 1) as WizardStep)}
                            >
                                {t("ringtones.next")}
                            </button>
                            <button type="button" onClick={() => { setMode("list"); onStopRingtonePreview(); }}>
                                {t("ringtones.cancel")}
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}

            <style jsx>{`
                .ringtone-creator-page,
                .ringtone-wizard,
                .ringtone-wizard-card,
                .ringtone-step,
                .ringtone-list-shell,
                .ringtone-upload-source,
                .ringtone-source-list,
                .ringtone-details-grid,
                .ringtone-review,
                .ringtone-file-row {
                    width: 100%;
                    max-width: 100%;
                    min-width: 0;
                    box-sizing: border-box;
                }

                .ringtone-creator-page {
                    display: grid;
                    gap: 16px;
                    overflow-x: hidden;
                    padding-bottom: calc(var(--mobile-player-reserve, 110px) + 24px);
                }

                .ringtone-wizard {
                    display: grid;
                    gap: 12px;
                    overflow-x: hidden;
                    padding-bottom: calc(var(--mobile-player-reserve, 110px) + 12px);
                }

                .ringtone-wizard-card {
                    overflow-x: hidden;
                }

                .ringtone-creator-header,
                .ringtone-creator-actions,
                .ringtone-list-controls,
                .ringtone-card-actions,
                .ringtone-wizard-nav,
                .ringtone-final-actions {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 10px;
                    align-items: center;
                    width: 100%;
                    max-width: 100%;
                    min-width: 0;
                    box-sizing: border-box;
                }

                .ringtone-creator-header {
                    justify-content: space-between;
                }

                .ringtone-creator-header > div,
                .ringtone-creator-actions,
                .ringtone-card-body,
                .ringtone-source-list span {
                    min-width: 0;
                    max-width: 100%;
                }

                .ringtone-creator-actions button,
                .ringtone-list-controls button,
                .ringtone-card-actions button,
                .ringtone-wizard-nav button,
                .ringtone-final-actions button,
                .ringtone-step > button,
                .ringtone-upload-source > button,
                .ringtone-use-song-btn {
                    min-height: 44px;
                    min-width: 0;
                    max-width: 100%;
                    border-radius: 8px;
                    border: 1px solid rgba(0, 212, 255, 0.28);
                    background: #0b1736;
                    color: #e8f7ff;
                    padding: 0.55rem 0.75rem;
                    cursor: pointer;
                    box-sizing: border-box;
                    white-space: normal;
                    overflow-wrap: anywhere;
                    word-break: break-word;
                    transition: background-color 0.12s ease, color 0.12s ease, border-color 0.12s ease, transform 0.08s ease, filter 0.08s ease, opacity 0.12s ease;
                    -webkit-tap-highlight-color: rgba(34, 211, 238, 0.28);
                    touch-action: manipulation;
                }

                .ringtone-creator-actions button.active,
                .ringtone-wizard-steps button.active,
                .ringtone-source-tabs button.active,
                .ringtone-creator-actions button[aria-selected="true"],
                .ringtone-wizard-steps button[aria-selected="true"],
                .ringtone-source-tabs button[aria-pressed="true"] {
                    background: #22d3ee;
                    color: #062033;
                    font-weight: 800;
                    border-color: #67e8f9;
                    box-shadow: inset 0 0 0 1px rgba(6, 32, 51, 0.2);
                }

                .ringtone-creator-actions button:not(.active):active,
                .ringtone-wizard-steps button:not(.active):active,
                .ringtone-source-tabs button:not(.active):active,
                .ringtone-list-controls button:active,
                .ringtone-card-actions button:active,
                .ringtone-wizard-nav button:not(:disabled):active,
                .ringtone-final-actions button:not(:disabled):active,
                .ringtone-step > button:active,
                .ringtone-upload-source > button:active,
                .ringtone-use-song-btn:active {
                    background: #67e8f9;
                    color: #062033;
                    transform: scale(0.98);
                    filter: brightness(1.05);
                }

                .ringtone-creator-actions button:focus-visible,
                .ringtone-wizard-steps button:focus-visible,
                .ringtone-source-tabs button:focus-visible,
                .ringtone-list-controls button:focus-visible,
                .ringtone-card-actions button:focus-visible,
                .ringtone-wizard-nav button:focus-visible,
                .ringtone-final-actions button:focus-visible,
                .ringtone-step > button:focus-visible,
                .ringtone-upload-source > button:focus-visible,
                .ringtone-use-song-btn:focus-visible {
                    outline: 2px solid #67e8f9;
                    outline-offset: 2px;
                }

                .ringtone-wizard-nav button:disabled,
                .ringtone-final-actions button:disabled,
                .ringtone-list-controls button:disabled,
                .ringtone-card-actions button:disabled,
                .ringtone-use-song-btn:disabled {
                    opacity: 0.45;
                    cursor: not-allowed;
                    background: #152d66;
                    color: #7f9db8;
                    border-color: rgba(0, 212, 255, 0.14);
                    transform: none;
                    filter: none;
                }

                .ringtone-wizard .ringtone-wizard-steps,
                .ringtone-wizard .ringtone-source-tabs,
                .ringtone-wizard :global(.upload-mode-tabs.ringtone-wizard-steps),
                .ringtone-wizard :global(.upload-mode-tabs.ringtone-source-tabs) {
                    display: grid !important;
                    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)) !important;
                    flex-wrap: unset !important;
                    gap: 10px;
                    width: 100%;
                    max-width: 100%;
                    min-width: 0;
                    box-sizing: border-box;
                    overflow-x: hidden;
                    border: 1px solid rgba(0, 212, 255, 0.28);
                    border-radius: 8px;
                    background: #071631;
                    padding: 10px;
                }

                .ringtone-wizard .ringtone-wizard-steps button,
                .ringtone-wizard .ringtone-source-tabs button,
                .ringtone-wizard :global(.upload-mode-tabs.ringtone-wizard-steps) button,
                .ringtone-wizard :global(.upload-mode-tabs.ringtone-source-tabs) button {
                    width: 100% !important;
                    min-width: 0 !important;
                    max-width: 100% !important;
                    min-height: 44px;
                    justify-content: center;
                    text-align: center;
                    white-space: normal !important;
                    overflow-wrap: anywhere;
                    word-break: break-word;
                    line-height: 1.2;
                    padding: 0.5rem 0.55rem !important;
                    border: 0;
                    border-radius: 8px;
                    background: #152d66;
                    color: white;
                    font-size: 13px;
                    font-weight: 900;
                    cursor: pointer;
                    box-sizing: border-box;
                    transition: background-color 0.12s ease, color 0.12s ease, transform 0.08s ease, filter 0.08s ease;
                    -webkit-tap-highlight-color: rgba(34, 211, 238, 0.28);
                    touch-action: manipulation;
                }

                .ringtone-wizard .ringtone-wizard-steps button.active,
                .ringtone-wizard .ringtone-source-tabs button.active,
                .ringtone-wizard .ringtone-wizard-steps button[aria-selected="true"],
                .ringtone-wizard .ringtone-source-tabs button[aria-pressed="true"],
                .ringtone-wizard :global(.upload-mode-tabs.ringtone-wizard-steps) button.active,
                .ringtone-wizard :global(.upload-mode-tabs.ringtone-source-tabs) button.active {
                    background: #22d3ee !important;
                    color: #062033 !important;
                    font-weight: 900;
                }

                .ringtone-wizard .ringtone-wizard-steps button:not(.active):active,
                .ringtone-wizard .ringtone-source-tabs button:not(.active):active,
                .ringtone-wizard :global(.upload-mode-tabs.ringtone-wizard-steps) button:not(.active):active,
                .ringtone-wizard :global(.upload-mode-tabs.ringtone-source-tabs) button:not(.active):active {
                    background: #67e8f9 !important;
                    color: #062033 !important;
                    transform: scale(0.98);
                }

                .ringtone-list-controls,
                .ringtone-details-grid,
                .ringtone-source-list,
                .ringtone-card-grid,
                .ringtone-step {
                    display: grid;
                    gap: 12px;
                    width: 100%;
                    max-width: 100%;
                    min-width: 0;
                    box-sizing: border-box;
                }

                .ringtone-list-controls {
                    grid-template-columns: repeat(auto-fit, minmax(min(160px, 100%), 1fr));
                }

                .ringtone-card-grid {
                    grid-template-columns: repeat(auto-fit, minmax(min(280px, 100%), 1fr));
                }

                .ringtone-card {
                    display: grid;
                    grid-template-columns: 72px minmax(0, 1fr);
                    gap: 12px;
                    align-items: start;
                    width: 100%;
                    max-width: 100%;
                    min-width: 0;
                    box-sizing: border-box;
                    overflow-x: hidden;
                }

                .ringtone-card img,
                .ringtone-source-list img,
                .ringtone-review img {
                    border-radius: 8px;
                    object-fit: cover;
                    background: #08122b;
                    max-width: 100%;
                }

                .ringtone-source-card {
                    display: grid;
                    grid-template-columns: 48px minmax(0, 1fr);
                    gap: 10px;
                    text-align: left;
                    width: 100%;
                    max-width: 100%;
                    min-width: 0;
                    align-items: center;
                    padding: 10px;
                    border-radius: 8px;
                    border: 1px solid rgba(0, 212, 255, 0.28);
                    background: #0b1736;
                    box-sizing: border-box;
                }

                .ringtone-source-card.selected {
                    border-color: #22d3ee;
                    box-shadow: inset 0 0 0 1px rgba(34, 211, 238, 0.35);
                }

                .ringtone-source-card-body {
                    display: grid;
                    gap: 6px;
                    min-width: 0;
                }

                .ringtone-use-song-btn {
                    justify-self: start;
                    background: #152d66;
                    font-weight: 800;
                }

                .ringtone-source-list strong,
                .ringtone-source-list small,
                .ringtone-card-body h3,
                .ringtone-card-body p,
                .ringtone-review p,
                .ringtone-process-state {
                    overflow-wrap: anywhere;
                    word-break: break-word;
                }

                .ringtone-field {
                    display: grid;
                    gap: 6px;
                    min-width: 0;
                    max-width: 100%;
                }

                .ringtone-checkbox-stack {
                    display: grid;
                    gap: 12px;
                    margin-top: 4px;
                    padding-bottom: 8px;
                    min-width: 0;
                    max-width: 100%;
                }

                .ringtone-checkbox {
                    display: flex;
                    align-items: flex-start;
                    gap: 14px;
                    min-height: 48px;
                    width: 100%;
                    max-width: 100%;
                    min-width: 0;
                    margin: 0;
                    padding: 10px 12px;
                    border-radius: 10px;
                    border: 1px solid rgba(0, 212, 255, 0.28);
                    background: #08122b;
                    color: #e8f7ff;
                    cursor: pointer;
                    user-select: none;
                    box-sizing: border-box;
                    overflow-x: hidden;
                    transition: border-color 0.15s ease, background 0.15s ease, box-shadow 0.15s ease;
                }

                .ringtone-checkbox:hover {
                    border-color: rgba(34, 211, 238, 0.65);
                    background: #0b1736;
                }

                .ringtone-checkbox:focus-within {
                    outline: 2px solid #22d3ee;
                    outline-offset: 2px;
                    box-shadow: 0 0 0 3px rgba(34, 211, 238, 0.22);
                }

                .ringtone-checkbox span {
                    flex: 1 1 auto;
                    min-width: 0;
                    max-width: 100%;
                    line-height: 1.35;
                    font-weight: 700;
                    white-space: normal;
                    overflow-wrap: anywhere;
                    word-break: break-word;
                }

                .ringtone-checkbox input[type="checkbox"] {
                    appearance: none;
                    -webkit-appearance: none;
                    flex: 0 0 auto;
                    width: 24px;
                    height: 24px;
                    min-width: 24px;
                    min-height: 24px;
                    margin: 2px 0 0;
                    border-radius: 6px;
                    border: 2px solid rgba(34, 211, 238, 0.75);
                    background: #020617;
                    display: grid;
                    place-content: center;
                    cursor: pointer;
                }

                .ringtone-checkbox input[type="checkbox"]::before {
                    content: "";
                    width: 12px;
                    height: 12px;
                    transform: scale(0);
                    transition: transform 0.12s ease-in-out;
                    box-shadow: inset 1em 1em #22d3ee;
                    background-color: #22d3ee;
                    border-radius: 2px;
                    clip-path: polygon(14% 44%, 0 65%, 50% 100%, 100% 16%, 80% 0, 43% 62%);
                }

                .ringtone-checkbox input[type="checkbox"]:checked {
                    background: #083344;
                    border-color: #22d3ee;
                }

                .ringtone-checkbox input[type="checkbox"]:checked::before {
                    transform: scale(1);
                }

                .ringtone-checkbox input[type="checkbox"]:focus-visible {
                    outline: 2px solid #67e8f9;
                    outline-offset: 2px;
                }

                .ringtone-checkbox:has(input:disabled) {
                    opacity: 0.65;
                    cursor: not-allowed;
                }

                .ringtone-checkbox input[type="checkbox"]:disabled {
                    cursor: not-allowed;
                }

                .ringtone-field input,
                .ringtone-field textarea,
                .ringtone-field select,
                .ringtone-list-controls input,
                .ringtone-list-controls select {
                    width: 100%;
                    max-width: 100%;
                    min-width: 0;
                    min-height: 44px;
                    border-radius: 8px;
                    border: 1px solid rgba(0, 212, 255, 0.28);
                    background: #08122b;
                    color: #e8f7ff;
                    padding: 0.65rem 0.8rem;
                    box-sizing: border-box;
                }

                .ringtone-upload-source {
                    display: grid;
                    gap: 12px;
                }

                .ringtone-file-row {
                    display: grid;
                    gap: 8px;
                    overflow-x: hidden;
                }

                .ringtone-file-row input[type="file"] {
                    display: block;
                    width: 100%;
                    max-width: 100%;
                    min-width: 0;
                    box-sizing: border-box;
                    overflow: hidden;
                    color: #e8f7ff;
                }

                .ringtone-file-name {
                    display: block;
                    width: 100%;
                    max-width: 100%;
                    min-width: 0;
                    color: #9ec9e6;
                    font-size: 13px;
                    line-height: 1.35;
                    overflow-wrap: anywhere;
                    word-break: break-word;
                }

                .ringtone-wizard-nav,
                .ringtone-final-actions {
                    display: grid;
                    grid-template-columns: repeat(3, minmax(0, 1fr));
                    gap: 10px;
                    align-items: stretch;
                }

                .ringtone-wizard-nav button,
                .ringtone-final-actions button {
                    width: 100%;
                    justify-content: center;
                    text-align: center;
                }

                .ringtone-final-actions {
                    grid-template-columns: repeat(2, minmax(0, 1fr));
                }

                .ringtone-error,
                .ringtone-access-denied,
                .ringtone-rejection {
                    color: #fecaca;
                    overflow-wrap: anywhere;
                    word-break: break-word;
                }

                .ringtone-process-state {
                    color: #67e8f9;
                    font-weight: 700;
                }

                :global(.ringtone-clip-timeline) {
                    display: grid;
                    gap: 12px;
                    width: 100%;
                    max-width: 100%;
                    min-width: 0;
                    box-sizing: border-box;
                    overflow-x: hidden;
                }

                :global(.ringtone-clip-meta) {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 10px;
                    color: #a5f3fc;
                    min-width: 0;
                    max-width: 100%;
                    overflow-wrap: anywhere;
                }

                :global(.ringtone-timeline-track) {
                    position: relative;
                    width: 100%;
                    max-width: 100%;
                    min-width: 0;
                    height: 28px;
                    border-radius: 999px;
                    background: rgba(8, 18, 43, 0.95);
                    border: 1px solid rgba(0, 212, 255, 0.28);
                    overflow: hidden;
                    box-sizing: border-box;
                }

                :global(.ringtone-timeline-window) {
                    position: absolute;
                    top: 0;
                    bottom: 0;
                    background: rgba(34, 211, 238, 0.45);
                }

                .sr-only {
                    position: absolute;
                    width: 1px;
                    height: 1px;
                    padding: 0;
                    margin: -1px;
                    overflow: hidden;
                    clip: rect(0, 0, 0, 0);
                    border: 0;
                }

                @media (max-width: 820px) {
                    .ringtone-creator-header {
                        align-items: stretch;
                    }

                    .ringtone-creator-actions {
                        display: grid;
                        grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
                        width: 100%;
                    }

                    .ringtone-card {
                        grid-template-columns: 1fr;
                    }

                    .ringtone-card-actions {
                        display: grid;
                        grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
                    }

                    .ringtone-wizard .ringtone-source-tabs,
                    .ringtone-wizard :global(.upload-mode-tabs.ringtone-source-tabs) {
                        grid-template-columns: 1fr !important;
                    }

                    .ringtone-wizard .ringtone-source-tabs button,
                    .ringtone-wizard :global(.upload-mode-tabs.ringtone-source-tabs) button {
                        width: 100% !important;
                    }
                }

                @media (max-width: 430px) {
                    .ringtone-wizard .ringtone-wizard-steps,
                    .ringtone-wizard :global(.upload-mode-tabs.ringtone-wizard-steps) {
                        grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)) !important;
                    }

                    .ringtone-wizard-nav,
                    .ringtone-final-actions {
                        grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
                    }
                }

                @media (max-width: 360px) {
                    .ringtone-wizard .ringtone-wizard-steps,
                    .ringtone-wizard .ringtone-source-tabs,
                    .ringtone-wizard :global(.upload-mode-tabs.ringtone-wizard-steps),
                    .ringtone-wizard :global(.upload-mode-tabs.ringtone-source-tabs),
                    .ringtone-wizard-nav,
                    .ringtone-final-actions,
                    .ringtone-creator-actions,
                    .ringtone-card-actions {
                        grid-template-columns: 1fr !important;
                    }
                }
            `}</style>
        </section>
    );
}

// Keep status union referenced for compile-time parity with filters.
void RINGTONE_STATUSES;
