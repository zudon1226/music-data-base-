"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { PublicBetaCommerceLockNotice } from "@/components/public-beta/public-beta-commerce-lock-notice";
import type {
    ListenerLicenseLine,
    ListenerPurchaseLine,
    ListenerReceiptLine,
    ListenerVaultDownload,
} from "@/lib/listener-purchases-service";
import { isPublicBetaCommerceLocked } from "@/lib/public-beta-commerce-lock";
import { useTranslation } from "@/lib/i18n/provider";
import styles from "./listener-purchases-panel.module.css";

type FetchFn = (path: string, init?: RequestInit) => Promise<Response>;

type ListenerPurchasesPanelProps = {
    userId: string;
    isAuthenticated: boolean;
    fetchFn: FetchFn;
    onRequireLogin: () => void;
};

type VaultTab = "history" | "receipts" | "downloads" | "licenses" | "access";

type ApiPayload = {
    ok?: boolean;
    error?: string;
    emptyMessage?: string;
    commerceLocked?: boolean;
    purchases?: ListenerPurchaseLine[];
    receipts?: ListenerReceiptLine[];
    downloads?: ListenerVaultDownload[];
    licenses?: ListenerLicenseLine[];
    digitalAccess?: ListenerVaultDownload[];
};

function formatMoney(cents: number, currency: string, locale: string) {
    const amount = Math.max(0, Math.round(Number(cents) || 0)) / 100;
    try {
        return new Intl.NumberFormat(locale || "en", { style: "currency", currency: currency || "USD" }).format(amount);
    } catch {
        return `$${amount.toFixed(2)}`;
    }
}

function formatDate(value: string, locale: string) {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    try {
        return new Intl.DateTimeFormat(locale || "en", { dateStyle: "medium", timeStyle: "short" }).format(date);
    } catch {
        return date.toLocaleString();
    }
}

function categoryLabel(
    category: ListenerPurchaseLine["category"],
    t: (key: import("@/lib/i18n/messages/en").TranslationKey) => string,
) {
    if (category === "album") return t("listenerPurchases.categoryAlbum");
    if (category === "beat") return t("listenerPurchases.categoryBeat");
    if (category === "ringtone") return t("listenerPurchases.categoryRingtone");
    return t("listenerPurchases.categorySong");
}

function statusBadgeClass(status: string) {
    const normalized = String(status || "").toLowerCase();
    if (normalized === "completed" || normalized === "paid") return styles.badge;
    if (normalized === "refunded") return `${styles.badge} ${styles.badgeGold}`;
    return `${styles.badge} ${styles.badgeMuted}`;
}

export function ListenerPurchasesPanel({
    userId,
    isAuthenticated,
    fetchFn,
    onRequireLogin,
}: ListenerPurchasesPanelProps) {
    const [tab, setTab] = useState<VaultTab>("history");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const { t, locale } = useTranslation();
    const defaultEmptyMessage = t("listenerPurchases.emptyMessage");
    const [emptyMessage, setEmptyMessage] = useState(defaultEmptyMessage);
    const [purchases, setPurchases] = useState<ListenerPurchaseLine[]>([]);
    const [receipts, setReceipts] = useState<ListenerReceiptLine[]>([]);
    const [downloads, setDownloads] = useState<ListenerVaultDownload[]>([]);
    const [licenses, setLicenses] = useState<ListenerLicenseLine[]>([]);
    const [digitalAccess, setDigitalAccess] = useState<ListenerVaultDownload[]>([]);

    const commerceLocked = isPublicBetaCommerceLocked();
    const [, startTransition] = useTransition();

    const load = useCallback(async () => {
        if (!userId || !isAuthenticated) {
            setLoading(false);
            setPurchases([]);
            setReceipts([]);
            setDownloads([]);
            setLicenses([]);
            setDigitalAccess([]);
            return;
        }
        setLoading(true);
        setError("");
        try {
            const response = await fetchFn(`/api/listener/purchases?userId=${encodeURIComponent(userId)}`, {
                method: "GET",
                requireAuth: true,
            } as RequestInit & { requireAuth?: boolean });
            const payload = (await response.json()) as ApiPayload;
            if (!response.ok) {
                setError(String(payload.error || "Unable to load purchase history."));
                setPurchases([]);
                setReceipts([]);
                setDownloads([]);
                setLicenses([]);
                setDigitalAccess([]);
                return;
            }
            setEmptyMessage(String(payload.emptyMessage || defaultEmptyMessage));
            setPurchases(Array.isArray(payload.purchases) ? payload.purchases : []);
            setReceipts(Array.isArray(payload.receipts) ? payload.receipts : []);
            setDownloads(Array.isArray(payload.downloads) ? payload.downloads : []);
            setLicenses(Array.isArray(payload.licenses) ? payload.licenses : []);
            setDigitalAccess(Array.isArray(payload.digitalAccess) ? payload.digitalAccess : []);
        } catch (loadError) {
            setError(loadError instanceof Error ? loadError.message : "Unable to load purchase history.");
        } finally {
            setLoading(false);
        }
    }, [defaultEmptyMessage, fetchFn, isAuthenticated, userId]);

    useEffect(() => {
        startTransition(async () => {
            await load();
        });
    }, [load]);

    const totals = useMemo(() => {
        const completed = purchases.filter((row) => {
            const status = String(row.paymentStatus || "").toLowerCase();
            return status === "completed" || status === "paid";
        });
        const spendCents = completed.reduce((sum, row) => sum + row.priceCents, 0);
        return {
            orderCount: purchases.length,
            receiptCount: receipts.length,
            downloadCount: downloads.length,
            licenseCount: licenses.length,
            spendCents,
            currency: completed[0]?.currency || "USD",
        };
    }, [downloads.length, licenses.length, purchases, receipts.length]);

    const tabs: Array<{ id: VaultTab; label: string; count: number }> = [
        { id: "history", label: t("listenerPurchases.tabHistory"), count: purchases.length },
        { id: "receipts", label: t("listenerPurchases.tabReceipts"), count: receipts.length },
        { id: "downloads", label: t("listenerPurchases.tabDownloads"), count: downloads.length },
        { id: "licenses", label: t("listenerPurchases.tabLicenses"), count: licenses.length },
        { id: "access", label: t("listenerPurchases.tabAccess"), count: digitalAccess.length },
    ];

    const showGlobalEmpty = !loading
        && !error
        && purchases.length === 0
        && receipts.length === 0
        && downloads.length === 0
        && licenses.length === 0;

    if (!isAuthenticated) {
        return (
            <section className={styles.root} aria-label={t("listenerPurchases.title")}>
                <div className={styles.empty}>
                    <h2>{t("listenerPurchases.signInTitle")}</h2>
                    <p>{t("listenerPurchases.signInBody")}</p>
                    <button className={styles.tab} onClick={onRequireLogin} type="button">
                        {t("listenerPurchases.signInAction")}
                    </button>
                </div>
            </section>
        );
    }

    return (
        <section className={styles.root} aria-label={t("listenerPurchases.title")}>
            <header className={styles.hero}>
                <div>
                    <span className="section-kicker">{t("listenerPurchases.kicker")}</span>
                    <p className={`destination-hero-lead ${styles.heroLead}`}>{t("listenerPurchases.subtitle")}</p>
                    <p className={styles.heroLead}>{t("listenerPurchases.description")}</p>
                    {commerceLocked ? (
                        <div className={styles.lockWrap}>
                            <PublicBetaCommerceLockNotice />
                        </div>
                    ) : null}
                </div>
                <div className={styles.stats} aria-label={t("listenerPurchases.statsLabel")}>
                    <span><strong>{totals.orderCount}</strong>{t("listenerPurchases.statOrders")}</span>
                    <span><strong>{totals.receiptCount}</strong>{t("listenerPurchases.statReceipts")}</span>
                    <span><strong>{totals.licenseCount}</strong>{t("listenerPurchases.statLicenses")}</span>
                    <span><strong>{formatMoney(totals.spendCents, totals.currency, locale)}</strong>{t("listenerPurchases.statSpend")}</span>
                </div>
            </header>

            <div className={styles.tabs} role="tablist" aria-label={t("listenerPurchases.tabsLabel")}>
                {tabs.map((entry) => (
                    <button
                        key={entry.id}
                        type="button"
                        role="tab"
                        aria-selected={tab === entry.id}
                        className={`${styles.tab} ${tab === entry.id ? styles.tabActive : ""}`}
                        onClick={() => setTab(entry.id)}
                    >
                        {entry.label} ({entry.count})
                    </button>
                ))}
            </div>

            {loading ? <p className={styles.meta}>{t("listenerPurchases.loading")}</p> : null}
            {error ? <p className={styles.error} role="alert">{error}</p> : null}

            {showGlobalEmpty ? (
                <div className={styles.empty}>
                    <h2>{t("listenerPurchases.emptyTitle")}</h2>
                    <p>{emptyMessage}</p>
                </div>
            ) : null}

            {!loading && !error && tab === "history" ? (
                <div className={styles.section} role="tabpanel">
                    <h2 className={styles.sectionTitle}>{t("listenerPurchases.tabHistory")}</h2>
                    {purchases.length === 0 ? (
                        <p className={styles.meta}>{emptyMessage}</p>
                    ) : (
                        <div className={styles.cardList}>
                            {purchases.map((row) => (
                                <article className={styles.card} key={`purchase-${row.id}`}>
                                    {row.coverUrl ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img className={styles.cover} src={row.coverUrl} alt="" />
                                    ) : (
                                        <div className={styles.coverPlaceholder}>{categoryLabel(row.category, t).slice(0, 3)}</div>
                                    )}
                                    <div className={styles.cardBody}>
                                        <p className={styles.cardTitle}>{row.title}</p>
                                        <p className={styles.meta}>
                                            {t("listenerPurchases.order")}: {row.orderNumber}
                                            {" · "}
                                            {formatDate(row.purchasedAt, locale)}
                                        </p>
                                        {row.creatorName ? <p className={styles.meta}>{row.creatorName}</p> : null}
                                        <div className={styles.badgeRow}>
                                            <span className={`${styles.badge} ${styles.badgeGold}`}>{categoryLabel(row.category, t)}</span>
                                            <span className={statusBadgeClass(row.paymentStatus)}>{row.paymentStatus}</span>
                                            <span className={`${styles.badge} ${styles.badgeMuted}`}>{row.refundStatus}</span>
                                            <span className={styles.badge}>{formatMoney(row.priceCents, row.currency, locale)}</span>
                                        </div>
                                    </div>
                                </article>
                            ))}
                        </div>
                    )}
                </div>
            ) : null}

            {!loading && !error && tab === "receipts" ? (
                <div className={styles.section} role="tabpanel">
                    <h2 className={styles.sectionTitle}>{t("listenerPurchases.tabReceipts")}</h2>
                    {receipts.length === 0 ? (
                        <p className={styles.meta}>{t("listenerPurchases.noReceipts")}</p>
                    ) : (
                        <div className={styles.cardList}>
                            {receipts.map((row) => (
                                <article className={styles.card} key={`receipt-${row.id}`}>
                                    <div className={styles.coverPlaceholder}>RCPT</div>
                                    <div className={styles.cardBody}>
                                        <p className={styles.cardTitle}>{row.label}</p>
                                        <p className={styles.meta}>
                                            {t("listenerPurchases.order")}: {row.orderNumber}
                                            {" · "}
                                            {formatDate(row.confirmedAt, locale)}
                                        </p>
                                        <div className={styles.badgeRow}>
                                            <span className={statusBadgeClass(row.paymentStatus)}>{row.paymentStatus}</span>
                                            <span className={`${styles.badge} ${styles.badgeMuted}`}>{row.paymentProvider}</span>
                                            <span className={styles.badge}>{formatMoney(row.totalCents, row.currency, locale)}</span>
                                        </div>
                                    </div>
                                </article>
                            ))}
                        </div>
                    )}
                </div>
            ) : null}

            {!loading && !error && tab === "downloads" ? (
                <div className={styles.section} role="tabpanel">
                    <h2 className={styles.sectionTitle}>{t("listenerPurchases.tabDownloads")}</h2>
                    {downloads.length === 0 ? (
                        <p className={styles.meta}>{t("listenerPurchases.noDownloads")}</p>
                    ) : (
                        <div className={styles.cardList}>
                            {downloads.map((row) => (
                                <article className={styles.card} key={`download-${row.source}-${row.id}`}>
                                    {row.coverUrl ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img className={styles.cover} src={row.coverUrl} alt="" />
                                    ) : (
                                        <div className={styles.coverPlaceholder}>DL</div>
                                    )}
                                    <div className={styles.cardBody}>
                                        <p className={styles.cardTitle}>{row.title}</p>
                                        <p className={styles.meta}>
                                            {row.filename || row.contentId}
                                            {" · "}
                                            {formatDate(row.addedAt, locale)}
                                        </p>
                                        <div className={styles.badgeRow}>
                                            <span className={`${styles.badge} ${styles.badgeGold}`}>{row.itemType || row.contentType}</span>
                                            {row.licenseType ? <span className={styles.badge}>{row.licenseType}</span> : null}
                                        </div>
                                    </div>
                                </article>
                            ))}
                        </div>
                    )}
                </div>
            ) : null}

            {!loading && !error && tab === "licenses" ? (
                <div className={styles.section} role="tabpanel">
                    <h2 className={styles.sectionTitle}>{t("listenerPurchases.tabLicenses")}</h2>
                    {licenses.length === 0 ? (
                        <p className={styles.meta}>{t("listenerPurchases.noLicenses")}</p>
                    ) : (
                        <div className={styles.cardList}>
                            {licenses.map((row) => (
                                <article className={styles.card} key={`license-${row.id}`}>
                                    <div className={styles.coverPlaceholder}>LIC</div>
                                    <div className={styles.cardBody}>
                                        <p className={styles.cardTitle}>{row.beatTitle}</p>
                                        <p className={styles.meta}>
                                            {row.producerName}
                                            {" · "}
                                            {formatDate(row.issuedAt, locale)}
                                        </p>
                                        <div className={styles.badgeRow}>
                                            <span className={`${styles.badge} ${styles.badgeGold}`}>{row.licenseType}</span>
                                            <span className={styles.badge}>{formatMoney(row.priceCents, row.currency, locale)}</span>
                                            <span className={`${styles.badge} ${styles.badgeMuted}`}>{row.pdfFileName}</span>
                                        </div>
                                    </div>
                                </article>
                            ))}
                        </div>
                    )}
                </div>
            ) : null}

            {!loading && !error && tab === "access" ? (
                <div className={styles.section} role="tabpanel">
                    <h2 className={styles.sectionTitle}>{t("listenerPurchases.tabAccess")}</h2>
                    {digitalAccess.length === 0 ? (
                        <p className={styles.meta}>{t("listenerPurchases.noAccess")}</p>
                    ) : (
                        <div className={styles.cardList}>
                            {digitalAccess.map((row) => (
                                <article className={styles.card} key={`access-${row.source}-${row.id}`}>
                                    <div className={styles.coverPlaceholder}>KEY</div>
                                    <div className={styles.cardBody}>
                                        <p className={styles.cardTitle}>{row.title}</p>
                                        <p className={styles.meta}>{row.accessLabel}</p>
                                        <div className={styles.badgeRow}>
                                            <span className={styles.badge}>{row.contentType || row.itemType}</span>
                                            <span className={`${styles.badge} ${styles.badgeMuted}`}>{formatDate(row.addedAt, locale)}</span>
                                        </div>
                                    </div>
                                </article>
                            ))}
                        </div>
                    )}
                </div>
            ) : null}
        </section>
    );
}
