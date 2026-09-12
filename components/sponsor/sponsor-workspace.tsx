"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { uploadFileToSignedSupabaseStorage } from "@/lib/supabase-storage-upload";

type FetchFn = (path: string, init?: RequestInit & { requireAuth?: boolean }) => Promise<Response>;

type SponsorPackage = {
    id: string;
    name: string;
    description?: string;
    price_cents: number;
    currency?: string;
    duration_label?: string;
    placement_type?: string;
};

type SponsorApplication = {
    id: string;
    business_name?: string;
    contact_name?: string;
    email?: string;
    status?: string;
    payment_status?: string;
    amount_cents?: number;
    currency?: string;
    requested_placement?: string;
    scheduled_start_at?: string | null;
    scheduled_end_at?: string | null;
    rejection_reason?: string | null;
    sponsor_packages?: { name?: string; duration_label?: string } | null;
};

type Props = {
    userId: string;
    email?: string;
    session: Session | null;
    isAuthenticated: boolean;
    fetchFn: FetchFn;
    onRequireLogin: () => void;
    onToast?: (message: string, tone?: "success" | "error" | "info") => void;
};

function formatMoney(cents: number, currency = "USD") {
    try {
        return new Intl.NumberFormat(undefined, { style: "currency", currency }).format((cents || 0) / 100);
    } catch {
        return `$${((cents || 0) / 100).toFixed(2)}`;
    }
}

const PLACEMENT_OPTIONS = [
    { id: "home_featured", label: "Home featured spotlight" },
    { id: "marketplace_banner", label: "Marketplace banner" },
    { id: "sidebar_spotlight", label: "Sidebar spotlight" },
];

export function SponsorWorkspace({
    userId,
    email,
    session,
    isAuthenticated,
    fetchFn,
    onRequireLogin,
    onToast,
}: Props) {
    const [packages, setPackages] = useState<SponsorPackage[]>([]);
    const [applications, setApplications] = useState<SponsorApplication[]>([]);
    const [selectedId, setSelectedId] = useState("");
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [checkoutLocked, setCheckoutLocked] = useState(true);
    const [checkoutMessage, setCheckoutMessage] = useState("Sponsor payment activation is coming at full launch.");
    const [error, setError] = useState("");

    const [form, setForm] = useState({
        businessName: "",
        contactName: "",
        email: email || "",
        phone: "",
        website: "",
        companyDescription: "",
        packageId: "",
        requestedPlacement: "home_featured",
        campaignStartPreference: "",
        campaignEndPreference: "",
        notes: "",
    });
    const [logoFile, setLogoFile] = useState<File | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            const pkgRes = await fetch("/api/sponsors/packages", { cache: "no-store" });
            const pkgBody = await pkgRes.json().catch(() => ({}));
            setPackages(Array.isArray(pkgBody.packages) ? pkgBody.packages : []);

            if (isAuthenticated && userId) {
                const appRes = await fetchFn(`/api/sponsors/applications?userId=${encodeURIComponent(userId)}`, {
                    requireAuth: true,
                    cache: "no-store",
                });
                const appBody = await appRes.json().catch(() => ({}));
                if (!appRes.ok) throw new Error(String(appBody.error || "Unable to load applications."));
                setApplications(Array.isArray(appBody.applications) ? appBody.applications : []);
                setCheckoutLocked(appBody.publicBetaSponsorCheckoutLocked !== false);
                setCheckoutMessage(String(appBody.publicBetaSponsorCheckoutMessage || checkoutMessage));
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : "Unable to load sponsor workspace.");
        } finally {
            setLoading(false);
        }
    }, [checkoutMessage, fetchFn, isAuthenticated, userId]);

    useEffect(() => {
        void load();
    }, [load]);

    useEffect(() => {
        if (email) setForm((prev) => ({ ...prev, email }));
    }, [email]);

    const selectedApplication = applications.find((row) => row.id === selectedId) || applications[0] || null;

    async function submitApplication(submit: boolean) {
        if (!isAuthenticated || !userId) {
            onRequireLogin();
            return;
        }
        setBusy(true);
        setError("");
        try {
            const res = await fetchFn("/api/sponsors/applications", {
                method: "POST",
                requireAuth: true,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    userId,
                    ...form,
                    submit,
                }),
            });
            const body = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(String(body.error || "Unable to submit application."));

            const application = body.application as SponsorApplication;
            if (logoFile && application?.id) {
                const prep = await fetchFn("/api/sponsors/upload-asset", {
                    method: "POST",
                    requireAuth: true,
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        userId,
                        applicationId: application.id,
                        assetType: "logo",
                        mimeType: logoFile.type,
                        byteLength: logoFile.size,
                        altText: form.businessName,
                        destinationUrl: form.website,
                    }),
                });
                const prepBody = await prep.json().catch(() => ({}));
                if (prep.ok && prepBody.token && prepBody.signedUrl) {
                    await uploadFileToSignedSupabaseStorage(
                        String(prepBody.signedUrl),
                        String(prepBody.token),
                        logoFile,
                        logoFile.type,
                    );
                }
            }

            onToast?.(submit ? "Sponsor application submitted for review." : "Draft saved.", "success");
            await load();
            if (application?.id) setSelectedId(application.id);
        } catch (err) {
            const message = err instanceof Error ? err.message : "Submission failed.";
            setError(message);
            onToast?.(message, "error");
        } finally {
            setBusy(false);
        }
    }

    async function startCheckout(applicationId: string) {
        if (!isAuthenticated || !userId) {
            onRequireLogin();
            return;
        }
        setBusy(true);
        setError("");
        try {
            const res = await fetchFn("/api/sponsors/checkout", {
                method: "POST",
                requireAuth: true,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    userId,
                    applicationId,
                    customerEmail: form.email || email,
                    successUrl: `${window.location.origin}/?sponsorCheckout=success`,
                    cancelUrl: `${window.location.origin}/?sponsorCheckout=cancel`,
                }),
            });
            const body = await res.json().catch(() => ({}));
            if (!res.ok) {
                if (String(body.code || "") === "SPONSOR_CHECKOUT_LOCKED") {
                    setCheckoutLocked(true);
                    setCheckoutMessage(String(body.error || body.publicBetaSponsorCheckoutMessage || checkoutMessage));
                }
                throw new Error(String(body.error || "Checkout unavailable."));
            }
            const url = String(body.checkoutUrl || "");
            if (url.startsWith("https://")) {
                window.location.assign(url);
                return;
            }
            throw new Error("Stripe checkout URL was not returned.");
        } catch (err) {
            const message = err instanceof Error ? err.message : "Checkout failed.";
            setError(message);
            onToast?.(message, "error");
        } finally {
            setBusy(false);
        }
    }

    return (
        <section className="dashboard-page sponsor-workspace" data-sponsor-workspace="true">
            <div className="dashboard-panel">
                <div className="artist-section-title">
                    <div>
                        <span className="section-kicker">Platform Sponsorship</span>
                        <h2>Sponsor Music Data Base</h2>
                    </div>
                </div>
                <p>
                    Reach listeners with a featured placement on Music Data Base. Sponsorship purchased through the platform
                    is platform-managed campaign inventory — not artist/producer revenue sharing.
                </p>
                {checkoutLocked ? (
                    <p className="ringtone-payment-mode-banner" role="status">{checkoutMessage}</p>
                ) : null}
                {error ? <p className="ringtone-error" role="alert">{error}</p> : null}
            </div>

            <div className="dashboard-panel">
                <h3>Available packages</h3>
                {loading ? <p>Loading packages…</p> : null}
                {!loading && packages.length === 0 ? (
                    <p className="empty-small">Sponsor packages will appear here once configured by the platform team.</p>
                ) : null}
                <div className="ringtone-market-grid">
                    {packages.map((pkg) => (
                        <article key={pkg.id} className="ringtone-market-card dashboard-panel">
                            <h4>{pkg.name}</h4>
                            <p>{pkg.description || "Featured placement package."}</p>
                            <p><strong>{formatMoney(pkg.price_cents, pkg.currency || "USD")}</strong></p>
                            <p>{pkg.duration_label || "Flexible duration"} · {pkg.placement_type || "home_featured"}</p>
                            <button
                                type="button"
                                className="save-upload"
                                onClick={() => setForm((prev) => ({
                                    ...prev,
                                    packageId: pkg.id,
                                    requestedPlacement: pkg.placement_type || prev.requestedPlacement,
                                }))}
                            >
                                Select package
                            </button>
                        </article>
                    ))}
                </div>
            </div>

            <div className="dashboard-panel">
                <h3>Submit sponsorship application</h3>
                <p>
                    Review the{" "}
                    <Link href="/legal/sponsor-advertising" target="_blank" rel="noopener noreferrer">
                        Sponsor / Advertising Terms
                    </Link>
                    {" "}before submitting an application or starting checkout.
                </p>
                {!isAuthenticated ? (
                    <p>Log in to submit a sponsor application and track review status.</p>
                ) : (
                    <form className="auth-form" onSubmit={(event) => { event.preventDefault(); void submitApplication(true); }}>
                        <label>
                            <span>Business / sponsor name</span>
                            <input value={form.businessName} onChange={(e) => setForm({ ...form, businessName: e.target.value })} required />
                        </label>
                        <label>
                            <span>Contact name</span>
                            <input value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} required />
                        </label>
                        <label>
                            <span>Email</span>
                            <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
                        </label>
                        <label>
                            <span>Phone (optional)</span>
                            <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                        </label>
                        <label>
                            <span>Website (optional)</span>
                            <input value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} />
                        </label>
                        <label>
                            <span>Business description</span>
                            <textarea value={form.companyDescription} onChange={(e) => setForm({ ...form, companyDescription: e.target.value })} rows={4} />
                        </label>
                        <label>
                            <span>Placement</span>
                            <select value={form.requestedPlacement} onChange={(e) => setForm({ ...form, requestedPlacement: e.target.value })}>
                                {PLACEMENT_OPTIONS.map((opt) => (
                                    <option key={opt.id} value={opt.id}>{opt.label}</option>
                                ))}
                            </select>
                        </label>
                        <label>
                            <span>Preferred start date</span>
                            <input type="date" value={form.campaignStartPreference} onChange={(e) => setForm({ ...form, campaignStartPreference: e.target.value })} />
                        </label>
                        <label>
                            <span>Preferred end date</span>
                            <input type="date" value={form.campaignEndPreference} onChange={(e) => setForm({ ...form, campaignEndPreference: e.target.value })} />
                        </label>
                        <label>
                            <span>Notes</span>
                            <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} />
                        </label>
                        <label>
                            <span>Logo / creative (optional)</span>
                            <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(e) => setLogoFile(e.target.files?.[0] || null)} />
                        </label>
                        <div className="sponsor-actions">
                            <button type="button" disabled={busy} onClick={() => { void submitApplication(false); }}>Save draft</button>
                            <button type="submit" className="save-upload" disabled={busy}>{busy ? "Working…" : "Submit for review"}</button>
                        </div>
                    </form>
                )}
            </div>

            {isAuthenticated ? (
                <div className="dashboard-panel">
                    <h3>My sponsor applications</h3>
                    {applications.length === 0 ? (
                        <p className="empty-small">No sponsor applications yet.</p>
                    ) : (
                        <>
                            <div className="tabs">
                                {applications.map((app) => (
                                    <button
                                        key={app.id}
                                        type="button"
                                        className={selectedApplication?.id === app.id ? "active" : ""}
                                        onClick={() => setSelectedId(app.id)}
                                    >
                                        {app.business_name || "Application"}
                                    </button>
                                ))}
                            </div>
                            {selectedApplication ? (
                                <div className="monetization-summary-grid">
                                    <div><strong>{selectedApplication.status}</strong><span>Status</span></div>
                                    <div><strong>{selectedApplication.payment_status}</strong><span>Payment</span></div>
                                    <div><strong>{formatMoney(Number(selectedApplication.amount_cents) || 0, selectedApplication.currency || "USD")}</strong><span>Amount</span></div>
                                    <div><strong>{selectedApplication.requested_placement || "—"}</strong><span>Placement</span></div>
                                    {selectedApplication.rejection_reason ? (
                                        <div><strong>{selectedApplication.rejection_reason}</strong><span>Review note</span></div>
                                    ) : null}
                                </div>
                            ) : null}
                            {selectedApplication && ["approved", "payment_pending"].includes(String(selectedApplication.status)) ? (
                                <button
                                    type="button"
                                    className="save-upload"
                                    disabled={busy || checkoutLocked}
                                    onClick={() => { void startCheckout(selectedApplication.id); }}
                                >
                                    {checkoutLocked ? checkoutMessage : "Proceed to sponsor checkout (TEST)"}
                                </button>
                            ) : null}
                        </>
                    )}
                </div>
            ) : null}
        </section>
    );
}
