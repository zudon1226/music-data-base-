"use client";

import { useCallback, useEffect, useState } from "react";
import { evaluatePeriodNotice } from "@/lib/billing/period-notice";
import styles from "./subscription-period-notice.module.css";

type FetchFn = (path: string, init?: RequestInit & { requireAuth?: boolean }) => Promise<Response>;

type Props = {
    userId: string;
    fetchFn: FetchFn;
    onToast?: (message: string, tone?: "success" | "error" | "info") => void;
};

export function SubscriptionPeriodNotice({ userId, fetchFn, onToast }: Props) {
    const [open, setOpen] = useState(false);
    const [message, setMessage] = useState("");
    const [title, setTitle] = useState("Subscription reminder");
    const [busy, setBusy] = useState(false);

    const load = useCallback(async () => {
        if (!userId) return;
        const response = await fetchFn(`/api/subscriptions?userId=${encodeURIComponent(userId)}`, {
            requireAuth: true,
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) return;
        const notice = evaluatePeriodNotice(data.subscription || null);
        if (!notice.eligible) {
            setOpen(false);
            return;
        }
        setTitle(notice.title);
        setMessage(notice.body);
        setOpen(true);
    }, [fetchFn, userId]);

    useEffect(() => {
        if (!userId) return;
        let cancelled = false;
        const timer = window.setTimeout(() => {
            if (!cancelled) void load();
        }, 0);
        return () => {
            cancelled = true;
            window.clearTimeout(timer);
        };
    }, [load, userId]);

    async function dismiss() {
        if (!userId || busy) return;
        setBusy(true);
        setOpen(false);
        try {
            const response = await fetchFn("/api/subscriptions/reminder-dismiss", {
                method: "POST",
                requireAuth: true,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userId }),
            });
            if (!response.ok) {
                const data = await response.json().catch(() => ({}));
                onToast?.(String(data.error || "Unable to save reminder dismissal."), "error");
            }
        } catch {
            onToast?.("Unable to save reminder dismissal.", "error");
        } finally {
            setBusy(false);
        }
    }

    if (!open || !message) return null;

    return (
        <div className={styles.backdrop} data-period-notice="login" role="presentation">
            <section
                className={styles.dialog}
                role="dialog"
                aria-modal="true"
                aria-labelledby="subscription-period-notice-title"
                onClick={(event) => event.stopPropagation()}
            >
                <div className={styles.head}>
                    <div>
                        <span className={styles.kicker}>Subscription</span>
                        <h3 className={styles.title} id="subscription-period-notice-title">{title}</h3>
                    </div>
                </div>
                <p className={styles.body}>{message}</p>
                <div className={styles.actions}>
                    <button
                        className={styles.dismiss}
                        disabled={busy}
                        onClick={() => void dismiss()}
                        type="button"
                    >
                        Dismiss
                    </button>
                </div>
            </section>
        </div>
    );
}
