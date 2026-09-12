"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CREATOR_WITHDRAWAL_LOCKED_MESSAGE } from "@/lib/billing/constants";

type FetchFn = (path: string, init?: RequestInit & { requireAuth?: boolean }) => Promise<Response>;

type ConnectStatus = {
    connectConfigured: boolean;
    onboardingComplete: boolean;
    payoutsEnabled: boolean;
    detailsSubmitted: boolean;
    requirementsDue: string[];
    profile: {
        onboarding_status?: string;
        stripe_connect_account_id?: string | null;
    } | null;
};

type PayoutRow = {
    id: string;
    amount_cents: number;
    currency: string;
    status: string;
    creator_type: string;
    creator_name?: string | null;
    requested_at?: string;
    notes?: string | null;
};

type Props = {
    userId: string;
    creatorType: "artist" | "producer";
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

function clearConnectQueryParam(param: "return" | "refresh") {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("connect") !== param) return;
    params.delete("connect");
    params.delete("creatorType");
    const next = params.toString();
    window.history.replaceState({}, "", next ? `${window.location.pathname}?${next}` : window.location.pathname);
}

async function createFreshConnectOnboardingLink(input: {
    userId: string;
    creatorType: "artist" | "producer";
    email?: string;
    fetchFn: FetchFn;
    onToast?: Props["onToast"];
}) {
    const response = await input.fetchFn("/api/connect/onboard", {
        method: "POST",
        requireAuth: true,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            userId: input.userId,
            creatorType: input.creatorType,
            email: input.email || undefined,
        }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        input.onToast?.(String(data.error || "Connect onboarding is unavailable."), "error");
        return false;
    }
    const url = String(data.onboardingUrl || "").trim();
    if (url.startsWith("https://")) {
        window.location.assign(url);
        return true;
    }
    input.onToast?.("Stripe onboarding link was not returned.", "error");
    return false;
}

/** Handles Stripe refresh_url landing anywhere in the SPA (creates a fresh Account Link). */
export function ConnectOnboardingRefreshHandler({ userId, email, fetchFn, onToast }: Omit<Props, "creatorType">) {
    const handledRef = useRef(false);

    useEffect(() => {
        if (handledRef.current || typeof window === "undefined" || !userId) return;
        const params = new URLSearchParams(window.location.search);
        if (params.get("connect") !== "refresh") return;

        const creatorType = String(params.get("creatorType") || "").trim().toLowerCase();
        if (creatorType !== "artist" && creatorType !== "producer") {
            onToast?.("Connect refresh requires an artist or producer account.", "error");
            return;
        }

        handledRef.current = true;
        clearConnectQueryParam("refresh");
        void createFreshConnectOnboardingLink({
            userId,
            creatorType,
            email,
            fetchFn,
            onToast,
        });
    }, [email, fetchFn, onToast, userId]);

    return null;
}

export function CreatorConnectPayoutPanel({ userId, creatorType, email, fetchFn, onToast }: Props) {
    const [connect, setConnect] = useState<ConnectStatus | null>(null);
    const [availableCents, setAvailableCents] = useState(0);
    const [currency, setCurrency] = useState("USD");
    const [payouts, setPayouts] = useState<PayoutRow[]>([]);
    const [withdrawalsLocked, setWithdrawalsLocked] = useState(false);
    const [withdrawalLockMessage, setWithdrawalLockMessage] = useState<string | null>(null);
    const [busy, setBusy] = useState("");
    const [loaded, setLoaded] = useState(false);

    const refresh = useCallback(async () => {
        if (!userId) return;
        try {
            const [statusRes, payoutsRes] = await Promise.all([
                fetchFn(`/api/connect/status?userId=${encodeURIComponent(userId)}&creatorType=${encodeURIComponent(creatorType)}`, {
                    cache: "no-store",
                    requireAuth: true,
                }),
                fetchFn(`/api/payouts?userId=${encodeURIComponent(userId)}&creatorType=${encodeURIComponent(creatorType)}`, {
                    cache: "no-store",
                    requireAuth: true,
                }),
            ]);
            const statusJson = await statusRes.json().catch(() => ({}));
            const payoutsJson = await payoutsRes.json().catch(() => ({}));
            if (statusRes.ok) {
                setConnect(statusJson.connect || null);
                setAvailableCents(Number(statusJson.balance?.availableCents || 0));
                setCurrency(String(statusJson.balance?.currency || "USD"));
            }
            if (payoutsRes.ok) {
                setPayouts(Array.isArray(payoutsJson.payouts) ? payoutsJson.payouts : []);
                setWithdrawalsLocked(Boolean(payoutsJson.withdrawalsLocked));
                setWithdrawalLockMessage(payoutsJson.withdrawalLockMessage || null);
            }
        } catch {
            onToast?.("Unable to load payout status.", "error");
        } finally {
            setLoaded(true);
        }
    }, [creatorType, fetchFn, onToast, userId]);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    useEffect(() => {
        if (typeof window === "undefined") return;
        const params = new URLSearchParams(window.location.search);
        if (params.get("connect") !== "return") return;
        const paramCreatorType = String(params.get("creatorType") || "").trim().toLowerCase();
        if (paramCreatorType && paramCreatorType !== creatorType) return;
        clearConnectQueryParam("return");
        void refresh();
    }, [creatorType, refresh]);

    async function startConnectOnboarding() {
        setBusy("onboard");
        try {
            const started = await createFreshConnectOnboardingLink({
                userId,
                creatorType,
                email,
                fetchFn,
                onToast,
            });
            if (!started) return;
        } catch {
            onToast?.("Unable to start Connect onboarding.", "error");
        } finally {
            setBusy("");
        }
    }

    async function requestWithdrawal() {
        if (availableCents <= 0) {
            onToast?.("No available earnings to withdraw.", "info");
            return;
        }
        setBusy("payout");
        try {
            const response = await fetchFn("/api/payouts", {
                method: "POST",
                requireAuth: true,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    userId,
                    creatorType,
                    amountCents: availableCents,
                    currency,
                }),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                onToast?.(String(data.error || CREATOR_WITHDRAWAL_LOCKED_MESSAGE), "error");
                return;
            }
            onToast?.("Withdrawal request submitted for admin review.", "success");
            await refresh();
        } catch {
            onToast?.("Unable to request withdrawal.", "error");
        } finally {
            setBusy("");
        }
    }

    const onboardingStatus = connect?.profile?.onboarding_status || "not_started";
    const connectReady = connect?.onboardingComplete && connect?.payoutsEnabled;

    return (
        <section className="dashboard-panel monetization-panel" data-creator-connect-panel={creatorType}>
            <div className="artist-section-title">
                <h3>{creatorType === "artist" ? "Artist" : "Producer"} Payout Setup</h3>
                <span>{connectReady ? "Connect ready" : "Connect required"}</span>
            </div>
            {!loaded ? (
                <small>Loading payout status…</small>
            ) : (
                <>
                    <div className="monetization-summary-grid">
                        <div>
                            <strong>{formatMoney(availableCents, currency)}</strong>
                            <span>Available earnings (ledger)</span>
                        </div>
                        <div>
                            <strong>{onboardingStatus}</strong>
                            <span>Connect onboarding</span>
                        </div>
                        <div>
                            <strong>{connect?.payoutsEnabled ? "enabled" : "disabled"}</strong>
                            <span>Stripe payouts</span>
                        </div>
                    </div>
                    {!connect?.connectConfigured ? (
                        <article>
                            <strong>Stripe Connect not configured</strong>
                            <small>Payout onboarding will activate when Stripe TEST keys are configured server-side.</small>
                        </article>
                    ) : null}
                    {withdrawalsLocked ? (
                        <article>
                            <strong>Withdrawals locked</strong>
                            <small>{withdrawalLockMessage || CREATOR_WITHDRAWAL_LOCKED_MESSAGE}</small>
                        </article>
                    ) : null}
                    {(connect?.requirementsDue?.length || 0) > 0 ? (
                        <article>
                            <strong>Stripe requirements pending</strong>
                            <small>{connect?.requirementsDue?.length} item(s) due on Stripe-hosted onboarding.</small>
                        </article>
                    ) : null}
                    <div className="monetization-action-row">
                        <button
                            type="button"
                            disabled={busy !== "" || !connect?.connectConfigured}
                            onClick={() => void startConnectOnboarding()}
                        >
                            {connectReady ? "Update Stripe Payout Setup" : "Start Stripe Payout Setup"}
                        </button>
                        <button
                            type="button"
                            disabled={busy !== "" || availableCents <= 0 || withdrawalsLocked || !connectReady}
                            onClick={() => void requestWithdrawal()}
                        >
                            Request Withdrawal
                        </button>
                    </div>
                    <small className="monetization-footnote">
                        Bank and identity verification are completed on Stripe-hosted Connect onboarding — not in Music Data Base.
                    </small>
                    {payouts.length === 0 ? (
                        <div className="dashboard-empty-card">
                            <h3>No withdrawal requests yet</h3>
                            <p>Earnings from marketplace sales accumulate in your ledger balance.</p>
                        </div>
                    ) : (
                        <div className="monetization-list">
                            {payouts.slice(0, 6).map((payout) => (
                                <article key={payout.id}>
                                    <span>{payout.status}</span>
                                    <strong>{formatMoney(Number(payout.amount_cents || 0), payout.currency)}</strong>
                                    <small>{payout.requested_at ? new Date(payout.requested_at).toLocaleString() : ""}</small>
                                </article>
                            ))}
                        </div>
                    )}
                </>
            )}
        </section>
    );
}
