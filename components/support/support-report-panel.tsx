"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { LifeBuoy } from "lucide-react";
import { useTranslation } from "@/lib/i18n/provider";
import type { SupportTicketUserRow } from "@/lib/support-tickets";
import { SUPPORT_TICKET_CATEGORIES } from "@/lib/support-tickets";
import {
    detectSupportBrowser,
    detectSupportDeviceType,
    detectSupportPagePath,
} from "@/lib/support-device-detect";

export type SupportReportPrefill = {
    category?: string;
    subject?: string;
    pagePath?: string;
    accountType?: string;
    deviceType?: string;
    browser?: string;
    uploadType?: string;
    fileType?: string;
    fileSize?: number;
    uploadStage?: string;
    appErrorCode?: string;
    requestId?: string;
};

type FetchFn = (path: string, init?: RequestInit & { requireAuth?: boolean }) => Promise<Response>;

type SupportReportPanelProps = {
    userId: string;
    accountType?: string;
    fetchFn: FetchFn;
    prefill?: SupportReportPrefill | null;
    onPrefillConsumed?: () => void;
    defaultExpanded?: boolean;
};

const STATUS_LABEL_KEYS: Record<string, string> = {
    new: "support.statusNew",
    reviewing: "support.statusReviewing",
    need_more_info: "support.statusNeedMoreInfo",
    fixed: "support.statusFixed",
    closed: "support.statusClosed",
};

const CATEGORY_LABEL_KEYS: Record<string, string> = {
    upload: "support.categoryUpload",
    playback: "support.categoryPlayback",
    account: "support.categoryAccount",
    podcast: "support.categoryPodcast",
    ringtone: "support.categoryRingtone",
    billing: "support.categoryBilling",
    navigation: "support.categoryNavigation",
    bug: "support.categoryBug",
    suggestion: "support.categorySuggestion",
    other: "support.categoryOther",
};

function formatWhen(value: string) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export function SupportReportPanel({
    userId,
    accountType = "",
    fetchFn,
    prefill = null,
    onPrefillConsumed,
    defaultExpanded = false,
}: SupportReportPanelProps) {
    const { t } = useTranslation();
    const [expanded, setExpanded] = useState(defaultExpanded);
    const [tickets, setTickets] = useState<SupportTicketUserRow[]>([]);
    const [loadingTickets, setLoadingTickets] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [lastTicketNumber, setLastTicketNumber] = useState("");
    const [category, setCategory] = useState("upload");
    const [subject, setSubject] = useState("");
    const [description, setDescription] = useState("");
    const [screenshot, setScreenshot] = useState<File | null>(null);

    const diagnostics = useMemo(() => ({
        pagePath: prefill?.pagePath || detectSupportPagePath(),
        accountType: prefill?.accountType || accountType,
        deviceType: prefill?.deviceType || detectSupportDeviceType(),
        browser: prefill?.browser || detectSupportBrowser(),
        uploadType: prefill?.uploadType || "",
        fileType: prefill?.fileType || "",
        fileSize: prefill?.fileSize,
        uploadStage: prefill?.uploadStage || "",
        appErrorCode: prefill?.appErrorCode || "",
        requestId: prefill?.requestId || "",
    }), [accountType, prefill]);

    useEffect(() => {
        if (!prefill) return;
        if (prefill.category) setCategory(prefill.category);
        if (prefill.subject) setSubject(prefill.subject);
        setExpanded(true);
        onPrefillConsumed?.();
    }, [prefill, onPrefillConsumed]);

    const loadTickets = useCallback(async () => {
        if (!userId) return;
        setLoadingTickets(true);
        setError("");
        try {
            const response = await fetchFn(`/api/support/tickets?userId=${encodeURIComponent(userId)}`, {
                requireAuth: true,
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(String(payload.error || t("support.loadFailed")));
            }
            setTickets(Array.isArray(payload.tickets) ? payload.tickets : []);
        }
        catch (loadError) {
            setError(loadError instanceof Error ? loadError.message : t("support.loadFailed"));
        }
        finally {
            setLoadingTickets(false);
        }
    }, [fetchFn, t, userId]);

    useEffect(() => {
        if (expanded) void loadTickets();
    }, [expanded, loadTickets]);

    async function submitTicket(event: React.FormEvent) {
        event.preventDefault();
        if (!userId) {
            setError(t("support.signInRequired"));
            return;
        }
        setSubmitting(true);
        setError("");
        setSuccess("");
        setLastTicketNumber("");
        try {
            const form = new FormData();
            form.set("userId", userId);
            form.set("category", category);
            form.set("subject", subject.trim());
            form.set("description", description.trim());
            form.set("accountType", diagnostics.accountType || "");
            form.set("pagePath", diagnostics.pagePath || "");
            form.set("deviceType", diagnostics.deviceType || "");
            form.set("browser", diagnostics.browser || "");
            form.set("uploadType", diagnostics.uploadType || "");
            form.set("fileType", diagnostics.fileType || "");
            if (typeof diagnostics.fileSize === "number") form.set("fileSize", String(diagnostics.fileSize));
            form.set("uploadStage", diagnostics.uploadStage || "");
            form.set("appErrorCode", diagnostics.appErrorCode || "");
            form.set("requestId", diagnostics.requestId || "");
            if (screenshot) form.set("screenshot", screenshot);

            const response = await fetchFn("/api/support/tickets", {
                method: "POST",
                body: form,
                requireAuth: true,
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(String(payload.error || t("support.submitFailed")));
            }
            const ticket = payload.ticket as SupportTicketUserRow | undefined;
            setLastTicketNumber(ticket?.ticketNumber || "");
            setSuccess(t("support.submitSuccess"));
            setSubject("");
            setDescription("");
            setScreenshot(null);
            await loadTickets();
        }
        catch (submitError) {
            setError(submitError instanceof Error ? submitError.message : t("support.submitFailed"));
        }
        finally {
            setSubmitting(false);
        }
    }

    async function openScreenshot(ticketId: string) {
        try {
            const response = await fetchFn(
                `/api/support/tickets/${encodeURIComponent(ticketId)}/screenshot?userId=${encodeURIComponent(userId)}`,
                { requireAuth: true },
            );
            const payload = await response.json().catch(() => ({}));
            if (!response.ok || !payload.url) {
                throw new Error(String(payload.error || t("support.screenshotFailed")));
            }
            window.open(String(payload.url), "_blank", "noopener,noreferrer");
        }
        catch (screenshotError) {
            setError(screenshotError instanceof Error ? screenshotError.message : t("support.screenshotFailed"));
        }
    }

    return (
        <div className="profile-save support-report-panel">
            <div className="panel-title-row support-report-head">
                <h3>
                    <LifeBuoy size={18} aria-hidden="true" />
                    {t("support.title")}
                </h3>
                <button
                    aria-expanded={expanded}
                    onClick={() => setExpanded((value) => !value)}
                    type="button"
                >
                    {expanded ? t("support.hide") : t("support.open")}
                </button>
            </div>
            <p>{t("support.subtitle")}</p>

            {expanded ? (
                <>
                    {error ? <p className="profile-feedback profile-feedback-error" role="alert">{error}</p> : null}
                    {success ? (
                        <p className="profile-feedback profile-feedback-success" role="status">
                            {success}
                            {lastTicketNumber ? ` ${t("support.ticketNumber")}: ${lastTicketNumber}` : ""}
                        </p>
                    ) : null}

                    <form className="support-report-form" onSubmit={(event) => void submitTicket(event)}>
                        <label>
                            <span>{t("support.category")}</span>
                            <select onChange={(event) => setCategory(event.target.value)} value={category}>
                                {SUPPORT_TICKET_CATEGORIES.map((value) => (
                                    <option key={value} value={value}>
                                        {t(CATEGORY_LABEL_KEYS[value] as "support.categoryUpload")}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <label>
                            <span>{t("support.subject")}</span>
                            <input maxLength={200} onChange={(event) => setSubject(event.target.value)} required value={subject} />
                        </label>
                        <label>
                            <span>{t("support.description")}</span>
                            <textarea
                                maxLength={8000}
                                onChange={(event) => setDescription(event.target.value)}
                                required
                                rows={5}
                                value={description}
                            />
                        </label>
                        <label>
                            <span>{t("support.screenshotOptional")}</span>
                            <input
                                accept="image/png,image/jpeg,image/webp"
                                onChange={(event) => setScreenshot(event.target.files?.[0] || null)}
                                type="file"
                            />
                        </label>
                        <button disabled={submitting} type="submit">
                            {submitting ? t("common.working") : t("support.submit")}
                        </button>
                    </form>

                    <div className="support-ticket-history">
                        <div className="panel-title-row">
                            <h4>{t("support.yourTickets")}</h4>
                            <button disabled={loadingTickets} onClick={() => void loadTickets()} type="button">
                                {t("common.refresh")}
                            </button>
                        </div>
                        {loadingTickets ? <p>{t("common.loading")}</p> : null}
                        {!loadingTickets && tickets.length === 0 ? <p>{t("support.noTickets")}</p> : null}
                        <ul className="support-ticket-list">
                            {tickets.map((ticket) => (
                                <li key={ticket.id}>
                                    <strong>{ticket.ticketNumber}</strong>
                                    <span>{t(CATEGORY_LABEL_KEYS[ticket.category] as "support.categoryOther")}</span>
                                    <span>{ticket.subject}</span>
                                    <span>{t(STATUS_LABEL_KEYS[ticket.status] as "support.statusNew")}</span>
                                    <small>{formatWhen(ticket.createdAt)}</small>
                                    {ticket.screenshotPath ? (
                                        <button onClick={() => void openScreenshot(ticket.id)} type="button">
                                            {t("support.viewScreenshot")}
                                        </button>
                                    ) : null}
                                </li>
                            ))}
                        </ul>
                    </div>
                </>
            ) : null}
        </div>
    );
}
