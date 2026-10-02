"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "@/lib/i18n/provider";

type BlockRow = {
    id: string;
    blocked_user_id: string;
    blocked_user_name: string;
    reason?: string;
    created_at?: string;
};

type FetchFn = (path: string, init?: RequestInit & { requireAuth?: boolean }) => Promise<Response>;

type Props = {
    userId: string;
    fetchFn: FetchFn;
};

export function BlockedUsersPanel({ userId, fetchFn }: Props) {
    const { t } = useTranslation();
    const [blocks, setBlocks] = useState<BlockRow[]>([]);
    const [error, setError] = useState("");
    const [pendingId, setPendingId] = useState("");

    const load = useCallback(async () => {
        if (!userId) return;
        setError("");
        try {
            const response = await fetchFn(`/api/blocked-users?userId=${encodeURIComponent(userId)}`, {
                requireAuth: true,
                cache: "no-store",
            });
            const body = (await response.json().catch(() => ({}))) as { blocks?: BlockRow[]; error?: string };
            if (!response.ok) throw new Error(body.error || "Blocked users could not be loaded.");
            setBlocks(Array.isArray(body.blocks) ? body.blocks : []);
        }
        catch (caught) {
            setBlocks([]);
            setError(caught instanceof Error ? caught.message : "Blocked users could not be loaded.");
        }
    }, [fetchFn, userId]);

    useEffect(() => {
        void load();
    }, [load]);

    async function unblock(block: BlockRow) {
        setPendingId(block.id);
        setError("");
        try {
            const response = await fetchFn("/api/blocked-users", {
                method: "DELETE",
                requireAuth: true,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userId, id: block.id }),
            });
            const body = (await response.json().catch(() => ({}))) as { error?: string };
            if (!response.ok) throw new Error(body.error || "Could not unblock user.");
            setBlocks((current) => current.filter((row) => row.id !== block.id));
        }
        catch (caught) {
            setError(caught instanceof Error ? caught.message : "Could not unblock user.");
        }
        finally {
            setPendingId("");
        }
    }

    return (
        <div className="profile-save account-blocked-users-panel">
            <h3>{t("trust.blockedUsersTitle")}</h3>
            <p>{t("trust.blockedUsersDescription")}</p>
            {error ? <p className="profile-feedback profile-feedback-error" role="alert">{error}</p> : null}
            {blocks.length === 0 ? (
                <p className="profile-muted">{t("trust.blockedUsersEmpty")}</p>
            ) : (
                <ul className="account-blocked-users-list">
                    {blocks.map((block) => (
                        <li key={block.id}>
                            <div>
                                <strong>{block.blocked_user_name || block.blocked_user_id}</strong>
                                {block.reason ? <span>{block.reason}</span> : null}
                            </div>
                            <button
                                disabled={pendingId === block.id}
                                onClick={() => void unblock(block)}
                                type="button"
                            >
                                {t("trust.unblockUser")}
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
