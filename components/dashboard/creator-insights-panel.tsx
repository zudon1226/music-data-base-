"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "@/lib/i18n/provider";

type FetchFn = (path: string, init?: RequestInit & { requireAuth?: boolean }) => Promise<Response>;

type CreatorInsightsPanelProps = {
    userId: string;
    fetchFn: FetchFn;
};

type InsightsPayload = {
    widgets?: {
        totalPlays?: number;
        followersGained7d?: number;
        followersGained30d?: number;
        followerCount?: number;
        revenueCents?: number;
        uploadStats?: { songs?: number; videos?: number; beats?: number; albums?: number };
        trendingReleases?: Array<{ id: string; title: string; mediaType: string; metric: number }>;
    };
    insights?: {
        topSongs?: Array<{ id: string; title: string; plays: number }>;
        topVideos?: Array<{ id: string; title: string; views: number }>;
        topBeats?: Array<{ id: string; title: string; plays: number }>;
        daily?: Array<{ date: string; views: number; plays: number }>;
        weeklyPlays?: number;
        monthlyPlays?: number;
    };
};

function money(cents: number) {
    return `$${(Math.max(0, cents) / 100).toFixed(2)}`;
}

export function CreatorInsightsPanel({ userId, fetchFn }: CreatorInsightsPanelProps) {
    const { t } = useTranslation();
    const [data, setData] = useState<InsightsPayload | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const load = useCallback(async () => {
        if (!userId) return;
        setLoading(true);
        setError("");
        try {
            const response = await fetchFn(`/api/creator-insights?userId=${encodeURIComponent(userId)}`, {
                cache: "no-store",
                requireAuth: true,
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(String(payload.error || t("dashboard.insights.loadFailed")));
            setData(payload);
        }
        catch (loadError) {
            setError(loadError instanceof Error ? loadError.message : t("dashboard.insights.loadFailed"));
        }
        finally {
            setLoading(false);
        }
    }, [fetchFn, t, userId]);

    useEffect(() => {
        void load();
    }, [load]);

    const widgets = data?.widgets;
    const insights = data?.insights;

    return (
        <section className="creator-insights-panel" aria-label={t("dashboard.insights.title")}>
            <div className="artist-section-title">
                <h3>{t("dashboard.widgets.title")}</h3>
                <button disabled={loading} onClick={() => void load()} type="button">
                    {t("common.refresh")}
                </button>
            </div>
            {loading ? <p>{t("common.loading")}</p> : null}
            {error ? <p className="profile-feedback profile-feedback-error" role="alert">{error}</p> : null}
            {widgets ? (
                <div className="dashboard-grid creator-widgets-grid">
                    <div>
                        <strong>{Number(widgets.totalPlays || 0).toLocaleString()}</strong>
                        <span>{t("dashboard.widgets.totalPlays")}</span>
                    </div>
                    <div>
                        <strong>+{Number(widgets.followersGained7d || 0).toLocaleString()}</strong>
                        <span>{t("dashboard.widgets.followersGained")}</span>
                    </div>
                    <div>
                        <strong>{money(Number(widgets.revenueCents || 0))}</strong>
                        <span>{t("dashboard.widgets.revenueSummary")}</span>
                    </div>
                    <div>
                        <strong>{Number(widgets.uploadStats?.songs || 0)}</strong>
                        <span>{t("dashboard.widgets.uploadSongs")}</span>
                    </div>
                    <div>
                        <strong>{Number(widgets.uploadStats?.videos || 0)}</strong>
                        <span>{t("dashboard.widgets.uploadVideos")}</span>
                    </div>
                    <div>
                        <strong>{Number(widgets.uploadStats?.beats || 0)}</strong>
                        <span>{t("dashboard.widgets.uploadBeats")}</span>
                    </div>
                </div>
            ) : null}

            {widgets?.trendingReleases && widgets.trendingReleases.length > 0 ? (
                <div className="creator-trending-block">
                    <h4>{t("dashboard.widgets.trendingReleases")}</h4>
                    <ul>
                        {widgets.trendingReleases.map((item) => (
                            <li key={`${item.mediaType}-${item.id}`}>
                                <strong>{item.title}</strong>
                                <span>{item.mediaType} · {item.metric.toLocaleString()}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            ) : null}

            <div className="artist-section-title">
                <h3>{t("dashboard.insights.title")}</h3>
            </div>
            {insights ? (
                <div className="creator-insights-grid">
                    <article>
                        <h4>{t("dashboard.insights.topSongs")}</h4>
                        <ul>
                            {(insights.topSongs || []).map((item) => (
                                <li key={item.id}><strong>{item.title}</strong><span>{item.plays.toLocaleString()}</span></li>
                            ))}
                            {(insights.topSongs || []).length === 0 ? <li>{t("dashboard.insights.emptyMetric")}</li> : null}
                        </ul>
                    </article>
                    <article>
                        <h4>{t("dashboard.insights.topVideos")}</h4>
                        <ul>
                            {(insights.topVideos || []).map((item) => (
                                <li key={item.id}><strong>{item.title}</strong><span>{item.views.toLocaleString()}</span></li>
                            ))}
                            {(insights.topVideos || []).length === 0 ? <li>{t("dashboard.insights.emptyMetric")}</li> : null}
                        </ul>
                    </article>
                    <article>
                        <h4>{t("dashboard.insights.topBeats")}</h4>
                        <ul>
                            {(insights.topBeats || []).map((item) => (
                                <li key={item.id}><strong>{item.title}</strong><span>{item.plays.toLocaleString()}</span></li>
                            ))}
                            {(insights.topBeats || []).length === 0 ? <li>{t("dashboard.insights.emptyMetric")}</li> : null}
                        </ul>
                    </article>
                    <article>
                        <h4>{t("dashboard.insights.analytics")}</h4>
                        <p>{t("dashboard.insights.weeklyPlays")}: <strong>{Number(insights.weeklyPlays || 0).toLocaleString()}</strong></p>
                        <p>{t("dashboard.insights.monthlyPlays")}: <strong>{Number(insights.monthlyPlays || 0).toLocaleString()}</strong></p>
                        <p>{t("dashboard.insights.dailyViews")}: <strong>{(insights.daily || []).reduce((n, day) => n + day.views, 0).toLocaleString()}</strong></p>
                    </article>
                </div>
            ) : null}
        </section>
    );
}
