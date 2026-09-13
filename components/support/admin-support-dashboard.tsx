"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Filter, LifeBuoy } from "lucide-react";
import { useTranslation } from "@/lib/i18n/provider";
import type { SupportTicketAdminRow } from "@/lib/support-tickets";
import {
    SUPPORT_TICKET_CATEGORIES,
    SUPPORT_TICKET_SEVERITIES,
    SUPPORT_TICKET_STATUSES,
} from "@/lib/support-tickets";

type AdminSupportDashboardProps = {
    userId: string;
    accessToken: string;
};

function formatWhen(value: string) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export function AdminSupportDashboard({ userId, accessToken }: AdminSupportDashboardProps) {
    const { t } = useTranslation();
    const [tickets, setTickets] = useState<SupportTicketAdminRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [selectedId, setSelectedId] = useState("");
    const [statusFilter, setStatusFilter] = useState("");
    const [categoryFilter, setCategoryFilter] = useState("");
    const [roleFilter, setRoleFilter] = useState<"" | "Listener" | "Artist" | "Producer">("");
    const [deviceTypeFilter, setDeviceTypeFilter] = useState("");
    const [severityFilter, setSeverityFilter] = useState("");
    const [adminNotesDraft, setAdminNotesDraft] = useState("");
    const [statusDraft, setStatusDraft] = useState("");
    const [severityDraft, setSeverityDraft] = useState("");
    const [saving, setSaving] = useState(false);

    const selected = useMemo(
        () => tickets.find((ticket) => ticket.id === selectedId) || null,
        [selectedId, tickets],
    );

    const loadTickets = useCallback(async () => {
        if (!userId || !accessToken) return;
        setLoading(true);
        setError("");
        try {
            const params = new URLSearchParams({ userId });
            if (statusFilter) params.set("status", statusFilter);
            if (categoryFilter) params.set("category", categoryFilter);
            if (roleFilter) params.set("accountType", roleFilter);
            if (deviceTypeFilter) params.set("deviceType", deviceTypeFilter);
            if (severityFilter) params.set("severity", severityFilter);
            const response = await fetch(`/api/admin/support/tickets?${params.toString()}`, {
                headers: { Authorization: `Bearer ${accessToken}` },
                cache: "no-store",
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(String(payload.error || t("support.adminLoadFailed")));
            }
            const rows = Array.isArray(payload.tickets) ? payload.tickets as SupportTicketAdminRow[] : [];
            setTickets(rows);
            if (!selectedId && rows[0]) setSelectedId(rows[0].id);
        }
        catch (loadError) {
            setError(loadError instanceof Error ? loadError.message : t("support.adminLoadFailed"));
        }
        finally {
            setLoading(false);
        }
    }, [
        accessToken,
        roleFilter,
        categoryFilter,
        deviceTypeFilter,
        selectedId,
        severityFilter,
        statusFilter,
        t,
        userId,
    ]);

    useEffect(() => {
        void loadTickets();
    }, [loadTickets]);

    useEffect(() => {
        if (!selected) return;
        setAdminNotesDraft(selected.adminNotes || "");
        setStatusDraft(selected.status);
        setSeverityDraft(selected.severity);
    }, [selected]);

    async function saveTicket() {
        if (!selected) return;
        setSaving(true);
        setError("");
        try {
            const response = await fetch("/api/admin/support/tickets", {
                method: "PATCH",
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    userId,
                    id: selected.id,
                    status: statusDraft,
                    severity: severityDraft,
                    adminNotes: adminNotesDraft,
                }),
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(String(payload.error || t("support.adminSaveFailed")));
            }
            await loadTickets();
        }
        catch (saveError) {
            setError(saveError instanceof Error ? saveError.message : t("support.adminSaveFailed"));
        }
        finally {
            setSaving(false);
        }
    }

    async function openScreenshot(ticket: SupportTicketAdminRow) {
        if (!ticket.screenshotPath) return;
        try {
            const response = await fetch(
                `/api/support/tickets/${encodeURIComponent(ticket.id)}/screenshot?userId=${encodeURIComponent(userId)}`,
                { headers: { Authorization: `Bearer ${accessToken}` } },
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
        <section className="stability-panel support-admin-panel">
            <div className="panel-title-row">
                <h3><LifeBuoy size={16} /> {t("support.adminTitle")}</h3>
                <span>{tickets.length} {t("support.adminQueueCount")}</span>
            </div>
            {error ? <p className="profile-feedback profile-feedback-error" role="alert">{error}</p> : null}

            <div className="support-admin-filters">
                <Filter size={15} aria-hidden="true" />
                <div
                    aria-label={t("support.filterAccountType")}
                    className="support-admin-role-filters"
                    role="group"
                >
                    {([
                        ["", "support.filterRoleAll"],
                        ["Listener", "support.filterRoleListener"],
                        ["Artist", "support.filterRoleArtist"],
                        ["Producer", "support.filterRoleProducer"],
                    ] as const).map(([value, labelKey]) => (
                        <button
                            aria-pressed={roleFilter === value}
                            className={roleFilter === value ? "active" : ""}
                            key={value || "all"}
                            onClick={() => setRoleFilter(value)}
                            type="button"
                        >
                            {t(labelKey as "support.filterRoleAll")}
                        </button>
                    ))}
                </div>
                <select onChange={(event) => setStatusFilter(event.target.value)} value={statusFilter}>
                    <option value="">{t("support.filterStatus")}</option>
                    {SUPPORT_TICKET_STATUSES.map((status) => (
                        <option key={status} value={status}>{status.replace(/_/g, " ")}</option>
                    ))}
                </select>
                <select onChange={(event) => setCategoryFilter(event.target.value)} value={categoryFilter}>
                    <option value="">{t("support.filterCategory")}</option>
                    {SUPPORT_TICKET_CATEGORIES.map((category) => (
                        <option key={category} value={category}>{category}</option>
                    ))}
                </select>
                <input
                    onChange={(event) => setDeviceTypeFilter(event.target.value)}
                    placeholder={t("support.filterDeviceType")}
                    value={deviceTypeFilter}
                />
                <select onChange={(event) => setSeverityFilter(event.target.value)} value={severityFilter}>
                    <option value="">{t("support.filterSeverity")}</option>
                    {SUPPORT_TICKET_SEVERITIES.map((severity) => (
                        <option key={severity} value={severity}>{severity}</option>
                    ))}
                </select>
                <button disabled={loading} onClick={() => void loadTickets()} type="button">{t("common.refresh")}</button>
            </div>

            <div className="support-admin-grid">
                <div className="support-admin-list">
                    {loading ? <p>{t("common.loading")}</p> : null}
                    {!loading && tickets.length === 0 ? <p>{t("support.adminEmpty")}</p> : null}
                    <ul>
                        {tickets.map((ticket) => (
                            <li key={ticket.id}>
                                <button
                                    className={ticket.id === selectedId ? "active" : ""}
                                    onClick={() => setSelectedId(ticket.id)}
                                    type="button"
                                >
                                    <strong>{ticket.ticketNumber}</strong>
                                    <span>{ticket.status.replace(/_/g, " ")}</span>
                                    <small>{ticket.subject}</small>
                                </button>
                            </li>
                        ))}
                    </ul>
                </div>

                {selected ? (
                    <article className="support-admin-detail">
                        <h4>{selected.ticketNumber} — {selected.subject}</h4>
                        <p>{selected.description}</p>
                        <dl className="support-admin-diagnostics">
                            <div><dt>{t("support.diagCategory")}</dt><dd>{selected.category}</dd></div>
                            <div><dt>{t("support.diagAccount")}</dt><dd>{selected.accountType || "—"}</dd></div>
                            <div><dt>{t("support.diagPage")}</dt><dd>{selected.pagePath || "—"}</dd></div>
                            <div><dt>{t("support.diagDevice")}</dt><dd>{selected.deviceType || "—"}</dd></div>
                            <div><dt>{t("support.diagBrowser")}</dt><dd>{selected.browser || "—"}</dd></div>
                            <div><dt>{t("support.diagUpload")}</dt><dd>{selected.uploadType || "—"}</dd></div>
                            <div><dt>{t("support.diagFile")}</dt><dd>{selected.fileType || "—"} {selected.fileSize ? `(${selected.fileSize} B)` : ""}</dd></div>
                            <div><dt>{t("support.diagStage")}</dt><dd>{selected.uploadStage || "—"}</dd></div>
                            <div><dt>{t("support.diagErrorCode")}</dt><dd>{selected.appErrorCode || "—"}</dd></div>
                            <div><dt>{t("support.diagRequestId")}</dt><dd>{selected.requestId || "—"}</dd></div>
                            <div><dt>{t("support.diagSubmitted")}</dt><dd>{formatWhen(selected.createdAt)}</dd></div>
                        </dl>
                        {selected.screenshotPath ? (
                            <button onClick={() => void openScreenshot(selected)} type="button">
                                {t("support.viewScreenshot")}
                            </button>
                        ) : null}

                        <label>
                            <span>{t("support.adminStatus")}</span>
                            <select onChange={(event) => setStatusDraft(event.target.value)} value={statusDraft}>
                                {SUPPORT_TICKET_STATUSES.map((status) => (
                                    <option key={status} value={status}>{status.replace(/_/g, " ")}</option>
                                ))}
                            </select>
                        </label>
                        <label>
                            <span>{t("support.adminSeverity")}</span>
                            <select onChange={(event) => setSeverityDraft(event.target.value)} value={severityDraft}>
                                {SUPPORT_TICKET_SEVERITIES.map((severity) => (
                                    <option key={severity} value={severity}>{severity}</option>
                                ))}
                            </select>
                        </label>
                        <label>
                            <span>{t("support.adminNotes")}</span>
                            <textarea
                                maxLength={8000}
                                onChange={(event) => setAdminNotesDraft(event.target.value)}
                                rows={4}
                                value={adminNotesDraft}
                            />
                        </label>
                        <button disabled={saving} onClick={() => void saveTicket()} type="button">
                            {saving ? t("common.working") : t("support.adminSave")}
                        </button>
                    </article>
                ) : null}
            </div>
        </section>
    );
}
