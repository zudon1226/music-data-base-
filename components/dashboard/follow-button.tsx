"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "@/lib/i18n/provider";

type FetchFn = (path: string, init?: RequestInit & { requireAuth?: boolean }) => Promise<Response>;

type FollowButtonProps = {
    viewerUserId: string;
    targetUserId: string;
    fetchFn: FetchFn;
    initialFollowing?: boolean;
    initialMutual?: boolean;
    initialFollowerCount?: number;
    onChanged?: (state: { isFollowing: boolean; isMutual: boolean; followerCount: number }) => void;
    disabled?: boolean;
};

export function FollowButton({
    viewerUserId,
    targetUserId,
    fetchFn,
    initialFollowing = false,
    initialMutual = false,
    initialFollowerCount = 0,
    onChanged,
    disabled,
}: FollowButtonProps) {
    const { t } = useTranslation();
    const [isFollowing, setIsFollowing] = useState(initialFollowing);
    const [isMutual, setIsMutual] = useState(initialMutual);
    const [followerCount, setFollowerCount] = useState(initialFollowerCount);
    const [busy, setBusy] = useState(false);

    const refresh = useCallback(async () => {
        if (!viewerUserId || !targetUserId) return;
        const response = await fetchFn(
            `/api/follows?userId=${encodeURIComponent(viewerUserId)}&targetUserId=${encodeURIComponent(targetUserId)}`,
            { cache: "no-store", requireAuth: true },
        );
        const data = await response.json().catch(() => ({}));
        if (!response.ok) return;
        setIsFollowing(Boolean(data.isFollowing));
        setIsMutual(Boolean(data.isMutual));
        setFollowerCount(Number(data.followerCount || 0));
    }, [fetchFn, targetUserId, viewerUserId]);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    async function toggle() {
        if (!viewerUserId || !targetUserId || busy || disabled) return;
        setBusy(true);
        try {
            const response = await fetchFn("/api/follows", {
                method: "POST",
                requireAuth: true,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    userId: viewerUserId,
                    targetUserId,
                    follow: !isFollowing,
                }),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(String(data.error || t("dashboard.follow.failed")));
            const next = {
                isFollowing: Boolean(data.isFollowing),
                isMutual: Boolean(data.isMutual),
                followerCount: Number(data.followerCount || 0),
            };
            setIsFollowing(next.isFollowing);
            setIsMutual(next.isMutual);
            setFollowerCount(next.followerCount);
            onChanged?.(next);
        }
        catch {
            // keep prior state
        }
        finally {
            setBusy(false);
        }
    }

    if (!viewerUserId || !targetUserId || viewerUserId === targetUserId) {
        return (
            <span className="follow-count-chip">
                {followerCount.toLocaleString()} {t("dashboard.follow.followers")}
            </span>
        );
    }

    return (
        <div className="follow-button-wrap">
            <button
                className={isFollowing ? "follow-button is-following" : "follow-button"}
                disabled={busy || disabled}
                onClick={() => void toggle()}
                type="button"
            >
                {busy ? t("common.working") : isFollowing ? t("dashboard.follow.unfollow") : t("dashboard.follow.follow")}
            </button>
            {isMutual ? <span className="follow-mutual-badge">{t("dashboard.follow.mutual")}</span> : null}
            <span className="follow-count-chip">
                {followerCount.toLocaleString()} {t("dashboard.follow.followers")}
            </span>
        </div>
    );
}
