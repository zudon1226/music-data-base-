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
    | "all"
    | "processing"
    | "processing_failed"
    | "pending_review"
    | "approved"
    | "rejected"
    | "published"
    | "suspended"
    | "archived";

type SortKey = "oldest" | "newest" | "creator" | "title" | "status";

type ConfirmableAction = "archive" | "suspend" | "reprocess";

const FILTERS: FilterKey[] = [
    "all",
    "processing",
    "processing_failed",
    "pending_review",
    "approved",
    "rejected",
    "published",
    "suspended",
    "archived",
];

function actionSuccessMessage(
    action: string,
    t: ReturnType<typeof useTranslation>["t"],
) {
    if (action === "approve") {
        return `${t("ringtones.approveRingtone")} — ${t("ringtones.approved")}`;
    }
    if (action === "reject") {
        return `${t("ringtones.rejectRingtone")} — ${t("ringtones.rejected")}`;
    }
    if (action === "archive") {
        return `${t("ringtones.archiveRingtone")} — ${t("ringtones.archived")}`;
    }
    if (action === "reprocess") {
        return `${t("ringtones.requestReprocessing")} — ${t("ringtones.processingStarted")}`;
    }
    if (action === "publish") {
        return `${t("ringtones.publishRingtone")} — ${t("ringtones.published")}`;
    }
    return t("ringtones.reviewActionSucceeded");
}

function shouldKeepAfterStatusChange(filter: FilterKey, nextStatus: string) {
    if (filter === "all") return true;
    if (filter === "processing_failed") {
        return nextStatus === "draft" || nextStatus === "processing" || nextStatus === "rejected";
    }
    return filter === nextStatus;
}

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
    const [confirmAction, setConfirmAction] = useState<{ item: RingtoneReviewItem; action: ConfirmableAction } | null>(null);
    const [busyKey, setBusyKey] = useState("");
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
            all: t("ringtones.filterAll"),
            processing: t("ringtones.processing"),
            processing_failed: t("ringtones.processingFailed"),
            pending_review: t("ringtones.pendingReview"),
            approved: t("ringtones.approved"),
            rejected: t("ringtones.rejected"),
            published: t("ringtones.published"),
            suspended: t("ringtones.suspended"),
            archived: t("ringtones.archived"),
        };
        const label = String(map[key] || "").trim();
        return label || key;
    };

    const sortLabel = (key: SortKey) => {
        const map: Record<SortKey, string> = {
            oldest: t("ringtones.sortOldestSubmission"),
            newest: t("ringtones.sortNewestSubmission"),
            creator: t("ringtones.creator"),
            title: t("ringtones.sortTitle"),
            status: t("ringtones.sortStatus"),
        };
        const label = String(map[key] || "").trim();
        return label || key;
    };

    const applyLocalActionResult = (itemId: string, nextStatus: string) => {
        setItems((previous) => {
            if (!shouldKeepAfterStatusChange(filter, nextStatus)) {
                return previous.filter((row) => row.id !== itemId);
            }
            return previous.map((row) => (
                row.id === itemId
                    ? { ...row, status: nextStatus }
                    : row
            ));
        });
    };

    const runAction = (item: RingtoneReviewItem, action: string, reason = "") => {
        if (actionLockRef.current || pending) return;
        actionLockRef.current = true;
        const lockKey = `${item.id}:${action}`;
        setBusyKey(lockKey);
        setError("");
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

                const ringtone = result.body.ringtone as { status?: string } | undefined;
                const nextStatus = String(ringtone?.status || (
                    action === "approve" ? "approved"
                        : action === "reject" ? "rejected"
                            : action === "archive" ? "archived"
                                : action === "publish" ? "published"
                                    : action === "suspend" ? "suspended"
                                        : action === "restore" ? "published"
                                            : item.status
                ));

                setStatusMessage(actionSuccessMessage(action, t));
                setRejectTarget(null);
                setRejectReason("");
                setConfirmAction(null);
                applyLocalActionResult(item.id, nextStatus);
                await load();
            } finally {
                actionLockRef.current = false;
                setBusyKey("");
            }
        });
    };

    const visibleLogs = useMemo(
        () => logs.filter((log) => items.some((item) => item.id === log.ringtone_id)).slice(0, 20),
        [items, logs],
    );

    const actionsDisabled = loading || pending || Boolean(busyKey);

    return (
        <section className="ringtone-review-queue" data-ringtone-review="queue">
            <header className="ringtone-review-header">
                <div>
                    <h3>{t("ringtones.ringtoneReviewQueue")}</h3>
                    <p>{t("ringtones.ringtoneReviewQueueSubtitle")}</p>
                </div>
                <button
                    type="button"
                    className="rrq-btn rrq-btn-secondary"
                    onClick={() => void load()}
                    disabled={actionsDisabled}
                    aria-label={t("common.refresh")}
                >
                    {loading ? t("ringtones.loading") : t("common.refresh")}
                </button>
            </header>

            <div className="sr-only" aria-live="polite">{statusMessage}</div>
            {statusMessage ? (
                <p className="ringtone-review-success" role="status" data-ringtone-review="success">
                    {statusMessage}
                </p>
            ) : null}
            {error ? <p className="ringtone-error" role="alert">{error}</p> : null}

            <div className="ringtone-review-toolbar" role="toolbar" aria-label={t("ringtones.ringtoneReviewQueue")}>
                <label className="ringtone-review-select-field" htmlFor="ringtone-review-filter">
                    <span id="ringtone-review-filter-label">{t("ringtones.filter")}</span>
                    <select
                        id="ringtone-review-filter"
                        className="ringtone-review-select"
                        value={filter}
                        aria-labelledby="ringtone-review-filter-label"
                        onChange={(event) => setFilter(event.target.value as FilterKey)}
                    >
                        {FILTERS.map((key) => {
                            const label = filterLabel(key);
                            return (
                                <option key={key} value={key} label={label}>
                                    {label}
                                </option>
                            );
                        })}
                    </select>
                </label>
                <label className="ringtone-review-select-field" htmlFor="ringtone-review-sort">
                    <span id="ringtone-review-sort-label">{t("ringtones.sort")}</span>
                    <select
                        id="ringtone-review-sort"
                        className="ringtone-review-select"
                        value={sort}
                        aria-labelledby="ringtone-review-sort-label"
                        onChange={(event) => setSort(event.target.value as SortKey)}
                    >
                        {([
                            "oldest",
                            "newest",
                            "creator",
                            "title",
                            "status",
                        ] as SortKey[]).map((key) => {
                            const label = sortLabel(key);
                            return (
                                <option key={key} value={key} label={label}>
                                    {label}
                                </option>
                            );
                        })}
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
                    const previewActive = activeRingtonePreviewId === item.id && ringtonePreviewPlaying;
                    const itemBusy = busyKey.startsWith(`${item.id}:`);
                    return (
                        <article key={item.id} className="ringtone-review-card dashboard-panel" data-ringtone-status={item.status}>
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
                                    {t("ringtones.status")}: <strong data-ringtone-status-label>{item.status}</strong>
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

                                <div className="ringtone-review-actions" role="group" aria-label={t("ringtones.ringtoneReviewQueue")}>
                                    <button
                                        type="button"
                                        className="rrq-btn rrq-btn-secondary rrq-btn-media"
                                        disabled={actionsDisabled || !item.preview_url}
                                        aria-label={previewActive ? t("ringtones.pausePreview") : t("ringtones.preview")}
                                        aria-pressed={previewActive}
                                        onClick={() => {
                                            if (!item.preview_url) {
                                                setError(t("ringtones.previewUnavailable"));
                                                return;
                                            }
                                            if (previewActive) {
                                                onStopRingtonePreview();
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
                                        {previewActive ? t("ringtones.pausePreview") : t("ringtones.preview")}
                                    </button>

                                    {item.status === "pending_review" ? (
                                        <>
                                            <button
                                                type="button"
                                                className="rrq-btn rrq-btn-approve"
                                                disabled={actionsDisabled}
                                                aria-busy={busyKey === `${item.id}:approve`}
                                                aria-label={t("ringtones.approveRingtone")}
                                                onClick={() => runAction(item, "approve")}
                                            >
                                                {busyKey === `${item.id}:approve`
                                                    ? t("ringtones.loading")
                                                    : t("ringtones.approveRingtone")}
                                            </button>
                                            <button
                                                type="button"
                                                className="rrq-btn rrq-btn-reject"
                                                disabled={actionsDisabled}
                                                aria-label={t("ringtones.rejectRingtone")}
                                                onClick={() => {
                                                    setError("");
                                                    setRejectReason("");
                                                    setRejectTarget(item);
                                                }}
                                            >
                                                {t("ringtones.rejectRingtone")}
                                            </button>
                                        </>
                                    ) : null}

                                    {item.status === "approved" ? (
                                        <button
                                            type="button"
                                            className="rrq-btn rrq-btn-approve"
                                            disabled={actionsDisabled}
                                            aria-busy={busyKey === `${item.id}:publish`}
                                            aria-label={t("ringtones.publishRingtone")}
                                            onClick={() => runAction(item, "publish")}
                                        >
                                            {busyKey === `${item.id}:publish`
                                                ? t("ringtones.loading")
                                                : t("ringtones.publishRingtone")}
                                        </button>
                                    ) : null}

                                    {item.status === "published" ? (
                                        <button
                                            type="button"
                                            className="rrq-btn rrq-btn-reject"
                                            disabled={actionsDisabled}
                                            aria-label={t("ringtones.suspendRingtone")}
                                            onClick={() => setConfirmAction({ item, action: "suspend" })}
                                        >
                                            {t("ringtones.suspendRingtone")}
                                        </button>
                                    ) : null}

                                    {item.status === "suspended" ? (
                                        <button
                                            type="button"
                                            className="rrq-btn rrq-btn-approve"
                                            disabled={actionsDisabled}
                                            aria-busy={busyKey === `${item.id}:restore`}
                                            aria-label={t("ringtones.restoreRingtone")}
                                            onClick={() => runAction(item, "restore")}
                                        >
                                            {busyKey === `${item.id}:restore`
                                                ? t("ringtones.loading")
                                                : t("ringtones.restoreRingtone")}
                                        </button>
                                    ) : null}

                                    {["approved", "rejected", "published", "suspended", "pending_review"].includes(item.status) ? (
                                        <button
                                            type="button"
                                            className="rrq-btn rrq-btn-archive"
                                            disabled={actionsDisabled}
                                            aria-label={t("ringtones.archiveRingtone")}
                                            onClick={() => setConfirmAction({ item, action: "archive" })}
                                        >
                                            {t("ringtones.archiveRingtone")}
                                        </button>
                                    ) : null}

                                    <button
                                        type="button"
                                        className="rrq-btn rrq-btn-reprocess"
                                        disabled={actionsDisabled}
                                        aria-label={t("ringtones.requestReprocessing")}
                                        onClick={() => setConfirmAction({ item, action: "reprocess" })}
                                    >
                                        {t("ringtones.requestReprocessing")}
                                    </button>

                                    {activeRingtonePreviewId === item.id ? (
                                        <button
                                            type="button"
                                            className="rrq-btn rrq-btn-secondary rrq-btn-media"
                                            disabled={itemBusy}
                                            aria-label={t("ringtones.pausePreview")}
                                            onClick={onStopRingtonePreview}
                                        >
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
                                aria-required="true"
                            />
                        </label>
                        <div className="ringtone-review-actions">
                            <button
                                type="button"
                                className="rrq-btn rrq-btn-reject"
                                disabled={actionsDisabled || !rejectReason.trim()}
                                aria-busy={busyKey === `${rejectTarget.id}:reject`}
                                aria-label={t("ringtones.rejectRingtone")}
                                onClick={() => {
                                    if (!rejectReason.trim()) {
                                        setError(t("ringtones.rejectionReasonRequired"));
                                        return;
                                    }
                                    runAction(rejectTarget, "reject", rejectReason.trim());
                                }}
                            >
                                {busyKey === `${rejectTarget.id}:reject`
                                    ? t("ringtones.loading")
                                    : t("ringtones.rejectRingtone")}
                            </button>
                            <button
                                type="button"
                                className="rrq-btn rrq-btn-secondary"
                                disabled={actionsDisabled}
                                onClick={() => { setRejectTarget(null); setRejectReason(""); }}
                            >
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
                                : confirmAction.action === "reprocess"
                                    ? t("ringtones.requestReprocessing")
                                    : t("ringtones.archiveRingtone")}
                        </h4>
                        <p>{confirmAction.item.title}</p>
                        <div className="ringtone-review-actions">
                            <button
                                type="button"
                                className={
                                    confirmAction.action === "reprocess"
                                        ? "rrq-btn rrq-btn-reprocess"
                                        : confirmAction.action === "suspend"
                                            ? "rrq-btn rrq-btn-reject"
                                            : "rrq-btn rrq-btn-archive"
                                }
                                disabled={actionsDisabled}
                                aria-busy={busyKey === `${confirmAction.item.id}:${confirmAction.action}`}
                                aria-label={t("dialogs.confirm")}
                                onClick={() => runAction(confirmAction.item, confirmAction.action)}
                            >
                                {busyKey === `${confirmAction.item.id}:${confirmAction.action}`
                                    ? t("ringtones.loading")
                                    : t("dialogs.confirm")}
                            </button>
                            <button
                                type="button"
                                className="rrq-btn rrq-btn-secondary"
                                disabled={actionsDisabled}
                                onClick={() => setConfirmAction(null)}
                            >
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
                .ringtone-review-select-field {
                    display: grid;
                    gap: 0.35rem;
                    min-width: 200px;
                    flex: 1 1 220px;
                }
                .ringtone-review-select-field > span {
                    color: #e8f7ff;
                    font-weight: 700;
                }
                /* Explicit colors: native option menus must not inherit white-on-white. */
                .ringtone-review-select {
                    appearance: auto;
                    color-scheme: light;
                    width: 100%;
                    min-height: 44px;
                    border-radius: 8px;
                    border: 1px solid rgba(0, 212, 255, 0.45);
                    background-color: #08122b;
                    color: #e8f7ff;
                    font: inherit;
                    font-weight: 700;
                    padding: 0.55rem 0.8rem;
                }
                .ringtone-review-select:hover {
                    border-color: rgba(34, 211, 238, 0.75);
                }
                .ringtone-review-select:focus,
                .ringtone-review-select:focus-visible {
                    outline: 2px solid #22d3ee;
                    outline-offset: 2px;
                }
                .ringtone-review-select:disabled {
                    opacity: 0.55;
                    cursor: not-allowed;
                }
                .ringtone-review-select option {
                    background-color: #ffffff;
                    color: #111827;
                    font-weight: 600;
                }
                .ringtone-review-select option:checked,
                .ringtone-review-select option:hover,
                .ringtone-review-select option:focus {
                    background-color: #dbeafe;
                    color: #0f172a;
                }
                .ringtone-review-success {
                    margin: 0;
                    padding: 0.7rem 0.9rem;
                    border-radius: 8px;
                    border: 1px solid rgba(34, 197, 94, 0.45);
                    background: rgba(6, 78, 59, 0.45);
                    color: #bbf7d0;
                    font-weight: 700;
                }
                .ringtone-error {
                    color: #fecaca;
                    font-weight: 700;
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
                    gap: 0.65rem;
                    margin-top: 0.75rem;
                }
                .rrq-btn {
                    appearance: none;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    gap: 0.35rem;
                    min-height: 44px;
                    min-width: 44px;
                    padding: 0.6rem 0.95rem;
                    border-radius: 8px;
                    border: 1px solid rgba(0, 212, 255, 0.35);
                    background: #0b1736;
                    color: #e8f7ff;
                    font: inherit;
                    font-weight: 800;
                    font-size: 0.92rem;
                    line-height: 1.2;
                    text-align: center;
                    white-space: normal;
                    cursor: pointer;
                    transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease, opacity 0.15s ease, box-shadow 0.15s ease;
                }
                .rrq-btn:hover:not(:disabled) {
                    border-color: rgba(34, 211, 238, 0.75);
                    background: #102247;
                }
                .rrq-btn:focus-visible {
                    outline: 2px solid #22d3ee;
                    outline-offset: 2px;
                    box-shadow: 0 0 0 3px rgba(34, 211, 238, 0.25);
                }
                .rrq-btn:disabled,
                .rrq-btn[aria-busy="true"] {
                    opacity: 0.55;
                    cursor: not-allowed;
                }
                .rrq-btn-secondary,
                .rrq-btn-media {
                    background: #0b1736;
                    border-color: rgba(0, 212, 255, 0.35);
                    color: #e8f7ff;
                }
                .rrq-btn-approve {
                    background: #065f46;
                    border-color: rgba(52, 211, 153, 0.65);
                    color: #ecfdf5;
                }
                .rrq-btn-approve:hover:not(:disabled) {
                    background: #047857;
                    border-color: #6ee7b7;
                }
                .rrq-btn-reject {
                    background: #7f1d1d;
                    border-color: rgba(248, 113, 113, 0.7);
                    color: #fef2f2;
                }
                .rrq-btn-reject:hover:not(:disabled) {
                    background: #991b1b;
                    border-color: #fca5a5;
                }
                .rrq-btn-archive {
                    background: #1f2937;
                    border-color: rgba(156, 163, 175, 0.55);
                    color: #f3f4f6;
                }
                .rrq-btn-archive:hover:not(:disabled) {
                    background: #374151;
                    border-color: #d1d5db;
                }
                .rrq-btn-reprocess {
                    background: #0c4a6e;
                    border-color: rgba(56, 189, 248, 0.65);
                    color: #e0f2fe;
                }
                .rrq-btn-reprocess:hover:not(:disabled) {
                    background: #075985;
                    border-color: #7dd3fc;
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
                    .ringtone-review-card {
                        grid-template-columns: 64px minmax(0, 1fr);
                    }
                    .ringtone-review-card img {
                        width: 64px;
                        height: 64px;
                    }
                    .rrq-btn {
                        flex: 1 1 calc(50% - 0.65rem);
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
                    .rrq-btn {
                        flex: 1 1 100%;
                    }
                }
            `}</style>
        </section>
    );
}
