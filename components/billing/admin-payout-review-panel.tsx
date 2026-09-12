"use client";

import { useCallback, useEffect, useState } from "react";

type FetchFn = (path: string, init?: RequestInit & { requireAuth?: boolean }) => Promise<Response>;

type PayoutRow = {
    id: string;
    user_id: string;
    amount_cents: number;
    currency: string;
    status: string;
    creator_type: string;
    creator_name?: string | null;
    requested_at?: string;
    notes?: string | null;
};

type Props = {
    adminUserId: string;
    fetchFn: FetchFn;
    onToast?: (message: string, tone?: "success" | "error" | "info") => void;
};

function formatMoney(cents: number, currency = "USD") {
    try {
        return new Intl.NumberFormat(undefined, { style: "currency", currency }).format((cents || 0) / 100);
    } catch {
        return `$${((cents || 0) / 100).toFixed(2)}`;
    }
}

export function AdminPayoutReviewPanel({ adminUserId, fetchFn, onToast }: Props) {
    const [payouts, setPayouts] = useState<PayoutRow[]>([]);
    const [busyId, setBusyId] = useState("");

    const refresh = useCallback(async () => {
        if (!adminUserId) return;
        try {
            const response = await fetchFn(`/api/admin/payouts?userId=${encodeURIComponent(adminUserId)}`, {
                cache: "no-store",
                requireAuth: true,
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                onToast?.(String(data.error || "Unable to load payout queue."), "error");
                return;
            }
            setPayouts(Array.isArray(data.payouts) ? data.payouts : []);
        } catch {
            onToast?.("Unable to load payout queue.", "error");
        }
    }, [adminUserId, fetchFn, onToast]);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    async function updateStatus(payoutId: string, status: string, notes: string) {
        setBusyId(payoutId);
        try {
            const response = await fetchFn("/api/admin/payouts", {
                method: "POST",
                requireAuth: true,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    userId: adminUserId,
                    payoutId,
                    status,
                    notes,
                }),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                onToast?.(String(data.error || "Unable to update payout."), "error");
                return;
            }
            onToast?.(`Payout marked ${status}.`, "success");
            await refresh();
        } catch {
            onToast?.("Unable to update payout.", "error");
        } finally {
            setBusyId("");
        }
    }

    const pendingCount = payouts.filter((p) => p.status === "pending" || p.status === "processing").length;

    return (
        <section className="stability-panel monetization-panel" data-admin-payout-review>
            <div className="panel-title-row">
                <h3>Admin Review Area for Payouts</h3>
                <span>{pendingCount} pending</span>
            </div>
            {payouts.length === 0 ? (
                <div className="dashboard-empty-card">
                    <h3>No payout requests</h3>
                    <p>Creator withdrawal requests appear here for server-authorized admin review.</p>
                </div>
            ) : (
                <div className="monetization-list">
                    {payouts.slice(0, 20).map((payout) => (
                        <article key={payout.id}>
                            <span>{payout.creator_type} / {payout.status}</span>
                            <strong>
                                {payout.creator_name || payout.creator_type} — {formatMoney(Number(payout.amount_cents || 0), payout.currency)}
                            </strong>
                            <small>{payout.requested_at ? new Date(payout.requested_at).toLocaleString() : ""} | {payout.notes || "No notes"}</small>
                            <div className="monetization-row-actions">
                                <button
                                    type="button"
                                    disabled={busyId === payout.id || payout.status === "paid"}
                                    onClick={() => void updateStatus(payout.id, "processing", "Admin marked payout for processing.")}
                                >
                                    Processing
                                </button>
                                <button
                                    type="button"
                                    disabled={busyId === payout.id || payout.status === "paid"}
                                    onClick={() => void updateStatus(payout.id, "paid", "Admin marked payout paid (foundation review).")}
                                >
                                    Mark Paid
                                </button>
                                <button
                                    type="button"
                                    disabled={busyId === payout.id || payout.status === "paid"}
                                    onClick={() => void updateStatus(payout.id, "failed", "Admin rejected payout.")}
                                >
                                    Reject
                                </button>
                            </div>
                        </article>
                    ))}
                </div>
            )}
        </section>
    );
}
