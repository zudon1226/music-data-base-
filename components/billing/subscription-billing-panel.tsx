"use client";

import { useCallback, useEffect, useState } from "react";
import { CREATOR_WITHDRAWAL_LOCKED_MESSAGE } from "@/lib/billing/constants";

type FetchFn = (path: string, init?: RequestInit & { requireAuth?: boolean }) => Promise<Response>;

type Plan = {
    id: string;
    name: string;
    audience: string;
    price_cents: number;
    currency: string;
    billing_interval: string;
    features: string[] | unknown;
    description?: string | null;
};

type Access = {
    effectiveStatus: string;
    withdrawalsLocked: boolean;
    uploadsLocked: boolean;
    withdrawalLockMessage: string | null;
    uploadLockMessage: string | null;
    earningsAccumulate: boolean;
};

type Subscription = {
    id: string;
    plan_name: string;
    status: string;
    auto_renew?: boolean;
    cancel_at_period_end?: boolean;
    current_period_end?: string | null;
    payment_provider?: string | null;
    price_cents?: number;
    currency?: string;
};

type Props = {
    userId: string;
    audience: "listener" | "artist" | "producer";
    email?: string;
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

function featureList(features: Plan["features"]) {
    if (Array.isArray(features)) return features.map(String);
    return [];
}

export function SubscriptionBillingPanel({ userId, audience, email, fetchFn, onToast }: Props) {
    const [plans, setPlans] = useState<Plan[]>([]);
    const [subscription, setSubscription] = useState<Subscription | null>(null);
    const [access, setAccess] = useState<Access | null>(null);
    const [providers, setProviders] = useState<string[]>(["test"]);
    const [provider, setProvider] = useState("test");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");

    const load = useCallback(async () => {
        if (!userId) return;
        setError("");
        const response = await fetchFn(`/api/subscriptions?userId=${encodeURIComponent(userId)}&audience=${audience}`, {
            requireAuth: true,
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            setError(String(data.error || "Unable to load billing."));
            return;
        }
        setPlans(Array.isArray(data.plans) ? data.plans : []);
        setSubscription(data.subscription || null);
        setAccess(data.access || null);
        const configured = data.providers?.configuredProviders;
        if (Array.isArray(configured) && configured.length) {
            setProviders(configured);
            setProvider(String(data.providers?.defaultProvider || configured[0]));
        }
    }, [audience, fetchFn, userId]);

    useEffect(() => {
        void load();
    }, [load]);

    async function startCheckout(planId: string) {
        if (!userId || busy) return;
        setBusy(true);
        setError("");
        try {
            const origin = typeof window !== "undefined" ? window.location.origin : "";
            const response = await fetchFn("/api/subscriptions/checkout", {
                method: "POST",
                requireAuth: true,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    userId,
                    planId,
                    audience,
                    provider,
                    customerEmail: email || undefined,
                    successUrl: `${origin}/?billing=success`,
                    cancelUrl: `${origin}/?billing=cancel`,
                }),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(String(data.error || "Checkout failed."));
            }
            onToast?.(String(data.message || "Checkout ready."), "success");
            if (data.checkoutUrl && data.mode === "live") {
                window.location.href = String(data.checkoutUrl);
                return;
            }
            await load();
        } catch (err) {
            const message = err instanceof Error ? err.message : "Checkout failed.";
            setError(message);
            onToast?.(message, "error");
        } finally {
            setBusy(false);
        }
    }

    async function cancelRenewal() {
        if (!userId || busy) return;
        setBusy(true);
        setError("");
        try {
            const response = await fetchFn("/api/subscriptions/cancel", {
                method: "POST",
                requireAuth: true,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userId }),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(String(data.error || "Cancel failed."));
            }
            onToast?.(String(data.message || "Renewals cancelled."), "success");
            await load();
        } catch (err) {
            const message = err instanceof Error ? err.message : "Cancel failed.";
            setError(message);
            onToast?.(message, "error");
        } finally {
            setBusy(false);
        }
    }

    const paidPlans = plans.filter((plan) => Number(plan.price_cents || 0) > 0);

    return (
        <section className="dashboard-panel monetization-panel" data-billing-panel="subscription">
            <div className="artist-section-title">
                <h3>Subscription & Billing</h3>
                <span>{audience} · monthly · auto-renew</span>
            </div>

            {subscription ? (
                <div className="monetization-summary-grid">
                    <div>
                        <strong>{subscription.plan_name}</strong>
                        <span>Current plan</span>
                    </div>
                    <div>
                        <strong>{subscription.status}</strong>
                        <span>Status</span>
                    </div>
                    <div>
                        <strong>{subscription.auto_renew === false ? "Off" : "On"}</strong>
                        <span>Auto-renew</span>
                    </div>
                    <div>
                        <strong>
                            {subscription.current_period_end
                                ? new Date(subscription.current_period_end).toLocaleDateString()
                                : "—"}
                        </strong>
                        <span>Paid through</span>
                    </div>
                </div>
            ) : (
                <p className="empty-small">No active paid subscription yet. Select a monthly plan below.</p>
            )}

            {access?.withdrawalsLocked ? (
                <article>
                    <strong>Withdrawals locked</strong>
                    <small>{access.withdrawalLockMessage || CREATOR_WITHDRAWAL_LOCKED_MESSAGE}</small>
                </article>
            ) : null}

            {access?.uploadsLocked ? (
                <article>
                    <strong>Publishing locked</strong>
                    <small>{access.uploadLockMessage}</small>
                </article>
            ) : null}

            {audience === "listener" ? (
                <small>
                    Listener benefits: Unlimited streaming, Library, Playlists, Queue, Recommendations. Cancel anytime;
                    access continues until the paid period ends.
                </small>
            ) : (
                <small>
                    Earnings and wallet balances continue updating when past due. Withdrawals unlock automatically once
                    payment is current. Suspended (3+ months past due) disables uploads and new releases; published
                    content stays visible.
                </small>
            )}

            <div className="source-row" style={{ marginTop: 10 }}>
                <span>Provider</span>
                {providers.map((id) => (
                    <button
                        key={id}
                        className={provider === id ? "active" : ""}
                        disabled={busy}
                        onClick={() => setProvider(id)}
                        type="button"
                    >
                        {id}
                    </button>
                ))}
            </div>

            <div className="monetization-plan-grid">
                {paidPlans.map((plan) => (
                    <article className="monetization-plan" key={plan.id}>
                        <span>{plan.audience}</span>
                        <strong>{plan.name}</strong>
                        <b>{formatMoney(plan.price_cents, plan.currency)}/{plan.billing_interval}</b>
                        <small>{featureList(plan.features).join(" | ")}</small>
                        <button disabled={busy} onClick={() => void startCheckout(plan.id)} type="button">
                            {busy ? "Working…" : "Subscribe"}
                        </button>
                    </article>
                ))}
            </div>

            {subscription && subscription.auto_renew !== false && subscription.status !== "cancelled" ? (
                <div className="monetization-row-actions">
                    <button disabled={busy} onClick={() => void cancelRenewal()} type="button">
                        Cancel future renewals
                    </button>
                </div>
            ) : null}

            {error ? <p className="profile-feedback profile-feedback-error" role="alert">{error}</p> : null}
        </section>
    );
}
