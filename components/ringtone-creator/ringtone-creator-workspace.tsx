"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { Session } from "@supabase/supabase-js";
import {
    RINGTONE_ALLOWED_AUDIO_MIME_TYPES,
    RINGTONE_SOURCE_MAX_BYTES,
    RINGTONE_STATUSES,
    type RingtoneStatus,
} from "@/lib/ringtone-constants";
import {
    clampRingtoneDuration,
    createEmptyRingtoneForm,
    deleteOrArchiveRingtone,
    duplicateRingtone,
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
    const submitLockRef = useRef(false);
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    const statusLabel = (status: string) => {
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
        return map[status] || status;
    };

    async function reloadAll() {
        setLoading(true);
        setError("");
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
        if (songs.ok) setSourceSongs(songs.songs);
        if (sales.ok) setSalesSummary(sales.summary);
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
        if (song.durationSeconds > 0 && song.durationSeconds < 15) {
            setError(t("ringtones.sourceTooShort"));
            return;
        }
        const duration = clampRingtoneDuration(song.durationSeconds || 30);
        updateForm({
            sourceKind: "owned_song",
            sourceSongId: song.id,
            sourceSongTitle: song.title,
            sourceAudioUrl: song.audioUrl,
            sourceStoragePath: "",
            sourceDurationSeconds: song.durationSeconds,
            ownershipConfirmed: true,
            artworkUrl: form.artworkUrl || song.artworkUrl,
            title: form.title || `${song.title} Ringtone`,
            durationSeconds: duration,
            clipStartSeconds: Math.min(form.clipStartSeconds, maxClipStartSeconds(song.durationSeconds, duration)),
        });
        setProcessState("ready");
        setError("");
        setStep(2);
    }

    async function handleSourceUpload(file: File | null) {
        if (!file) return;
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

                if (submitForReview && ringtone.status !== "pending_review") {
                    const submitted = await submitRingtoneForReview({
                        userId,
                        session,
                        ringtoneId: ringtone.id,
                    });
                    if (!submitted.ok) {
                        throw new Error(String(submitted.body.error || t("ringtones.submitFailed")));
                    }
                }

                setProcessState("ready");
                setStatusMessage(submitForReview ? t("ringtones.pendingReview") : t("ringtones.draftSaved"));
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
                <div className="ringtone-creator-actions">
                    <button type="button" className={mode === "list" ? "active" : ""} onClick={() => setMode("list")}>
                        {t("ringtones.myRingtones")}
                    </button>
                    <button type="button" className={mode === "create" ? "active" : ""} onClick={beginCreate}>
                        {t("ringtones.create")}
                    </button>
                    <button type="button" className={mode === "sales" ? "active" : ""} onClick={() => setMode("sales")}>
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
                                            {ringtone.duration_seconds}s · {formatRingtoneMoney(ringtone.price_cents, ringtone.currency)} · {statusLabel(ringtone.status)}
                                        </p>
                                        <p className="ringtone-card-dates">
                                            {t("ringtones.created")}: {new Date(ringtone.created_at).toLocaleDateString()}
                                            {" · "}
                                            {t("ringtones.updated")}: {new Date(ringtone.updated_at).toLocaleDateString()}
                                        </p>
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
                                            {canEdit ? (
                                                <button type="button" onClick={() => beginEdit(ringtone)}>
                                                    {t("ringtones.edit")}
                                                </button>
                                            ) : (
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        startTransition(async () => {
                                                            const result = await saveRingtoneDraft({
                                                                userId,
                                                                session,
                                                                ringtoneId: ringtone.id,
                                                                payload: { status: "pending_review" },
                                                            });
                                                            if (!result.ok) {
                                                                setError(String(result.body.error || t("ringtones.submitFailed")));
                                                                return;
                                                            }
                                                            await reloadAll();
                                                        });
                                                    }}
                                                >
                                                    {t("ringtones.requestRevision")}
                                                </button>
                                            )}
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
                                                            setError(String(result.body.error || t("ringtones.duplicateFailed")));
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
                                                        startTransition(async () => {
                                                            const result = await submitRingtoneForReview({
                                                                userId,
                                                                session,
                                                                ringtoneId: ringtone.id,
                                                            });
                                                            if (!result.ok) {
                                                                setError(String(result.body.error || t("ringtones.submitFailed")));
                                                                return;
                                                            }
                                                            await reloadAll();
                                                        });
                                                    }}
                                                >
                                                    {t("ringtones.submitForReview")}
                                                </button>
                                            ) : null}
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
                                                            setError(String(result.body.error || t("ringtones.deleteFailed")));
                                                            return;
                                                        }
                                                        await reloadAll();
                                                    });
                                                }}
                                            >
                                                {["published", "approved", "suspended"].includes(ringtone.status)
                                                    ? t("ringtones.archived")
                                                    : t("ringtones.delete")}
                                            </button>
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
                    <div className="upload-mode-tabs" role="tablist" aria-label={t("ringtones.create")}>
                        {[1, 2, 3, 4, 5].map((value) => (
                            <button
                                key={value}
                                type="button"
                                role="tab"
                                aria-selected={step === value}
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
                                <div className="upload-mode-tabs">
                                    <button
                                        type="button"
                                        className={form.sourceKind === "owned_song" ? "active" : ""}
                                        onClick={() => updateForm({ sourceKind: "owned_song" })}
                                    >
                                        {t("ringtones.createFromSong")}
                                    </button>
                                    <button
                                        type="button"
                                        className={form.sourceKind === "upload" ? "active" : ""}
                                        onClick={() => updateForm({ sourceKind: "upload" })}
                                    >
                                        {t("ringtones.uploadSource")}
                                    </button>
                                </div>

                                {form.sourceKind === "owned_song" ? (
                                    <div className="ringtone-source-list" role="listbox" aria-label={t("ringtones.existingSong")}>
                                        {sourceSongs.length === 0 ? <p>{t("ringtones.noOwnedSongs")}</p> : null}
                                        {sourceSongs.map((song) => (
                                            <button
                                                key={song.id}
                                                type="button"
                                                role="option"
                                                aria-selected={form.sourceSongId === song.id}
                                                className={form.sourceSongId === song.id ? "selected" : ""}
                                                onClick={() => void selectOwnedSong(song)}
                                            >
                                                <img src={song.artworkUrl || "/music-data-base-logo.png"} alt="" width={48} height={48} />
                                                <span>
                                                    <strong>{song.title}</strong>
                                                    <small>{formatClipClock(song.durationSeconds)}</small>
                                                </span>
                                            </button>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="ringtone-upload-source">
                                        <label className="ringtone-checkbox">
                                            <input
                                                type="checkbox"
                                                checked={form.ownershipConfirmed}
                                                onChange={(event) => updateForm({ ownershipConfirmed: event.target.checked })}
                                            />
                                            <span>{t("ringtones.ownershipConfirmation")}</span>
                                        </label>
                                        <input
                                            ref={fileInputRef}
                                            type="file"
                                            accept={RINGTONE_ALLOWED_AUDIO_MIME_TYPES.join(",")}
                                            disabled={!form.ownershipConfirmed || processState === "uploading"}
                                            onChange={(event) => void handleSourceUpload(event.target.files?.[0] || null)}
                                        />
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
                                <label className="ringtone-checkbox">
                                    <input
                                        type="checkbox"
                                        checked={form.isExplicit}
                                        onChange={(event) => updateForm({ isExplicit: event.target.checked })}
                                    />
                                    <span>{t("ringtones.explicitContent")}</span>
                                </label>
                                <label className="ringtone-checkbox">
                                    <input
                                        type="checkbox"
                                        checked={form.iphoneAvailable}
                                        onChange={(event) => updateForm({ iphoneAvailable: event.target.checked })}
                                    />
                                    <span>{t("ringtones.iphoneReady")}</span>
                                </label>
                                <label className="ringtone-checkbox">
                                    <input
                                        type="checkbox"
                                        checked={form.androidAvailable}
                                        onChange={(event) => updateForm({ androidAvailable: event.target.checked })}
                                    />
                                    <span>{t("ringtones.androidReady")}</span>
                                </label>
                                <label className="ringtone-checkbox">
                                    <input
                                        type="checkbox"
                                        checked={form.ownershipConfirmed || form.sourceKind === "owned_song"}
                                        disabled={form.sourceKind === "owned_song"}
                                        onChange={(event) => updateForm({ ownershipConfirmed: event.target.checked })}
                                    />
                                    <span>{t("ringtones.ownershipConfirmation")}</span>
                                </label>
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
                .ringtone-creator-page {
                    display: grid;
                    gap: 16px;
                    padding-bottom: calc(var(--mobile-player-reserve, 110px) + 24px);
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
                }
                .ringtone-creator-header {
                    justify-content: space-between;
                }
                .ringtone-creator-actions button,
                .ringtone-list-controls button,
                .ringtone-card-actions button,
                .ringtone-wizard-nav button,
                .ringtone-source-list button {
                    min-height: 44px;
                    min-width: 44px;
                    border-radius: 8px;
                    border: 1px solid rgba(0, 212, 255, 0.28);
                    background: #0b1736;
                    color: #e8f7ff;
                    padding: 0.55rem 0.9rem;
                    cursor: pointer;
                }
                .ringtone-creator-actions button.active,
                .upload-mode-tabs button.active,
                .ringtone-source-list button.selected {
                    background: #22d3ee;
                    color: #062033;
                    font-weight: 800;
                }
                .ringtone-list-controls,
                .ringtone-details-grid,
                .ringtone-source-list,
                .ringtone-card-grid {
                    display: grid;
                    gap: 12px;
                }
                .ringtone-list-controls {
                    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
                }
                .ringtone-card-grid {
                    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
                }
                .ringtone-card {
                    display: grid;
                    grid-template-columns: 72px 1fr;
                    gap: 12px;
                    align-items: start;
                }
                .ringtone-card img,
                .ringtone-source-list img,
                .ringtone-review img {
                    border-radius: 8px;
                    object-fit: cover;
                    background: #08122b;
                }
                .ringtone-source-list button {
                    display: grid;
                    grid-template-columns: 48px 1fr;
                    gap: 10px;
                    text-align: left;
                    width: 100%;
                }
                .ringtone-field,
                .ringtone-checkbox {
                    display: grid;
                    gap: 6px;
                }
                .ringtone-field input,
                .ringtone-field textarea,
                .ringtone-field select,
                .ringtone-list-controls input,
                .ringtone-list-controls select {
                    width: 100%;
                    min-height: 44px;
                    border-radius: 8px;
                    border: 1px solid rgba(0, 212, 255, 0.28);
                    background: #08122b;
                    color: #e8f7ff;
                    padding: 0.65rem 0.8rem;
                }
                .ringtone-error,
                .ringtone-access-denied,
                .ringtone-rejection {
                    color: #fecaca;
                }
                .ringtone-process-state {
                    color: #67e8f9;
                    font-weight: 700;
                }
                :global(.ringtone-clip-timeline) {
                    display: grid;
                    gap: 12px;
                }
                :global(.ringtone-clip-meta) {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 10px;
                    color: #a5f3fc;
                }
                :global(.ringtone-timeline-track) {
                    position: relative;
                    height: 28px;
                    border-radius: 999px;
                    background: rgba(8, 18, 43, 0.95);
                    border: 1px solid rgba(0, 212, 255, 0.28);
                    overflow: hidden;
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
                    .ringtone-card {
                        grid-template-columns: 1fr;
                    }
                }
            `}</style>
        </section>
    );
}

// Keep status union referenced for compile-time parity with filters.
void RINGTONE_STATUSES;
