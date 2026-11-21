"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { LoaderCircle } from "lucide-react";
import { authFetch } from "@/lib/client-api-auth";
import type { MixtapeAnalyticsPayload } from "@/lib/mixtape-analytics";
import { supabase } from "@/lib/supabase";
import styles from "./mixtapes.module.css";

type MixtapeStudioAnalyticsPanelProps = {
    userId: string;
};

type AnalyticsResponse = {
    ok?: boolean;
    analytics?: MixtapeAnalyticsPayload;
    error?: string;
    setupRequired?: boolean;
};

export function MixtapeStudioAnalyticsPanel({ userId }: MixtapeStudioAnalyticsPanelProps) {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [analytics, setAnalytics] = useState<MixtapeAnalyticsPayload | null>(null);

    const loadAnalytics = useCallback(async (signal?: AbortSignal) => {
        if (!userId) {
            queueMicrotask(() => {
                setAnalytics(null);
                setError("");
                setLoading(false);
            });
            return;
        }
        queueMicrotask(() => {
            setLoading(true);
            setError("");
        });
        try {
            const response = await authFetch(
                supabase,
                `/api/mixtapes/analytics?userId=${encodeURIComponent(userId)}`,
                { cache: "no-store", signal },
            );
            const body = (await response.json().catch(() => ({}))) as AnalyticsResponse;
            if (!response.ok || !body.analytics) {
                throw new Error(body.error || "Mixtape analytics could not be loaded.");
            }
            setAnalytics(body.analytics);
        }
        catch (loadError) {
            if (signal?.aborted) return;
            setAnalytics(null);
            setError(loadError instanceof Error ? loadError.message : "Mixtape analytics could not be loaded.");
        }
        finally {
            if (!signal?.aborted) setLoading(false);
        }
    }, [userId]);

    useEffect(() => {
        const controller = new AbortController();
        queueMicrotask(() => void loadAnalytics(controller.signal));
        return () => controller.abort();
    }, [loadAnalytics]);

    const topMixtapes = useMemo(() => {
        if (!analytics) return [];
        return [...analytics.mixtapes].sort((left, right) => right.playCount - left.playCount).slice(0, 8);
    }, [analytics]);

    const topTracks = useMemo(() => {
        if (!analytics) return [];
        return [...analytics.tracks].sort((left, right) => right.playCount - left.playCount).slice(0, 12);
    }, [analytics]);

    if (!userId) return null;

    return (
        <section className={styles.analyticsPanel} aria-labelledby="mixtape-analytics-heading">
            <header className={styles.analyticsHeader}>
                <h3 id="mixtape-analytics-heading">Creator analytics</h3>
                <button type="button" onClick={() => void loadAnalytics()} disabled={loading}>
                    Refresh
                </button>
            </header>

            {loading ? (
                <p className={styles.analyticsStatus}>
                    <LoaderCircle size={18} aria-hidden /> Loading analytics…
                </p>
            ) : null}

            {!loading && error ? (
                <div className={styles.errorState} role="alert">{error}</div>
            ) : null}

            {!loading && !error && analytics && analytics.totals.mixtapes.total === 0 ? (
                <div className={styles.emptyState}>
                    Publish a mixtape to start seeing play and favorite totals here.
                </div>
            ) : null}

            {!loading && !error && analytics && analytics.totals.mixtapes.total > 0 ? (
                <>
                    <MotionTotalsRow totals={analytics.totals} />
                    <p className={styles.analyticsFootnote}>
                        Catalog play and favorite counts come from mixtape records. Qualified plays are distinct listening
                        events recorded through playback sessions when available below.
                    </p>
                    <MotionTable
                        title="Mixtape performance"
                        headers={["Title", "Tracks", "Catalog plays", "Favorites", "Status"]}
                        rows={topMixtapes.map((row) => [
                            row.title,
                            String(row.trackCount),
                            String(row.playCount),
                            String(row.favoriteCount),
                            row.status,
                        ])}
                    />
                    <MotionTable
                        title="Track performance"
                        headers={["Track", "Mixtape", "#", "Catalog plays", "Status"]}
                        rows={topTracks.map((row) => [
                            row.title,
                            row.mixtapeTitle,
                            String(row.position),
                            String(row.playCount),
                            row.status,
                        ])}
                    />
                </>
            ) : null}
        </section>
    );
}

function MotionTotalsRow({
    totals,
}: {
    totals: MixtapeAnalyticsPayload["totals"];
}) {
    return (
        <MotionGrid className={styles.analyticsTotals}>
            <article>
                <strong>{totals.engagement.catalogPlays}</strong>
                <span>Catalog play total</span>
                <small>Stored mixtape counters</small>
            </article>
            {totals.engagement.qualifiedPlays !== null ? (
                <article>
                    <strong>{totals.engagement.qualifiedPlays}</strong>
                    <span>Qualified plays</span>
                    <small>Session-recorded listens</small>
                </article>
            ) : null}
            <article>
                <strong>{totals.engagement.catalogFavorites}</strong>
                <span>Catalog favorites</span>
                <small>Stored favorite counters</small>
            </article>
            <article>
                <strong>{totals.mixtapes.published}</strong>
                <span>Published mixtapes</span>
                <small>{totals.mixtapes.unpublished} draft</small>
            </article>
            <article>
                <strong>{totals.tracks.published}</strong>
                <span>Published tracks</span>
                <small>{totals.tracks.unpublished} draft</small>
            </article>
        </MotionGrid>
    );
}

function MotionTable({
    title,
    headers,
    rows,
}: {
    title: string;
    headers: string[];
    rows: string[][];
}) {
    if (rows.length === 0) {
        return (
            <div className={styles.analyticsSection}>
                <h4>{title}</h4>
                <p className={styles.emptyState}>No data yet.</p>
            </div>
        );
    }
    return (
        <div className={styles.analyticsSection}>
            <h4>{title}</h4>
            <div className={styles.analyticsTableWrap}>
                <table className={styles.analyticsTable}>
                    <thead>
                        <tr>
                            {headers.map((header) => (
                                <th key={header} scope="col">{header}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((cells, index) => (
                            <tr key={`${title}-${index}`}>
                                {cells.map((cell, cellIndex) => (
                                    <td key={`${index}-${cellIndex}`}>{cell}</td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

function MotionGrid({
    className,
    children,
}: {
    className: string;
    children: ReactNode;
}) {
    return <div className={className}>{children}</div>;
}