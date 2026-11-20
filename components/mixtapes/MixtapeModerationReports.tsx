"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { authFetch } from "@/lib/client-api-auth";
import { supabase } from "@/lib/supabase";
import {
    MIXTAPE_REPORT_STATUS_LABELS,
    mixtapeReportQueueBucket,
} from "@/lib/mixtape-report-status.mjs";

type MixtapeModerationReport = {
    id: string;
    mixtape_id: string;
    reason_code: string;
    details: string;
    status: string;
    created_at: string;
    updated_at: string;
    reviewed_at?: string | null;
    mixtapeTitle?: string;
    mixtapeStatus?: string;
    creatorName?: string;
    reporterName?: string;
};

type MixtapeModerationReportsProps = {
    adminUserId: string;
    onToast?: (message: string, tone?: "success" | "error" | "info") => void;
};

type QueueTab = "pending" | "reviewed" | "resolved" | "dismissed";

const TABS: { id: QueueTab; label: string }[] = [
    { id: "pending", label: "Pending" },
    { id: "reviewed", label: "Under review" },
    { id: "resolved", label: "Resolved" },
    { id: "dismissed", label: "Dismissed" },
];

function formatWhen(iso: string) {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleString();
}

export function MixtapeModerationReports({ adminUserId, onToast }: MixtapeModerationReportsProps) {
    const [reports, setReports] = useState<MixtapeModerationReport[]>([]);
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(true);
    const [pendingId, setPendingId] = useState("");
    const [tab, setTab] = useState<QueueTab>("pending");
    const [confirm, setConfirm] = useState<{ reportId: string; status: string; label: string } | null>(null);

    const loadReports = useCallback(async (signal?: AbortSignal) => {
        if (!adminUserId) return;
        setLoading(true);
        try {
            const response = await authFetch(
                supabase,
                `/api/mixtapes/reports/moderation?userId=${encodeURIComponent(adminUserId)}&limit=120`,
                { cache: "no-store", signal, requireSession: true },
            );
            const body = (await response.json().catch(() => ({}))) as {
                reports?: MixtapeModerationReport[];
                error?: string;
            };
            if (!response.ok) {
                if (response.status === 401 || response.status === 403) {
                    setReports([]);
                    setError("");
                    return;
                }
                throw new Error(body.error || "Mixtape reports could not be loaded.");
            }
            setReports(Array.isArray(body.reports) ? body.reports : []);
            setError("");
        }
        catch (caught) {
            if (signal?.aborted) return;
            setReports([]);
            setError(caught instanceof Error ? caught.message : "Mixtape reports could not be loaded.");
        }
        finally {
            if (!signal?.aborted) setLoading(false);
        }
    }, [adminUserId]);

    useEffect(() => {
        const controller = new AbortController();
        const timer = window.setTimeout(() => void loadReports(controller.signal), 0);
        return () => {
            window.clearTimeout(timer);
            controller.abort();
        };
    }, [loadReports]);

    const filtered = useMemo(
        () => reports.filter((report) => mixtapeReportQueueBucket(report.status) === tab),
        [reports, tab],
    );

    async function applyStatus(reportId: string, status: string) {
        setPendingId(reportId);
        try {
            const response = await authFetch(
                supabase,
                `/api/mixtapes/reports/moderation/${encodeURIComponent(reportId)}`,
                {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ userId: adminUserId, id: reportId, status }),
                    cache: "no-store",
                    requireSession: true,
                },
            );
            const body = (await response.json().catch(() => ({}))) as { error?: string; report?: MixtapeModerationReport };
            if (!response.ok) throw new Error(body.error || "Report could not be updated.");
            if (body.report) {
                setReports((current) => current.map((item) => (item.id === reportId ? { ...item, ...body.report } : item)));
            }
            else {
                await loadReports();
            }
            onToast?.(`Mixtape report marked ${MIXTAPE_REPORT_STATUS_LABELS[status as keyof typeof MIXTAPE_REPORT_STATUS_LABELS] || status}.`, "success");
            setConfirm(null);
        }
        catch (caught) {
            const message = caught instanceof Error ? caught.message : "Report could not be updated.";
            setError(message);
            onToast?.(message, "error");
        }
        finally {
            setPendingId("");
        }
    }

    function requestStatus(report: MixtapeModerationReport, status: string, label: string) {
        if (status === "resolved" || status === "dismissed") {
            setConfirm({ reportId: report.id, status, label });
            return;
        }
        void applyStatus(report.id, status);
    }

    if (!adminUserId) return null;

    return (
        <div className="mixtape-moderation-reports" data-mixtape-moderation-queue>
            <div className="panel-title-row">
                <h4>Mixtape Reports</h4>
                <button type="button" disabled={loading} onClick={() => void loadReports()}>
                    Refresh
                </button>
            </div>
            <small>
                Community mixtape reports from staging catalog. Actions update report status only; mixtapes are not auto-deleted.
            </small>
            <div className="monetization-action-row" role="tablist" aria-label="Mixtape report queues">
                {TABS.map((entry) => (
                    <button
                        key={entry.id}
                        type="button"
                        role="tab"
                        aria-selected={tab === entry.id}
                        onClick={() => setTab(entry.id)}
                    >
                        {entry.label}
                        {" "}
                        ({reports.filter((r) => mixtapeReportQueueBucket(r.status) === entry.id).length})
                    </button>
                ))}
            </div>
            {loading ? (
                <p>Loading mixtape reports...</p>
            ) : null}
            {error ? <p role="alert">{error}</p> : null}
            {!loading && filtered.length === 0 ? (
                <div className="dashboard-empty-card">
                    <h3>No {TABS.find((t) => t.id === tab)?.label.toLowerCase()} mixtape reports</h3>
                    <p>New mixtape reports from listeners appear under Pending after submission.</p>
                </div>
            ) : (
                <div className="monetization-list">
                    {filtered.map((report) => (
                        <article key={report.id}>
                            <span>
                                {report.reason_code}
                                {" / "}
                                {MIXTAPE_REPORT_STATUS_LABELS[report.status as keyof typeof MIXTAPE_REPORT_STATUS_LABELS]
                                    || report.status}
                            </span>
                            <strong>{report.mixtapeTitle || "Untitled mixtape"}</strong>
                            <small>
                                Creator: {report.creatorName || "Unknown"}
                                {" | "}
                                Reported by {report.reporterName || "listener"}
                                {" | "}
                                {formatWhen(report.created_at)}
                            </small>
                            {report.details ? <small>{report.details}</small> : null}
                            <div className="monetization-row-actions">
                                {report.status !== "reviewing" ? (
                                    <button
                                        type="button"
                                        disabled={Boolean(pendingId)}
                                        onClick={() => requestStatus(report, "reviewing", "Mark under review")}
                                    >
                                        Under review
                                    </button>
                                ) : null}
                                {report.status === "reviewing" || report.status === "open" ? (
                                    <>
                                        <button
                                            type="button"
                                            disabled={Boolean(pendingId)}
                                            onClick={() => requestStatus(report, "resolved", "Resolve report")}
                                        >
                                            Resolve
                                        </button>
                                        <button
                                            type="button"
                                            disabled={Boolean(pendingId)}
                                            onClick={() => requestStatus(report, "dismissed", "Dismiss report")}
                                        >
                                            Dismiss
                                        </button>
                                    </>
                                ) : null}
                                {(report.status === "resolved" || report.status === "dismissed") ? (
                                    <button
                                        type="button"
                                        disabled={Boolean(pendingId)}
                                        onClick={() => requestStatus(report, "open", "Reopen")}
                                    >
                                        Reopen (flag for review)
                                    </button>
                                ) : null}
                            </div>
                        </article>
                    ))}
                </div>
            )}
            {confirm ? (
                <div className="dashboard-empty-card" role="dialog" aria-labelledby="mixtape-report-confirm-title">
                    <h3 id="mixtape-report-confirm-title">Confirm moderation action</h3>
                    <p>
                        {confirm.label} for report {confirm.reportId.slice(0, 8)}? This does not remove the mixtape from public discovery.
                    </p>
                    <div className="monetization-row-actions">
                        <button
                            type="button"
                            disabled={pendingId === confirm.reportId}
                            onClick={() => void applyStatus(confirm.reportId, confirm.status)}
                        >
                            Confirm
                        </button>
                        <button type="button" onClick={() => setConfirm(null)}>Cancel</button>
                    </div>
                </div>
            ) : null}
        </div>
    );
}