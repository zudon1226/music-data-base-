"use client";

import { useCallback, useEffect, useState } from "react";
import { authFetch } from "@/lib/client-api-auth";
import { supabase } from "@/lib/supabase";

type PersistedReport = {
    id: string;
    item_type: string;
    item_id: string;
    item_title: string;
    reason: string;
    status: string;
    reporter_name?: string;
    target_user_name?: string;
    created_at: string;
};

type PersistedModerationReportsProps = {
    userId: string;
};

export function PersistedModerationReports({ userId }: PersistedModerationReportsProps) {
    const [reports, setReports] = useState<PersistedReport[]>([]);
    const [error, setError] = useState("");
    const [pendingId, setPendingId] = useState("");
    const [visible, setVisible] = useState(false);

    const loadReports = useCallback(async (signal?: AbortSignal) => {
        if (!userId) return;
        try {
            const response = await authFetch(
                supabase,
                `/api/moderation/reports?userId=${encodeURIComponent(userId)}`,
                { cache: "no-store", signal, requireSession: true },
            );
            const body = (await response.json().catch(() => ({}))) as { reports?: PersistedReport[]; error?: string };
            if (!response.ok) {
                if (response.status === 401 || response.status === 403) {
                    setVisible(false);
                    setReports([]);
                    return;
                }
                throw new Error(body.error || "Moderation reports could not be loaded.");
            }
            setVisible(true);
            setReports(Array.isArray(body.reports) ? body.reports : []);
            setError("");
        }
        catch (caught) {
            if (signal?.aborted) return;
            setVisible(true);
            setReports([]);
            setError(caught instanceof Error ? caught.message : "Moderation reports could not be loaded.");
        }
    }, [userId]);

    useEffect(() => {
        const controller = new AbortController();
        const timer = window.setTimeout(() => void loadReports(controller.signal), 0);
        return () => {
            window.clearTimeout(timer);
            controller.abort();
        };
    }, [loadReports]);

    async function updateStatus(report: PersistedReport, status: string) {
        setPendingId(report.id);
        try {
            const response = await authFetch(supabase, "/api/moderation/reports", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userId, id: report.id, status }),
                cache: "no-store",
                requireSession: true,
            });
            const body = (await response.json().catch(() => ({}))) as { error?: string };
            if (!response.ok) throw new Error(body.error || "Report could not be updated.");
            setReports((current) => current.map((item) => (
                item.id === report.id ? { ...item, status } : item
            )));
        }
        catch (caught) {
            setError(caught instanceof Error ? caught.message : "Report could not be updated.");
        }
        finally {
            setPendingId("");
        }
    }

    if (!userId || !visible) return null;

    return (
        <div className="persisted-moderation-reports">
            <small>Persisted reports include Podcast comment reports.</small>
            {error ? <p>{error}</p> : null}
            {reports.length === 0 ? (
                <p>No persisted moderation reports.</p>
            ) : (
                <div className="monetization-list">
                    {reports.slice(0, 12).map((report) => (
                        <article key={report.id}>
                            <span>{report.item_type} / {report.status.replace("_", " ")}</span>
                            <strong>{report.item_title}</strong>
                            <small>{report.reason} | reported by {report.reporter_name || "user"}</small>
                            {report.target_user_name ? <small>Target: {report.target_user_name}</small> : null}
                            <div className="monetization-row-actions">
                                <button
                                    type="button"
                                    disabled={pendingId === report.id}
                                    onClick={() => void updateStatus(report, "reviewing")}
                                >
                                    Review
                                </button>
                                <button
                                    type="button"
                                    disabled={pendingId === report.id}
                                    onClick={() => void updateStatus(report, "removed")}
                                >
                                    Remove
                                </button>
                                <button
                                    type="button"
                                    disabled={pendingId === report.id}
                                    onClick={() => void updateStatus(report, "dismissed")}
                                >
                                    Dismiss
                                </button>
                            </div>
                        </article>
                    ))}
                </div>
            )}
        </div>
    );
}
