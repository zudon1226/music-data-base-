"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "@/lib/i18n/provider";

type HiddenRow = {
    id: string;
    content_type: string;
    content_id: string;
    created_at?: string;
};

type FetchFn = (path: string, init?: RequestInit & { requireAuth?: boolean }) => Promise<Response>;

type Props = {
    userId: string;
    fetchFn: FetchFn;
};

export function HiddenContentPanel({ userId, fetchFn }: Props) {
    const { t } = useTranslation();
    const [hidden, setHidden] = useState<HiddenRow[]>([]);
    const [error, setError] = useState("");
    const [pendingId, setPendingId] = useState("");

    const load = useCallback(async () => {
        if (!userId) return;
        setError("");
        try {
            const response = await fetchFn(`/api/user-hidden-content?userId=${encodeURIComponent(userId)}`, {
                requireAuth: true,
                cache: "no-store",
            });
            const body = (await response.json().catch(() => ({}))) as { hidden?: HiddenRow[]; error?: string };
            if (!response.ok) throw new Error(body.error || "Hidden content could not be loaded.");
            setHidden(Array.isArray(body.hidden) ? body.hidden : []);
        }
        catch (caught) {
            setHidden([]);
            setError(caught instanceof Error ? caught.message : "Hidden content could not be loaded.");
        }
    }, [fetchFn, userId]);

    useEffect(() => {
        void load();
    }, [load]);

    async function unhide(row: HiddenRow) {
        setPendingId(row.id);
        setError("");
        try {
            const response = await fetchFn("/api/user-hidden-content", {
                method: "DELETE",
                requireAuth: true,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userId, id: row.id }),
            });
            const body = (await response.json().catch(() => ({}))) as { error?: string };
            if (!response.ok) throw new Error(body.error || "Could not unhide content.");
            setHidden((current) => current.filter((item) => item.id !== row.id));
        }
        catch (caught) {
            setError(caught instanceof Error ? caught.message : "Could not unhide content.");
        }
        finally {
            setPendingId("");
        }
    }

    return (
        <div className="profile-save account-hidden-content-panel">
            <h3>{t("trust.hiddenContentTitle")}</h3>
            <p>{t("trust.hiddenContentDescription")}</p>
            {error ? <p className="profile-feedback profile-feedback-error" role="alert">{error}</p> : null}
            {hidden.length === 0 ? (
                <p className="profile-muted">{t("trust.hiddenContentEmpty")}</p>
            ) : (
                <ul className="account-hidden-content-list">
                    {hidden.map((row) => (
                        <li key={row.id}>
                            <div>
                                <strong>{row.content_type}</strong>
                                <span>{row.content_id}</span>
                            </div>
                            <button
                                disabled={pendingId === row.id}
                                onClick={() => void unhide(row)}
                                type="button"
                            >
                                {t("trust.unhideContent")}
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
