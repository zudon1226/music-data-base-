"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { Activity, BarChart3, Music2, RefreshCw, ShieldAlert, Trash2, Users } from "lucide-react";
import { FoundingOnboardingAdminPanel } from "./founding-onboarding-admin-panel";
import { TestAccountCleanupCenter } from "./test-account-cleanup-center";
import { RingtoneReviewQueue } from "./ringtone-review/ringtone-review-queue";
import { useTranslation } from "../lib/i18n/provider";
import type { PlatformControlCenterSnapshot, PlatformHealthLabel } from "../lib/platform-control-center";
import { healthLabelClass } from "../lib/platform-control-center";

type RingtonePreviewRequest = {
    id: string;
    title: string;
    artworkUrl: string;
    audioUrl: string;
    clipStartSeconds: number;
    clipEndSeconds: number;
    durationSeconds: number;
};

type PlatformControlCenterProps = {
    userId: string;
    accessToken: string;
    refreshToken: string;
    session?: Session | null;
    advancedTools?: ReactNode;
    revenueSection?: ReactNode;
    onPreviewRingtone?: (request: RingtonePreviewRequest) => void;
    onStopRingtonePreview?: () => void;
    activeRingtonePreviewId?: string | null;
    ringtonePreviewPlaying?: boolean;
};

function formatCount(value: number) {
    return new Intl.NumberFormat().format(value);
}

function formatWhen(value: string) {
    if (!value) return "Unknown time";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function HealthBadge({ status }: { status: PlatformHealthLabel }) {
    return <span className={`control-health-badge ${healthLabelClass(status)}`}>{status}</span>;
}

function ActivityList({ title, items }: { title: string; items: Array<{ id: string; title: string; detail: string; createdAt: string }> }) {
    const { t } = useTranslation();
    return (
        <article className="control-center-card">
            <h4>{title}</h4>
            {items.length === 0 ? <p className="control-center-empty">{t("platformControlCenter.noRecentActivity")}</p> : (
                <ul className="control-activity-list">
                    {items.map((item) => (
                        <li key={item.id}>
                            <strong>{item.title}</strong>
                            <span>{item.detail}</span>
                            <small>{formatWhen(item.createdAt)}</small>
                        </li>
                    ))}
                </ul>
            )}
        </article>
    );
}

export function PlatformControlCenter({
    userId,
    accessToken,
    refreshToken,
    session = null,
    advancedTools,
    revenueSection,
    onPreviewRingtone,
    onStopRingtonePreview,
    activeRingtonePreviewId = null,
    ringtonePreviewPlaying = false,
}: PlatformControlCenterProps) {
    const { t } = useTranslation();
    const [snapshot, setSnapshot] = useState<PlatformControlCenterSnapshot | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const reviewSession = session || (accessToken
        ? { access_token: accessToken, refresh_token: refreshToken } as Session
        : null);

    const loadSnapshot = useCallback(async () => {
        if (!userId || !accessToken) return;
        setLoading(true);
        setError("");
        try {
            const response = await fetch(`/api/launch/platform-control-center?userId=${encodeURIComponent(userId)}`, {
                headers: { Authorization: `Bearer ${accessToken}` },
                cache: "no-store",
            });
            const json = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(json.error || "Unable to load platform control center.");
            setSnapshot(json.snapshot || null);
        }
        catch (loadError) {
            setError(loadError instanceof Error ? loadError.message : "Unable to load platform control center.");
        }
        finally {
            setLoading(false);
        }
    }, [accessToken, userId]);

    useEffect(() => {
        void loadSnapshot();
    }, [loadSnapshot]);

    const overview = snapshot?.overview;

    return (
        <section className="platform-control-center">
            <div className="control-center-header">
                <div>
                    <span className="control-center-kicker">{t("platformControlCenter.ownerOnly")}</span>
                    <h2>{t("platformControlCenter.title")}</h2>
                    <p>{t("platformControlCenter.subtitle")}</p>
                    <small>{t("platformControlCenter.lastRefreshed", { time: snapshot?.checkedAt ? formatWhen(snapshot.checkedAt) : t("platformControlCenter.notLoadedYet") })}</small>
                </div>
                <button onClick={() => void loadSnapshot()} type="button" disabled={loading}>
                    <RefreshCw size={15}/>
                    {loading ? t("platformControlCenter.refreshing") : t("platformControlCenter.refreshDashboard")}
                </button>
            </div>

            {error ? <div className="upload-error"><p>{error}</p></div> : null}

            <section className="stability-panel control-center-panel">
                <div className="panel-title-row">
                    <h3><BarChart3 size={16}/> {t("platformControlCenter.platformOverview")}</h3>
                    <span>{overview ? `${formatCount(overview.totalUsers)} total users` : t("common.loading")}</span>
                </div>
                <div className="control-overview-grid">
                    {[
                        ["Total users", overview?.totalUsers],
                        ["Approved users", overview?.approvedUsers],
                        ["Pending users", overview?.pendingUsers],
                        ["Rejected users", overview?.rejectedUsers],
                        ["Artists", overview?.artists],
                        ["Producers", overview?.producers],
                        ["Songs", overview?.totalSongs],
                        ["Videos", overview?.totalVideos],
                        ["Ringtones", overview?.totalRingtones],
                        ["Playlists", overview?.totalPlaylists],
                        ["Albums", overview?.totalAlbums],
                        ["Music plays", overview?.totalMusicPlays],
                        ["Video views", overview?.totalVideoViews],
                        ["Likes", overview?.totalLikes],
                        ["Followers", overview?.totalFollowers],
                    ].map(([label, value]) => (
                        <article className="control-overview-card" key={String(label)}>
                            <strong>{formatCount(Number(value || 0))}</strong>
                            <span>{label}</span>
                        </article>
                    ))}
                </div>
            </section>

            <section className="stability-panel control-center-panel">
                <div className="panel-title-row">
                    <h3><ShieldAlert size={16}/> {t("platformControlCenter.systemHealth")}</h3>
                    <span>{snapshot?.health.filter((item) => item.status === "Healthy").length || 0} healthy checks</span>
                </div>
                <div className="control-health-grid">
                    {(snapshot?.health || []).map((item) => (
                        <article className="control-health-card" key={item.id}>
                            <div className="control-health-card-head">
                                <strong>{item.label}</strong>
                                <HealthBadge status={item.status}/>
                            </div>
                            <p>{item.detail}</p>
                        </article>
                    ))}
                </div>
            </section>

            <section className="stability-panel control-center-panel">
                <div className="panel-title-row">
                    <h3><Activity size={16}/> {t("platformControlCenter.recentActivity")}</h3>
                    <span>{snapshot?.flaggedUploadCount || 0} flagged uploads</span>
                </div>
                <div className="control-activity-grid">
                    <ActivityList title="Latest signups" items={snapshot?.activity.latestSignups || []}/>
                    <ActivityList title="Latest uploads" items={snapshot?.activity.latestUploads || []}/>
                    <ActivityList title="Latest deletions" items={snapshot?.activity.latestDeletions || []}/>
                    <ActivityList title="Recent failed uploads" items={snapshot?.activity.recentFailedUploads || []}/>
                    <ActivityList title="Recent auth errors" items={snapshot?.activity.recentAuthErrors || []}/>
                    <ActivityList title="Recent storage errors" items={snapshot?.activity.recentStorageErrors || []}/>
                    <ActivityList title="Recent owner actions" items={snapshot?.activity.recentOwnerActions || []}/>
                </div>
            </section>

            <section className="stability-panel control-center-panel" id="ringtone-review-queue">
                <div className="panel-title-row">
                    <h3><Music2 size={16}/> {t("ringtones.ringtoneReviewQueue")}</h3>
                    <span>{t("ringtones.processingQueue")}</span>
                </div>
                {onPreviewRingtone && onStopRingtonePreview ? (
                    <RingtoneReviewQueue
                        userId={userId}
                        session={reviewSession}
                        onPreviewRingtone={onPreviewRingtone}
                        onStopRingtonePreview={onStopRingtonePreview}
                        activeRingtonePreviewId={activeRingtonePreviewId}
                        ringtonePreviewPlaying={ringtonePreviewPlaying}
                    />
                ) : (
                    <p className="control-center-empty">{t("ringtones.previewUnavailable")}</p>
                )}
            </section>

            <section className="stability-panel control-center-panel" id="test-account-cleanup-center">
                <div className="panel-title-row">
                    <h3><Trash2 size={16}/> {t("testAccountCleanup.title")}</h3>
                    <span>{t("testAccountCleanup.subtitle")}</span>
                </div>
                <TestAccountCleanupCenter
                    userId={userId}
                    accessToken={accessToken}
                    refreshToken={refreshToken}
                />
            </section>

            <section className="stability-panel control-center-panel" id="founding-onboarding-controls">
                <div className="panel-title-row">
                    <h3><Users size={16}/> {t("foundingOnboarding.title")}</h3>
                    <span>{t("foundingOnboarding.subtitle")}</span>
                </div>
                <FoundingOnboardingAdminPanel
                    userId={userId}
                    accessToken={accessToken}
                    refreshToken={refreshToken}
                />
            </section>

            {revenueSection ? (
                <section className="stability-panel control-center-panel" id="owner-revenue-section">
                    <div className="panel-title-row">
                        <h3>Revenue And Earnings</h3>
                        <span>Existing admin revenue tools</span>
                    </div>
                    {revenueSection}
                </section>
            ) : null}

            {advancedTools ? (
                <section className="stability-panel control-center-panel" id="owner-advanced-tools">
                    <div className="panel-title-row">
                        <h3>Advanced Owner Tools</h3>
                        <span>Backup, cleanup, launch checklist, and diagnostics</span>
                    </div>
                    {advancedTools}
                </section>
            ) : null}
        </section>
    );
}
