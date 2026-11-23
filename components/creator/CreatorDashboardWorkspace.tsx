"use client";

import { Film, Library, LineChart, UploadCloud, Wallet } from "lucide-react";
import { CREATOR_WITHDRAWAL_LOCKED_MESSAGE } from "@/lib/billing/constants";

type CreatorDashboardWorkspaceProps = {
    userId: string;
    onOpenVideoUpload?: () => void;
    onOpenVideosLibrary?: () => void;
};

export function CreatorDashboardWorkspace({
    userId,
    onOpenVideoUpload,
    onOpenVideosLibrary,
}: CreatorDashboardWorkspaceProps) {
    return (
        <section className="dashboard-page" data-creator-dashboard data-user-id={userId ? "set" : "missing"}>
            <div className="dashboard-brand">
                <div>
                    <span>STREAM • DISCOVER • CREATE</span>
                    <h2>Creator Dashboard</h2>
                    <p className="creator-studio-subtitle">
                        Video studio for creators who publish video — not music tracks. Upload and manage videos only; music and audio uploads are denied for this account type.
                    </p>
                </div>
            </div>

            <div className="dashboard-nav-row" role="navigation" aria-label="Creator Studio destinations">
                <button type="button" onClick={onOpenVideoUpload}>
                    <UploadCloud size={16} aria-hidden />
                    Video Studio — upload
                </button>
                <button type="button" onClick={onOpenVideosLibrary}>
                    <Film size={16} aria-hidden />
                    Video library
                </button>
            </div>

            <div className="dashboard-grid">
                <div>
                    <strong>Video Studio</strong>
                    <span>Upload and replace videos in your creator folder.</span>
                </div>
                <div>
                    <strong>Performance</strong>
                    <span>Views and engagement from your published videos.</span>
                </div>
                <div>
                    <strong>
                        <Library size={14} aria-hidden /> Library
                    </strong>
                    <span>Manage published and draft video catalog entries.</span>
                </div>
                <div>
                    <strong>
                        <LineChart size={14} aria-hidden /> Analytics
                    </strong>
                    <span>Audience and engagement statistics (video scope).</span>
                </div>
            </div>

            <section className="dashboard-panel" data-earnings-placeholder>
                <div className="artist-section-title">
                    <h3>
                        <Wallet size={16} aria-hidden /> Earnings
                    </h3>
                    <span>Coming at full launch</span>
                </div>
                <p>
                    {CREATOR_WITHDRAWAL_LOCKED_MESSAGE || "Monetization coming at full launch."}
                    {" "}
                    Eligible video activity may support future creator earnings after launch. Paid checkout, payouts, and subscriptions remain disabled during public beta.
                </p>
            </section>
        </section>
    );
}