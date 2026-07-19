"use client";

import { useCallback, useEffect, useState } from "react";

type FetchFn = (path: string, init?: RequestInit & { requireAuth?: boolean }) => Promise<Response>;

type Snapshot = {
    subscriberCount: number;
    failedPaymentCount: number;
    suspendedCount: number;
    withdrawalLockedCount?: number;
    overdueBalanceTotalCents?: number;
    statusCounts: Record<string, number>;
    billingStatusCounts?: Record<string, number>;
    subscribers: Array<{
        id: string;
        user_id: string;
        plan_name: string;
        status: string;
        billingStatus?: string;
        price_cents: number;
        currency: string;
        payment_provider?: string | null;
        months_past_due?: number | null;
        current_period_end?: string | null;
        renewalDate?: string | null;
        overdueBalanceCents?: number;
        withdrawalsLocked?: boolean;
        withdrawalLockStatus?: string;
        autoRenew?: boolean;
    }>;
    failedPayments: Array<{
        id: string;
        user_id: string;
        amount_cents: number;
        currency: string;
        status: string;
        failure_message?: string | null;
        payment_provider?: string;
        created_at: string;
    }>;
    suspendedAccounts: Array<{
        id: string;
        user_id: string;
        plan_name: string;
        status: string;
        billingStatus?: string;
        months_past_due?: number | null;
        overdueBalanceCents?: number;
        withdrawalsLocked?: boolean;
        renewalDate?: string | null;
    }>;
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

export function AdminSubscriptionPanel({ adminUserId, fetchFn, onToast }: Props) {
    const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");

    const load = useCallback(async () => {
        if (!adminUserId) return;
        setError("");
        const response = await fetchFn(`/api/admin/subscriptions?userId=${encodeURIComponent(adminUserId)}&view=snapshot`, {
            requireAuth: true,
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            setError(String(data.error || "Unable to load admin billing."));
            return;
        }
        setSnapshot(data.snapshot || null);
    }, [adminUserId, fetchFn]);

    useEffect(() => {
        void load();
    }, [load]);

    async function runAction(action: string, payload: Record<string, unknown>) {
        if (!adminUserId || busy) return;
        setBusy(true);
        setError("");
        try {
            const response = await fetchFn("/api/admin/subscriptions", {
                method: "POST",
                requireAuth: true,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userId: adminUserId, action, ...payload }),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(String(data.error || "Admin action failed."));
            }
            onToast?.(`Billing action ${action} completed.`, "success");
            await load();
        } catch (err) {
            const message = err instanceof Error ? err.message : "Admin action failed.";
            setError(message);
            onToast?.(message, "error");
        } finally {
            setBusy(false);
        }
    }

    return (
        <section className="stability-panel monetization-panel" data-billing-panel="admin-subscriptions">
            <div className="panel-title-row">
                <h3>Admin · Subscriptions & Payments</h3>
                <span>
                    {snapshot?.subscriberCount || 0} subscribers · {snapshot?.failedPaymentCount || 0} failed ·{" "}
                    {snapshot?.suspendedCount || 0} suspended · {snapshot?.withdrawalLockedCount || 0} withdrawal-locked
                </span>
            </div>

            <div className="monetization-summary-grid">
                {Object.entries(snapshot?.billingStatusCounts || snapshot?.statusCounts || {}).map(([status, count]) => (
                    <div key={status}>
                        <strong>{count}</strong>
                        <span>{status}</span>
                    </div>
                ))}
            </div>

            <div className="monetization-list">
                <h4>Subscribers</h4>
                {(snapshot?.subscribers || []).slice(0, 12).map((row) => (
                    <article key={row.id}>
                        <span>{row.billingStatus || row.status} / {row.payment_provider || "n/a"}</span>
                        <strong>{row.plan_name} · {formatMoney(row.price_cents, row.currency)}</strong>
                        <small>
                            user {row.user_id.slice(0, 8)}… · overdue {formatMoney(row.overdueBalanceCents || 0, row.currency)}
                            {" · "}renewal {(row.renewalDate || row.current_period_end)
                                ? new Date(String(row.renewalDate || row.current_period_end)).toLocaleDateString()
                                : "n/a"}
                            {" · "}withdrawals {row.withdrawalLockStatus || (row.withdrawalsLocked ? "locked" : "unlocked")}
                            {" · "}auto-renew {row.autoRenew === false ? "off" : "on"}
                        </small>
                        <div className="monetization-row-actions">
                            <button
                                disabled={busy}
                                onClick={() => void runAction("reactivate", { subscriptionId: row.id })}
                                type="button"
                            >
                                Reactivate
                            </button>
                            <button
                                disabled={busy}
                                onClick={() => void runAction("override_status", { subscriptionId: row.id, status: "active", note: "Manual admin override to active" })}
                                type="button"
                            >
                                Override Active
                            </button>
                            <button
                                disabled={busy}
                                onClick={() => void runAction("override_status", { subscriptionId: row.id, status: "suspended", note: "Manual admin suspend" })}
                                type="button"
                            >
                                Override Suspended
                            </button>
                        </div>
                    </article>
                ))}
            </div>

            <div className="monetization-list">
                <h4>Failed payments</h4>
                {(snapshot?.failedPayments || []).length === 0 ? (
                    <article>
                        <strong>No failed payments</strong>
                        <small>Retry and grace-period failures will appear here.</small>
                    </article>
                ) : (
                    (snapshot?.failedPayments || []).slice(0, 12).map((payment) => (
                        <article key={payment.id}>
                            <span>{payment.status} / {payment.payment_provider}</span>
                            <strong>{formatMoney(payment.amount_cents, payment.currency)}</strong>
                            <small>{payment.failure_message || "Payment failed"} · {new Date(payment.created_at).toLocaleString()}</small>
                            <div className="monetization-row-actions">
                                <button
                                    disabled={busy}
                                    onClick={() => void runAction("refund", { paymentId: payment.id, reason: "Admin refund" })}
                                    type="button"
                                >
                                    Refund
                                </button>
                            </div>
                        </article>
                    ))
                )}
            </div>

            <div className="monetization-list">
                <h4>Suspended accounts</h4>
                {(snapshot?.suspendedAccounts || []).length === 0 ? (
                    <article>
                        <strong>No suspended accounts</strong>
                        <small>Creators 3+ months past due become suspended automatically.</small>
                    </article>
                ) : (
                    (snapshot?.suspendedAccounts || []).map((row) => (
                        <article key={row.id}>
                            <span>{row.billingStatus || "inactive"}</span>
                            <strong>{row.plan_name}</strong>
                            <small>
                                user {row.user_id.slice(0, 8)}… · overdue {formatMoney(row.overdueBalanceCents || 0)}
                                {" · "}months past due {row.months_past_due || 0}
                                {" · "}withdrawals {row.withdrawalsLocked === false ? "unlocked" : "locked"}
                            </small>
                            <div className="monetization-row-actions">
                                <button
                                    disabled={busy}
                                    onClick={() => void runAction("reactivate", { subscriptionId: row.id, note: "Admin reactivated suspended account" })}
                                    type="button"
                                >
                                    Reactivate
                                </button>
                            </div>
                        </article>
                    ))
                )}
            </div>

            {error ? <p className="profile-feedback profile-feedback-error" role="alert">{error}</p> : null}
        </section>
    );
}
