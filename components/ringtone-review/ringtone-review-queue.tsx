"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { Session } from "@supabase/supabase-js";
import {
    fetchRingtoneReviewQueue,
    performRingtoneReviewAction,
    type RingtoneReviewItem,
} from "@/lib/ringtone-admin-client";
import { formatRingtoneMoney } from "@/lib/ringtone-creator-client";
import { useTranslation } from "@/lib/i18n/provider";

export type RingtoneReviewPreviewRequest = {
    id: string;
    title: string;
    artworkUrl: string;
    audioUrl: string;
    clipStartSeconds: number;
    clipEndSeconds: number;
    durationSeconds: number;
};

type RingtoneReviewQueueProps = {
    userId: string;
    session: Session | null;
    onPreviewRingtone: (request: RingtoneReviewPreviewRequest) => void;
    onStopRingtonePreview: () => void;
    activeRingtonePreviewId: string | null;
    ringtonePreviewPlaying: boolean;
};

type FilterKey =
    | "pending_review"
    | "processing_failed"
    | "approved"
    | "rejected"
    | "published"
    | "suspended"
    | "archived"
    | "all";

type SortKey = "oldest" | "newest" | "creator" | "title" | "status";

const FILTERS: FilterKey[] = [
    "pending_review",
    "processing_failed",
    "approved",
    "rejected",
    "published",
    "suspended",
    "archived",
    "all",
];

export function RingtoneReviewQueue({
    userId,
    session,
    onPreviewRingtone,
    onStopRingtonePreview,
    activeRingtonePreviewId,
    ringtonePreviewPlaying,
}: RingtoneReviewQueueProps) {
    const { t } = useTranslation();
    const [items, setItems] = useState<RingtoneReviewItem[]>([]);
    const [logs, setLogs] = useState<Array<Record<string, unknown>>>([]);
    const [filter, setFilter] = useState<FilterKey>("pending_review");
    const [sort, setSort] = useState<SortKey>("oldest");
    const [error, setError] = useState("");
    const [statusMessage, setStatusMessage] = useState("");
    const [loading, setLoading] = useState(true);
    const [rejectTarget, setRejectTarget] = useState<RingtoneReviewItem | null>(null);
    const [rejectReason, setRejectReason] = useState("");
    const [confirmAction, setConfirmAction] = useState<{ item: RingtoneReviewItem; action: string } | null>(null);
    const [pending, startTransition] = useTransition();
    const actionLockRef = useRef(false);

    const load = useCallback(async () => {
        setLoading(true);
        setError("");
        const result = await fetchRingtoneReviewQueue({
            userId,
            session,
            status: filter === "all" ? "" : filter,
            sort,
        });
        if (!result.ok) {
            setError(result.error || t("ringtones.reviewQueueLoadFailed"));
            setItems([]);
            setLoading(false);
            return;
        }
        setItems(result.ringtones);
        setLogs(result.moderationLogs as Array<Record<string, unknown>>);
        setLoading(false);
    }, [filter, session, sort, t, userId]);

    useEffect(() => {
        void load();
    }, [load]);

    const filterLabel = (key: FilterKey) => {
        const map: Record<FilterKey, string> = {
            pending_review: t("ringtones.pendingReview"),
            processing_failed: t("ringtones.processingFailed"),
            approved: t("ringtones.approved"),
            rejected: t("ringtones.rejected"),
            published: t("ringtones.published"),
            suspended: t("ringtones.suspended"),
            archived: t("ringtones.archived"),
            all: t("ringtones.filterAll"),
        };
        return map[key];
    };

    const runAction = (item: RingtoneReviewItem, action: string, reason = "") => {
        if (actionLockRef.current || pending) return;
        actionLockRef.current = true;
        startTransition(async () => {
            try {
                const result = await performRingtoneReviewAction({
                    userId,
                    session,
                    ringtoneId: item.id,
                    action,
                    reason,
                });
                if (!result.ok) {
                    setError(String(result.body.error || t("ringtones.reviewActionFailed")));
                    return;
                }
                setStatusMessage(t("ringtones.reviewActionSucceeded"));
                setRejectTarget(null);
                setRejectReason("");
                setConfirmAction(null);
                await load();
            } finally {
                actionLockRef.current = false;
            }
        });
    };

    const visibleLogs = useMemo(
        () => logs.filter((log) => items.some((item) => item.id === log.ringtone_id)).slice(0, 20),
        [items, logs],
    );

    return (
        <section className="ringtone-review-queue" data-ringtone-review="queue">
            <header className="ringtone-review-header">
                <div>
                    <h3>{t("ringtones.ringtoneReviewQueue")}</h3>
                    <p>{t("ringtones.ringtoneReviewQueueSubtitle")}</p>
                </div>
                <button type="button" onClick={() => void load()} disabled={loading || pending}>
                    {loading ? t("ringtones.loading") : t("common.refresh")}
                </button>
            </header>

            <div className="sr-only" aria-live="polite">{statusMessage}</div>
            {error ? <p className="ringtone-error" role="alert">{error}</p> : null}

            <div className="ringtone-review-toolbar" role="toolbar" aria-label={t("ringtones.ringtoneReviewQueue")}>
                <label>
                    <span>{t("ringtones.filter")}</span>
                    <select
                        value={filter}
                        onChange={(event) => setFilter(event.target.value as FilterKey)}
                    >
                        {FILTERS.map((key) => (
                            <option key={key} value={key}>{filterLabel(key)}</option>
                        ))}
                    </select>
                </label>
                <label>
                    <span>{t("ringtones.sort")}</span>
                    <select value={sort} onChange={(event) => setSort(event.target.value as SortKey)}>
                        <option value="oldest">{t("ringtones.sortOldest")}</option>
                        <option value="newest">{t("ringtones.sortNewest")}</option>
                        <option value="creator">{t("ringtones.creator")}</option>
                        <option value="title">{t("ringtones.sortTitle")}</option>
                        <option value="status">{t("ringtones.sortStatus")}</option>
                    </select>
                </label>
            </div>

            {loading ? <p>{t("ringtones.loading")}</p> : null}
            {!loading && items.length === 0 ? (
                <p className="ringtone-review-empty">{t("ringtones.reviewQueueEmpty")}</p>
            ) : null}

            <div className="ringtone-review-list">
                {items.map((item) => {
                    const sourceLabel = item.source_kind === "owned_song"
                        ? t("ringtones.existingSong")
                        : t("ringtones.uploadSource");
                    return (
                        <article key={item.id} className="ringtone-review-card dashboard-panel">
                            <img
                                src={item.artwork_url || "/music-data-base-logo.png"}
                                alt=""
                                width={88}
                                height={88}
                            />
                            <div className="ringtone-review-body">
                                <h4>{item.title}</h4>
                                <p>
                                    {t("ringtones.creator")}: {item.creatorLabel || item.creator_id}
                                    {" · "}
                                    {sourceLabel}
                                    {" · "}
                                    {t("ringtones.revision")} {item.revision_number || 1}
                                </p>
                                <p>
                                    {t("ringtones.clipStart")}: {item.clip_start_seconds}s · {t("ringtones.clipEnd")}: {item.clip_end_seconds}s · {t("ringtones.duration")}: {item.duration_seconds}s
                                </p>
                                <p>
                                    {t("ringtones.price")}: {formatRingtoneMoney(item.price_cents, item.currency)}
                                    {" · "}
                                    {item.is_explicit ? t("ringtones.explicitBadge") : t("ringtones.cleanBadge")}
                                    {" · "}
                                    {item.ownership_confirmed ? t("ringtones.ownershipConfirmation") : t("ringtones.ownershipRequired")}
                                </p>
                                <p>
                                    {t("ringtones.status")}: {item.status}
                                    {" · "}
                                    {item.previewReady ? t("ringtones.previewReady") : t("ringtones.previewUnavailable")}
                                    {" · "}
                                    {item.iphoneReady ? t("ringtones.iphoneFileReady") : t("ringtones.iphoneReady")}
                                    {" · "}
                                    {item.androidReady ? t("ringtones.androidFileReady") : t("ringtones.androidReady")}
                                </p>
                                <p className="ringtone-card-dates">
                                    {t("ringtones.submittedForReview")}: {new Date(item.updated_at).toLocaleString()}
                                </p>
                                {item.review_notes ? (
                                    <p className="ringtone-rejection" role="status">
                                        {t("ringtones.rejectionReason")}: {item.review_notes}
                                    </p>
                                ) : null}
                                {item.last_processing_error ? (
                                    <p className="ringtone-rejection" role="status">
                                        {t("ringtones.processingDetails")}: {item.last_processing_error}
                                    </p>
                                ) : null}

                                <div className="ringtone-review-actions">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (!item.preview_url) {
                                                setError(t("ringtones.previewUnavailable"));
                                                return;
                                            }
                                            onPreviewRingtone({
                                                id: item.id,
                                                title: item.title,
                                                artworkUrl: item.artwork_url,
                                                audioUrl: item.preview_url,
                                                clipStartSeconds: Number(item.clip_start_seconds) || 0,
                                                clipEndSeconds: Number(item.clip_end_seconds) || Number(item.duration_seconds) || 30,
                                                durationSeconds: Number(item.duration_seconds) || 30,
                                            });
                                        }}
                                    >
                                        {activeRingtonePreviewId === item.id && ringtonePreviewPlaying
                                            ? t("ringtones.pausePreview")
                                            : t("ringtones.preview")}
                                    </button>
                                    {item.status === "pending_review" ? (
                                        <>
                                            <button type="button" onClick={() => runAction(item, "approve")}>
                                                {t("ringtones.approveRingtone")}
                                            </button>
                                            <button type="button" onClick={() => setRejectTarget(item)}>
                                                {t("ringtones.rejectRingtone")}
                                            </button>
                                        </>
                                    ) : null}
                                    {item.status === "approved" ? (
                                        <button type="button" onClick={() => runAction(item, "publish")}>
                                            {t("ringtones.publishRingtone")}
                                        </button>
                                    ) : null}
                                    {item.status === "published" ? (
                                        <button
                                            type="button"
                                            onClick={() => setConfirmAction({ item, action: "suspend" })}
                                        >
                                            {t("ringtones.suspendRingtone")}
                                        </button>
                                    ) : null}
                                    {item.status === "suspended" ? (
                                        <button type="button" onClick={() => runAction(item, "restore")}>
                                            {t("ringtones.restoreRingtone")}
                                        </button>
                                    ) : null}
                                    {["approved", "rejected", "published", "suspended", "pending_review"].includes(item.status) ? (
                                        <button
                                            type="button"
                                            onClick={() => setConfirmAction({ item, action: "archive" })}
                                        >
                                            {t("ringtones.archiveRingtone")}
                                        </button>
                                    ) : null}
                                    <button type="button" onClick={() => runAction(item, "reprocess")}>
                                        {t("ringtones.requestReprocessing")}
                                    </button>
                                    {activeRingtonePreviewId === item.id ? (
                                        <button type="button" onClick={onStopRingtonePreview}>
                                            {t("ringtones.pausePreview")}
                                        </button>
                                    ) : null}
                                </div>
                            </div>
                        </article>
                    );
                })}
            </div>

            <section className="ringtone-moderation-history" aria-labelledby="ringtone-moderation-history-title">
                <h4 id="ringtone-moderation-history-title">{t("ringtones.moderationHistory")}</h4>
                {visibleLogs.length === 0 ? <p>{t("ringtones.reviewQueueEmpty")}</p> : (
                    <ul>
                        {visibleLogs.map((log) => (
                            <li key={String(log.id)}>
                                <strong>{String(log.action)}</strong>
                                {" · "}
                                {String(log.previous_status)} → {String(log.new_status)}
                                {log.reason ? ` · ${String(log.reason)}` : ""}
                                {" · "}
                                {log.created_at ? new Date(String(log.created_at)).toLocaleString() : ""}
                            </li>
                        ))}
                    </ul>
                )}
            </section>

            {rejectTarget ? (
                <div className="ringtone-modal" role="dialog" aria-modal="true" aria-labelledby="reject-dialog-title">
                    <div className="ringtone-modal-card">
                        <h4 id="reject-dialog-title">{t("ringtones.rejectRingtone")}</h4>
                        <p>{rejectTarget.title}</p>
                        <label>
                            <span>{t("ringtones.rejectionReason")}</span>
                            <textarea
                                value={rejectReason}
                                onChange={(event) => setRejectReason(event.target.value)}
                                rows={4}
                                required
                            />
                        </label>
                        <div className="ringtone-review-actions">
                            <button
                                type="button"
                                onClick={() => {
                                    if (!rejectReason.trim()) {
                                        setError(t("ringtones.rejectionReasonRequired"));
                                        return;
                                    }
                                    runAction(rejectTarget, "reject", rejectReason.trim());
                                }}
                            >
                                {t("ringtones.rejectRingtone")}
                            </button>
                            <button type="button" onClick={() => { setRejectTarget(null); setRejectReason(""); }}>
                                {t("ringtones.cancel")}
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}

            {confirmAction ? (
                <div className="ringtone-modal" role="dialog" aria-modal="true" aria-labelledby="confirm-dialog-title">
                    <div className="ringtone-modal-card">
                        <h4 id="confirm-dialog-title">
                            {confirmAction.action === "suspend"
                                ? t("ringtones.suspendRingtone")
                                : t("ringtones.archiveRingtone")}
                        </h4>
                        <p>{confirmAction.item.title}</p>
                        <div className="ringtone-review-actions">
                            <button
                                type="button"
                                onClick={() => runAction(confirmAction.item, confirmAction.action)}
                            >
                                {t("dialogs.confirm")}
                            </button>
                            <button type="button" onClick={() => setConfirmAction(null)}>
                                {t("ringtones.cancel")}
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}

            <style jsx>{`
                .ringtone-review-queue {
                    display: grid;
                    gap: 1rem;
                    padding-bottom: calc(var(--mobile-player-reserve, 88px) + 1.5rem);
                }
                .ringtone-review-header {
                    display: flex;
                    justify-content: space-between;
                    gap: 1rem;
                    align-items: flex-start;
                    flex-wrap: wrap;
                }
                .ringtone-review-toolbar {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 0.75rem 1rem;
                }
                .ringtone-review-toolbar label {
                    display: grid;
                    gap: 0.25rem;
                    min-width: 160px;
                }
                .ringtone-review-list {
                    display: grid;
                    gap: 0.85rem;
                }
                .ringtone-review-card {
                    display: grid;
                    grid-template-columns: 88px minmax(0, 1fr);
                    gap: 0.85rem;
                    align-items: start;
                }
                .ringtone-review-card img {
                    width: 88px;
                    height: 88px;
                    object-fit: cover;
                    border-radius: 8px;
                }
                .ringtone-review-body {
                    min-width: 0;
                }
                .ringtone-review-body h4 {
                    margin: 0 0 0.35rem;
                    overflow-wrap: anywhere;
                }
                .ringtone-review-actions {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 0.5rem;
                    margin-top: 0.65rem;
                }
                .ringtone-review-actions button {
                    min-height: 44px;
                }
                .ringtone-modal {
                    position: fixed;
                    inset: 0;
                    background: rgba(0, 0, 0, 0.45);
                    display: grid;
                    place-items: center;
                    padding: 1rem;
                    z-index: 80;
                }
                .ringtone-modal-card {
                    width: min(520px, 100%);
                    max-height: min(80vh, 640px);
                    overflow: auto;
                    background: var(--panel-bg, #121212);
                    color: inherit;
                    border-radius: 12px;
                    padding: 1rem;
                    display: grid;
                    gap: 0.75rem;
                }
                .ringtone-modal-card textarea {
                    width: 100%;
                    min-height: 96px;
                }
                .ringtone-moderation-history ul {
                    margin: 0;
                    padding-left: 1.1rem;
                }
                @media (max-width: 820px) {
                    .ringtone-review-card {
                        grid-template-columns: 64px minmax(0, 1fr);
                    }
                    .ringtone-review-card img {
                        width: 64px;
                        height: 64px;
                    }
                }
                @media (max-width: 480px) {
                    .ringtone-review-header {
                        flex-direction: column;
                    }
                    .ringtone-review-toolbar {
                        width: 100%;
                    }
                    .ringtone-review-toolbar label {
                        width: 100%;
                    }
                }
            `}</style>
        </section>
    );
}
