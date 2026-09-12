"use client";

import { useCallback, useEffect, useState } from "react";

type FetchFn = (path: string, init?: RequestInit & { requireAuth?: boolean }) => Promise<Response>;

type SponsorPackage = {
    id: string;
    name: string;
    description?: string;
    price_cents: number;
    currency?: string;
    duration_label?: string;
    placement_type?: string;
    active?: boolean;
    display_order?: number;
};

type SponsorApplication = {
    id: string;
    business_name?: string;
    contact_name?: string;
    email?: string;
    status?: string;
    payment_status?: string;
    amount_cents?: number;
    requested_placement?: string;
    notes?: string;
    created_at?: string;
};

type Props = {
    userId: string;
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

export function AdminSponsorPanel({ userId, fetchFn, onToast }: Props) {
    const [applications, setApplications] = useState<SponsorApplication[]>([]);
    const [packages, setPackages] = useState<SponsorPackage[]>([]);
    const [revenue, setRevenue] = useState({ sponsorGrossCents: 0, grossCents: 0 });
    const [selectedId, setSelectedId] = useState("");
    const [statusFilter, setStatusFilter] = useState("");
    const [busy, setBusy] = useState("");
    const [pkgForm, setPkgForm] = useState({
        name: "",
        description: "",
        priceCents: "50000",
        durationLabel: "30 days",
        placementType: "home_featured",
        displayOrder: "100",
    });

    const load = useCallback(async () => {
        const [appRes, pkgRes] = await Promise.all([
            fetchFn(`/api/admin/sponsors?userId=${encodeURIComponent(userId)}${statusFilter ? `&status=${encodeURIComponent(statusFilter)}` : ""}`, {
                requireAuth: true,
                cache: "no-store",
            }),
            fetchFn(`/api/admin/sponsors/packages?userId=${encodeURIComponent(userId)}`, {
                requireAuth: true,
                cache: "no-store",
            }),
        ]);
        const appBody = await appRes.json().catch(() => ({}));
        const pkgBody = await pkgRes.json().catch(() => ({}));
        if (!appRes.ok) throw new Error(String(appBody.error || "Unable to load sponsor admin data."));
        setApplications(Array.isArray(appBody.applications) ? appBody.applications : []);
        setRevenue(appBody.revenue || { sponsorGrossCents: 0, grossCents: 0 });
        setPackages(Array.isArray(pkgBody.packages) ? pkgBody.packages : []);
    }, [fetchFn, statusFilter, userId]);

    useEffect(() => {
        void load().catch((err) => onToast?.(err instanceof Error ? err.message : "Load failed.", "error"));
    }, [load, onToast]);

    const selected = applications.find((row) => row.id === selectedId) || applications[0] || null;

    async function runAction(action: string, extra: Record<string, unknown> = {}) {
        if (!selected?.id) return;
        setBusy(action);
        try {
            const res = await fetchFn("/api/admin/sponsors", {
                method: "POST",
                requireAuth: true,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userId, applicationId: selected.id, action, ...extra }),
            });
            const body = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(String(body.error || "Action failed."));
            onToast?.(`Sponsor application ${action} completed.`, "success");
            await load();
        } catch (err) {
            onToast?.(err instanceof Error ? err.message : "Action failed.", "error");
        } finally {
            setBusy("");
        }
    }

    async function savePackage() {
        setBusy("package");
        try {
            const res = await fetchFn("/api/admin/sponsors/packages", {
                method: "POST",
                requireAuth: true,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    userId,
                    name: pkgForm.name,
                    description: pkgForm.description,
                    priceCents: Number(pkgForm.priceCents),
                    durationLabel: pkgForm.durationLabel,
                    placementType: pkgForm.placementType,
                    displayOrder: Number(pkgForm.displayOrder),
                    active: true,
                }),
            });
            const body = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(String(body.error || "Unable to save package."));
            onToast?.("Sponsor package saved.", "success");
            setPkgForm({ name: "", description: "", priceCents: "50000", durationLabel: "30 days", placementType: "home_featured", displayOrder: "100" });
            await load();
        } catch (err) {
            onToast?.(err instanceof Error ? err.message : "Save failed.", "error");
        } finally {
            setBusy("");
        }
    }

    return (
        <section className="dashboard-panel monetization-panel" data-admin-sponsor-panel="true">
            <div className="artist-section-title">
                <h3>Sponsor Control Center</h3>
                <span>Platform revenue only — no creator earnings</span>
            </div>
            <div className="monetization-summary-grid">
                <div><strong>{formatMoney(revenue.sponsorGrossCents)}</strong><span>Sponsor platform revenue</span></div>
                <div><strong>{applications.length}</strong><span>Applications</span></div>
                <div><strong>{packages.filter((p) => p.active !== false).length}</strong><span>Active packages</span></div>
            </div>

            <div className="ringtone-market-controls">
                <label>
                    <span className="sr-only">Filter status</span>
                    <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                        <option value="">All statuses</option>
                        <option value="submitted">Submitted</option>
                        <option value="under_review">Under review</option>
                        <option value="approved">Approved</option>
                        <option value="payment_pending">Payment pending</option>
                        <option value="paid">Paid</option>
                        <option value="active">Active</option>
                        <option value="rejected">Rejected</option>
                    </select>
                </label>
            </div>

            <div className="split-table">
                {applications.map((app) => (
                    <article key={app.id} className={selected?.id === app.id ? "ringtone-detail" : ""}>
                        <button type="button" onClick={() => setSelectedId(app.id)}>
                            <strong>{app.business_name || "Unnamed"}</strong>
                            <span>{app.status} · {app.payment_status} · {formatMoney(Number(app.amount_cents) || 0)}</span>
                        </button>
                    </article>
                ))}
            </div>

            {selected ? (
                <div className="dashboard-panel">
                    <h4>{selected.business_name}</h4>
                    <p>{selected.contact_name} · {selected.email}</p>
                    <p>{selected.requested_placement} · {selected.notes}</p>
                    <div className="sponsor-actions">
                        <button type="button" disabled={!!busy} onClick={() => { void runAction("approve", { status: "approved" }); }}>Approve</button>
                        <button type="button" disabled={!!busy} onClick={() => { void runAction("reject", { status: "rejected", rejectionReason: "Not approved at this time." }); }}>Reject</button>
                        <button type="button" disabled={!!busy} onClick={() => { void runAction("activate", { activate: true }); }}>Activate</button>
                        <button type="button" disabled={!!busy} onClick={() => { void runAction("deactivate", { deactivate: true }); }}>Deactivate</button>
                        <button type="button" disabled={!!busy} onClick={() => { void runAction("expire", { expire: true }); }}>Expire</button>
                    </div>
                </div>
            ) : null}

            <div className="dashboard-panel">
                <h4>Manage packages</h4>
                <div className="auth-form">
                    <label><span>Name</span><input value={pkgForm.name} onChange={(e) => setPkgForm({ ...pkgForm, name: e.target.value })} /></label>
                    <label><span>Description</span><textarea value={pkgForm.description} onChange={(e) => setPkgForm({ ...pkgForm, description: e.target.value })} rows={2} /></label>
                    <label><span>Price (cents)</span><input value={pkgForm.priceCents} onChange={(e) => setPkgForm({ ...pkgForm, priceCents: e.target.value })} /></label>
                    <label><span>Duration label</span><input value={pkgForm.durationLabel} onChange={(e) => setPkgForm({ ...pkgForm, durationLabel: e.target.value })} /></label>
                    <label><span>Placement type</span><input value={pkgForm.placementType} onChange={(e) => setPkgForm({ ...pkgForm, placementType: e.target.value })} /></label>
                    <button type="button" className="save-upload" disabled={!!busy} onClick={() => { void savePackage(); }}>Add / update package</button>
                </div>
                <ul>
                    {packages.map((pkg) => (
                        <li key={pkg.id}>
                            {pkg.name} — {formatMoney(pkg.price_cents, pkg.currency || "USD")} · {pkg.placement_type} · {pkg.active === false ? "inactive" : "active"}
                        </li>
                    ))}
                </ul>
            </div>
        </section>
    );
}
