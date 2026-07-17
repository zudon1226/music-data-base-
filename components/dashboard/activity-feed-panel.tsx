"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "@/lib/i18n/provider";

export type ActivityFeedItem = {
    id: string;
    kind: string;
    title: string;
    body: string;
    href: string;
    createdAt: string;
};

type FetchFn = (path: string, init?: RequestInit & { requireAuth?: boolean }) => Promise<Response>;

type ActivityFeedPanelProps = {
    userId: string;
    fetchFn: FetchFn;
    onNavigate?: (href: string) => void;
};

function formatWhen(value: string, locale: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    try {
        return new Intl.DateTimeFormat(locale || "en", { dateStyle: "medium", timeStyle: "short" }).format(date);
    }
    catch {
        return date.toLocaleString();
    }
}

export function ActivityFeedPanel({ userId, fetchFn, onNavigate }: ActivityFeedPanelProps) {
    const { t, locale } = useTranslation();
    const [items, setItems] = useState<ActivityFeedItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const load = useCallback(async () => {
        if (!userId) return;
        setLoading(true);
        setError("");
        try {
            const response = await fetchFn(`/api/activity-feed?userId=${encodeURIComponent(userId)}&scope=network`, {
                cache: "no-store",
                requireAuth: true,
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(String(data.error || t("dashboard.activity.loadFailed")));
            setItems(Array.isArray(data.items) ? data.items : []);
        }
        catch (loadError) {
            setError(loadError instanceof Error ? loadError.message : t("dashboard.activity.loadFailed"));
        }
        finally {
            setLoading(false);
        }
    }, [fetchFn, t, userId]);

    useEffect(() => {
        void load();
    }, [load]);

    return (
        <section className="dashboard-activity-feed" aria-label={t("dashboard.activity.title")}>
            <div className="artist-section-title">
                <h3>{t("dashboard.activity.title")}</h3>
                <button disabled={loading} onClick={() => void load()} type="button">
                    {t("common.refresh")}
                </button>
            </div>
            {loading ? <p>{t("common.loading")}</p> : null}
            {error ? <p className="profile-feedback profile-feedback-error" role="alert">{error}</p> : null}
            {!loading && !error && items.length === 0 ? (
                <div className="empty-state">
                    <p>{t("dashboard.activity.empty")}</p>
                </div>
            ) : null}
            <ul className="dashboard-activity-list">
                {items.map((item) => (
                    <li key={item.id}>
                        <button
                            className="dashboard-activity-item"
                            onClick={() => onNavigate?.(item.href || "Home")}
                            type="button"
                        >
                            <strong>{item.title}</strong>
                            {item.body ? <span>{item.body}</span> : null}
                            <small>{formatWhen(item.createdAt, locale)}</small>
                        </button>
                    </li>
                ))}
            </ul>
        </section>
    );
}
