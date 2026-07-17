"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import type { Session } from "@supabase/supabase-js";
import type { RingtonePreviewRequest } from "@/components/ringtone-creator/ringtone-creator-workspace";
import { useTranslation } from "@/lib/i18n/provider";
import {
    confirmRingtonePurchase,
    downloadPurchasedRingtone,
    fetchFavoriteRingtones,
    fetchMyRingtonePurchases,
    fetchRingtoneDetail,
    fetchRingtoneMarketplace,
    formatRingtonePrice,
    purchaseRingtone,
    toggleRingtoneFavorite,
    type MarketplaceRingtone,
} from "@/lib/ringtone-marketplace-client";

type WorkspaceMode = "marketplace" | "detail" | "purchased" | "favorites";

type RingtoneMarketplaceWorkspaceProps = {
    mode: WorkspaceMode;
    userId: string;
    session: Session | null;
    isAuthenticated: boolean;
    onPreviewRingtone: (request: RingtonePreviewRequest) => void;
    onStopRingtonePreview: () => void;
    activeRingtonePreviewId: string | null;
    ringtonePreviewPlaying: boolean;
    onRequireLogin: () => void;
    initialRingtoneId?: string;
};

export function RingtoneMarketplaceWorkspace({
    mode: initialMode,
    userId,
    session,
    isAuthenticated,
    onPreviewRingtone,
    onStopRingtonePreview,
    activeRingtonePreviewId,
    ringtonePreviewPlaying,
    onRequireLogin,
    initialRingtoneId = "",
}: RingtoneMarketplaceWorkspaceProps) {
    const { t } = useTranslation();
    const [mode, setMode] = useState<WorkspaceMode>(initialMode);
    const [ringtones, setRingtones] = useState<MarketplaceRingtone[]>([]);
    const [popularCreators, setPopularCreators] = useState<Array<{ creatorId: string; creatorName: string; count: number }>>([]);
    const [purchases, setPurchases] = useState<Record<string, unknown>[]>([]);
    const [favorites, setFavorites] = useState<MarketplaceRingtone[]>([]);
    const [detail, setDetail] = useState<Record<string, unknown> | null>(null);
    const [related, setRelated] = useState<MarketplaceRingtone[]>([]);
    const [moreFromCreator, setMoreFromCreator] = useState<MarketplaceRingtone[]>([]);
    const [q, setQ] = useState("");
    const [filter, setFilter] = useState("all");
    const [sort, setSort] = useState("featured");
    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);
    const [error, setError] = useState("");
    const [statusMessage, setStatusMessage] = useState("");
    const [installGuide, setInstallGuide] = useState<{ title: string; steps: string[] } | null>(null);
    const [pending, startTransition] = useTransition();
    const purchaseLockRef = useRef(false);
    const selectedIdRef = useRef(initialRingtoneId);

    useEffect(() => {
        setMode(initialMode);
    }, [initialMode]);

    async function loadMarketplace(nextPage = page) {
        setError("");
        const result = await fetchRingtoneMarketplace({
            userId: userId || undefined,
            session,
            q,
            filter,
            sort,
            page: nextPage,
            pageSize: 24,
        });
        if (!result.ok) {
            setError(String(result.body.error || t("ringtones.marketplaceLoadFailed")));
            return;
        }
        setRingtones((result.body.ringtones || []) as MarketplaceRingtone[]);
        setPopularCreators((result.body.popularCreators || []) as Array<{ creatorId: string; creatorName: string; count: number }>);
        setTotal(Number(result.body.total) || 0);
        setPage(nextPage);
    }

    async function loadPurchases() {
        if (!isAuthenticated || !userId) {
            setPurchases([]);
            return;
        }
        const result = await fetchMyRingtonePurchases({ userId, session, q, sort: "newest", status: "paid" });
        if (!result.ok) {
            setError(String(result.body.error || t("ringtones.purchaseHistoryLoadFailed")));
            return;
        }
        setPurchases((result.body.purchases || []) as Record<string, unknown>[]);
    }

    async function loadFavorites() {
        if (!isAuthenticated || !userId) {
            setFavorites([]);
            return;
        }
        const result = await fetchFavoriteRingtones({ userId, session });
        if (!result.ok) {
            setError(String(result.body.error || t("ringtones.favoritesLoadFailed")));
            return;
        }
        setFavorites((result.body.favorites || []) as MarketplaceRingtone[]);
    }

    async function openDetail(ringtoneId: string) {
        selectedIdRef.current = ringtoneId;
        setMode("detail");
        const result = await fetchRingtoneDetail({ ringtoneId, userId: userId || undefined, session });
        if (!result.ok) {
            setError(String(result.body.error || t("ringtones.detailLoadFailed")));
            return;
        }
        setDetail((result.body.ringtone || null) as Record<string, unknown> | null);
        setRelated((result.body.relatedRingtones || []) as MarketplaceRingtone[]);
        setMoreFromCreator((result.body.moreFromCreator || []) as MarketplaceRingtone[]);
    }

    useEffect(() => {
        startTransition(async () => {
            if (mode === "marketplace") await loadMarketplace(1);
            if (mode === "purchased") await loadPurchases();
            if (mode === "favorites") await loadFavorites();
            if (mode === "detail" && (selectedIdRef.current || initialRingtoneId)) {
                await openDetail(selectedIdRef.current || initialRingtoneId);
            }
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mode, userId, session?.access_token]);

    function previewCard(ringtone: MarketplaceRingtone) {
        if (!ringtone.preview_url) {
            setError(t("ringtones.previewUnavailable"));
            return;
        }
        if (activeRingtonePreviewId === ringtone.id && ringtonePreviewPlaying) {
            onStopRingtonePreview();
            return;
        }
        onPreviewRingtone({
            id: ringtone.id,
            title: ringtone.title,
            artworkUrl: ringtone.artwork_url,
            audioUrl: ringtone.preview_url,
            clipStartSeconds: Number(ringtone.clip_start_seconds) || 0,
            clipEndSeconds: Number(ringtone.clip_end_seconds)
                || ((Number(ringtone.clip_start_seconds) || 0) + (Number(ringtone.duration_seconds) || 30)),
            durationSeconds: Number(ringtone.duration_seconds) || 30,
        });
    }

    async function handleFavorite(ringtone: MarketplaceRingtone, next: boolean) {
        if (!isAuthenticated || !userId) {
            onRequireLogin();
            return;
        }
        const previousOwned = ringtone.favorited;
        setRingtones((rows) => rows.map((row) => (row.id === ringtone.id ? { ...row, favorited: next } : row)));
        if (detail && String(detail.id) === ringtone.id) {
            setDetail({ ...detail, favorited: next });
        }
        const result = await toggleRingtoneFavorite({
            userId,
            session,
            ringtoneId: ringtone.id,
            favorite: next,
        });
        if (!result.ok) {
            setRingtones((rows) => rows.map((row) => (row.id === ringtone.id ? { ...row, favorited: previousOwned } : row)));
            if (detail && String(detail.id) === ringtone.id) {
                setDetail({ ...detail, favorited: previousOwned });
            }
            setError(String(result.body.error || t("ringtones.favoriteFailed")));
        }
    }

    async function handlePurchase(ringtoneId: string) {
        if (!isAuthenticated || !userId) {
            onRequireLogin();
            return;
        }
        if (purchaseLockRef.current || pending) return;
        purchaseLockRef.current = true;
        setError("");
        setStatusMessage(t("ringtones.paymentPending"));
        try {
            const intent = await purchaseRingtone({ ringtoneId, userId, session });
            if (!intent.ok) {
                if (String(intent.body.code || "") === "PURCHASING_UNAVAILABLE") {
                    setStatusMessage(t("ringtones.purchasingComingSoon"));
                    setError(t("ringtones.purchasingUnavailable"));
                    return;
                }
                throw new Error(String(intent.body.error || t("ringtones.purchaseFailed")));
            }
            const state = String(intent.body.state || "");
            if (state === "already_owned") {
                setStatusMessage(t("ringtones.alreadyOwned"));
                await loadMarketplace(page);
                if (mode === "detail") await openDetail(ringtoneId);
                return;
            }
            if (state === "free_acquisition_completed") {
                setStatusMessage(t("ringtones.freeAcquisitionCompleted"));
                await loadMarketplace(page);
                if (mode === "detail") await openDetail(ringtoneId);
                return;
            }

            const purchase = intent.body.purchase as { id?: string } | undefined;
            if (!purchase?.id) throw new Error(t("ringtones.purchaseFailed"));

            if (intent.body.testModeAvailable === true) {
                const confirmed = await confirmRingtonePurchase({
                    ringtoneId,
                    purchaseId: purchase.id,
                    userId,
                    session,
                    provider: "test",
                    paymentReference: `test-${purchase.id}`,
                    outcome: "paid",
                });
                if (!confirmed.ok) {
                    throw new Error(String(confirmed.body.error || t("ringtones.paymentFailed")));
                }
                const confirmState = String(confirmed.body.state || "");
                setStatusMessage(
                    confirmState === "payment_completed"
                        ? t("ringtones.paymentCompleted")
                        : confirmState === "already_owned"
                            ? t("ringtones.alreadyOwned")
                            : t("ringtones.paymentPending"),
                );
            } else {
                setStatusMessage(t("ringtones.paymentPendingProvider"));
            }
            await loadMarketplace(page);
            if (mode === "detail") await openDetail(ringtoneId);
        } catch (purchaseError) {
            setError(purchaseError instanceof Error ? purchaseError.message : t("ringtones.purchaseFailed"));
            setStatusMessage(t("ringtones.paymentFailed"));
        } finally {
            purchaseLockRef.current = false;
        }
    }

    async function handleDownload(ringtoneId: string, deviceType: "iphone" | "android") {
        if (!isAuthenticated || !userId) {
            onRequireLogin();
            return;
        }
        const result = await downloadPurchasedRingtone({
            ringtoneId,
            userId,
            session,
            deviceType,
        });
        if (!result.ok) {
            setError(String(result.body.error || t("ringtones.downloadFailed")));
            return;
        }
        const signedUrl = String(result.body.signedUrl || "");
        if (signedUrl) {
            window.open(signedUrl, "_blank", "noopener,noreferrer");
        }
        const installation = result.body.installation as { summary?: string; steps?: string[] } | undefined;
        setInstallGuide({
            title: deviceType === "iphone" ? t("ringtones.downloadForIphone") : t("ringtones.downloadForAndroid"),
            steps: installation?.steps || [],
        });
        setStatusMessage(t("ringtones.downloadStarted"));
    }

    function renderCard(ringtone: MarketplaceRingtone) {
        return (
            <article key={ringtone.id} className="dashboard-panel ringtone-market-card">
                <button type="button" className="ringtone-market-cover" onClick={() => void openDetail(ringtone.id)}>
                    <img src={ringtone.artwork_url || "/music-data-base-logo.png"} alt="" width={120} height={120} />
                </button>
                <div className="ringtone-market-body">
                    <h3>{ringtone.title}</h3>
                    <p>{ringtone.creatorName || t("ringtones.creator")}</p>
                    {ringtone.sourceSongTitle ? <p>{ringtone.sourceSongTitle}</p> : null}
                    <p>
                        {ringtone.duration_seconds}s · {formatRingtonePrice(ringtone.price_cents, ringtone.currency)}
                        {ringtone.is_explicit ? ` · ${t("ringtones.explicitBadge")}` : ""}
                    </p>
                    <div className="ringtone-market-actions">
                        <button type="button" onClick={() => previewCard(ringtone)}>
                            {activeRingtonePreviewId === ringtone.id && ringtonePreviewPlaying
                                ? t("ringtones.pausePreview")
                                : t("ringtones.preview")}
                        </button>
                        <button type="button" onClick={() => void handleFavorite(ringtone, !ringtone.favorited)}>
                            {ringtone.favorited ? t("ringtones.unfavorite") : t("ringtones.favorite")}
                        </button>
                        {ringtone.owned ? (
                            <>
                                <span className="ringtone-owned-badge">{t("ringtones.alreadyOwned")}</span>
                                <button type="button" onClick={() => void handleDownload(ringtone.id, "iphone")}>
                                    {t("ringtones.downloadForIphone")}
                                </button>
                                <button type="button" onClick={() => void handleDownload(ringtone.id, "android")}>
                                    {t("ringtones.downloadForAndroid")}
                                </button>
                            </>
                        ) : (
                            <button
                                type="button"
                                className="save-upload"
                                disabled={pending || purchaseLockRef.current}
                                onClick={() => void handlePurchase(ringtone.id)}
                            >
                                {ringtone.price_cents === 0 ? t("ringtones.getFree") : t("ringtones.buyNow")}
                            </button>
                        )}
                        <button type="button" onClick={() => void openDetail(ringtone.id)}>
                            {t("ringtones.details")}
                        </button>
                    </div>
                </div>
            </article>
        );
    }

    return (
        <section className="ringtone-marketplace-page dashboard-page" data-ringtone-marketplace={mode}>
            <header className="ringtone-market-header">
                <div>
                    <h1>
                        {mode === "purchased"
                            ? t("ringtones.myPurchasedRingtones")
                            : mode === "favorites"
                                ? t("ringtones.favoriteRingtones")
                                : mode === "detail"
                                    ? t("ringtones.details")
                                    : t("ringtones.marketplace")}
                    </h1>
                    <p>{t("ringtones.marketplaceSubtitle")}</p>
                </div>
                <div className="ringtone-market-tabs">
                    <button type="button" className={mode === "marketplace" ? "active" : ""} onClick={() => setMode("marketplace")}>
                        {t("ringtones.marketplace")}
                    </button>
                    <button type="button" className={mode === "purchased" ? "active" : ""} onClick={() => setMode("purchased")}>
                        {t("ringtones.myPurchasedRingtones")}
                    </button>
                    <button type="button" className={mode === "favorites" ? "active" : ""} onClick={() => setMode("favorites")}>
                        {t("ringtones.favoriteRingtones")}
                    </button>
                </div>
            </header>

            <div className="sr-only" aria-live="polite">{statusMessage}</div>
            {error ? <p className="ringtone-error" role="alert">{error}</p> : null}

            {mode === "marketplace" ? (
                <>
                    <div className="ringtone-market-controls">
                        <label>
                            <span className="sr-only">{t("ringtones.search")}</span>
                            <input
                                value={q}
                                onChange={(event) => setQ(event.target.value)}
                                placeholder={t("ringtones.marketplaceSearchPlaceholder")}
                            />
                        </label>
                        <label>
                            <span>{t("ringtones.filter")}</span>
                            <select value={filter} onChange={(event) => setFilter(event.target.value)}>
                                <option value="all">{t("ringtones.filterAll")}</option>
                                <option value="featured">{t("ringtones.featuredRingtones")}</option>
                                <option value="free">{t("ringtones.freeRingtones")}</option>
                                <option value="paid">{t("ringtones.paidRingtones")}</option>
                                <option value="explicit">{t("ringtones.explicitBadge")}</option>
                                <option value="clean">{t("ringtones.cleanBadge")}</option>
                                <option value="recent">{t("ringtones.recentlyAdded")}</option>
                            </select>
                        </label>
                        <label>
                            <span>{t("ringtones.sort")}</span>
                            <select value={sort} onChange={(event) => setSort(event.target.value)}>
                                <option value="featured">{t("ringtones.sortFeatured")}</option>
                                <option value="newest">{t("ringtones.sortNewest")}</option>
                                <option value="most_purchased">{t("ringtones.sortMostPurchased")}</option>
                                <option value="most_downloaded">{t("ringtones.sortMostDownloaded")}</option>
                                <option value="most_favorited">{t("ringtones.sortMostFavorited")}</option>
                                <option value="price_asc">{t("ringtones.sortPriceLow")}</option>
                                <option value="price_desc">{t("ringtones.sortPriceHigh")}</option>
                                <option value="title">{t("ringtones.sortTitle")}</option>
                            </select>
                        </label>
                        <button type="button" className="save-upload" onClick={() => void loadMarketplace(1)}>
                            {t("ringtones.applyFilters")}
                        </button>
                    </div>

                    <div className="ringtone-section-links" aria-label={t("ringtones.marketplace")}>
                        <button type="button" onClick={() => { setFilter("featured"); void loadMarketplace(1); }}>{t("ringtones.featuredRingtones")}</button>
                        <button type="button" onClick={() => { setSort("most_purchased"); void loadMarketplace(1); }}>{t("ringtones.trendingRingtones")}</button>
                        <button type="button" onClick={() => { setSort("newest"); void loadMarketplace(1); }}>{t("ringtones.newRingtones")}</button>
                        <button type="button" onClick={() => { setFilter("free"); void loadMarketplace(1); }}>{t("ringtones.freeRingtones")}</button>
                    </div>

                    {popularCreators.length > 0 ? (
                        <div className="dashboard-panel">
                            <h2>{t("ringtones.popularCreators")}</h2>
                            <div className="ringtone-creator-chips">
                                {popularCreators.map((creator) => (
                                    <button
                                        key={creator.creatorId}
                                        type="button"
                                        onClick={() => {
                                            startTransition(async () => {
                                                const result = await fetchRingtoneMarketplace({
                                                    userId,
                                                    session,
                                                    creatorId: creator.creatorId,
                                                    page: 1,
                                                    pageSize: 24,
                                                });
                                                if (result.ok) {
                                                    setRingtones((result.body.ringtones || []) as MarketplaceRingtone[]);
                                                    setTotal(Number(result.body.total) || 0);
                                                }
                                            });
                                        }}
                                    >
                                        {creator.creatorName}
                                    </button>
                                ))}
                            </div>
                        </div>
                    ) : null}

                    <div className="ringtone-market-grid">
                        {ringtones.map((ringtone) => renderCard(ringtone))}
                    </div>
                    {!pending && ringtones.length === 0 ? <p className="dashboard-empty-card">{t("ringtones.marketplaceEmpty")}</p> : null}
                    <div className="ringtone-pagination">
                        <button type="button" disabled={page <= 1} onClick={() => void loadMarketplace(page - 1)}>
                            {t("ringtones.back")}
                        </button>
                        <span>{page} / {Math.max(1, Math.ceil(total / 24))}</span>
                        <button type="button" disabled={page * 24 >= total} onClick={() => void loadMarketplace(page + 1)}>
                            {t("ringtones.next")}
                        </button>
                    </div>
                </>
            ) : null}

            {mode === "detail" && detail ? (
                <div className="dashboard-panel ringtone-detail">
                    <button type="button" onClick={() => setMode("marketplace")}>{t("ringtones.back")}</button>
                    <div className="ringtone-detail-grid">
                        <img src={String(detail.artwork_url || "/music-data-base-logo.png")} alt="" width={220} height={220} />
                        <div>
                            <h2>{String(detail.title || "")}</h2>
                            <p>{String(detail.creatorName || t("ringtones.creator"))}</p>
                            {detail.sourceSong ? (
                                <p>{t("ringtones.existingSong")}: {String((detail.sourceSong as { title?: string }).title || "")}</p>
                            ) : null}
                            <p>{String(detail.description || "")}</p>
                            <p>
                                {Number(detail.duration_seconds) || 0}s · {formatRingtonePrice(Number(detail.price_cents) || 0, String(detail.currency || "USD"))}
                                {detail.is_explicit ? ` · ${t("ringtones.explicitBadge")}` : ""}
                            </p>
                            {detail.reviewSummary ? (
                                <p>
                                    {t("ringtones.reviewSummary")}: {String((detail.reviewSummary as { averageRating?: number | null }).averageRating ?? "—")}
                                    {" "}({Number((detail.reviewSummary as { count?: number }).count) || 0})
                                </p>
                            ) : null}
                            <div className="ringtone-market-actions">
                                <button type="button" onClick={() => previewCard(detail as unknown as MarketplaceRingtone)}>
                                    {t("ringtones.previewRingtone")}
                                </button>
                                <button type="button" onClick={() => void handleFavorite(detail as unknown as MarketplaceRingtone, !detail.favorited)}>
                                    {detail.favorited ? t("ringtones.unfavorite") : t("ringtones.favorite")}
                                </button>
                                {detail.owned ? (
                                    <>
                                        <span className="ringtone-owned-badge">{t("ringtones.alreadyOwned")}</span>
                                        <button type="button" onClick={() => void handleDownload(String(detail.id), "iphone")}>
                                            {t("ringtones.downloadForIphone")}
                                        </button>
                                        <button type="button" onClick={() => void handleDownload(String(detail.id), "android")}>
                                            {t("ringtones.downloadForAndroid")}
                                        </button>
                                    </>
                                ) : (
                                    <button type="button" className="save-upload" onClick={() => void handlePurchase(String(detail.id))}>
                                        {Number(detail.price_cents) === 0 ? t("ringtones.getFree") : t("ringtones.purchaseRingtone")}
                                    </button>
                                )}
                            </div>
                            <div className="ringtone-install-copy">
                                <h3>{t("ringtones.installationInstructions")}</h3>
                                <p>{t("ringtones.iphoneInstallHint")}</p>
                                <p>{t("ringtones.androidInstallHint")}</p>
                            </div>
                        </div>
                    </div>
                    <section>
                        <h3>{t("ringtones.relatedRingtones")}</h3>
                        <div className="ringtone-market-grid">{related.map((ringtone) => renderCard(ringtone))}</div>
                    </section>
                    <section>
                        <h3>{t("ringtones.moreFromCreator")}</h3>
                        <div className="ringtone-market-grid">{moreFromCreator.map((ringtone) => renderCard(ringtone))}</div>
                    </section>
                </div>
            ) : null}

            {mode === "purchased" ? (
                <div className="ringtone-purchased-list">
                    {!isAuthenticated ? <p role="alert">{t("ringtones.loginToViewPurchases")}</p> : null}
                    {purchases.map((purchase) => {
                        const ringtone = (purchase.ringtone || {}) as MarketplaceRingtone;
                        return (
                            <article key={String(purchase.id)} className="dashboard-panel ringtone-market-card">
                                <img src={ringtone.artwork_url || "/music-data-base-logo.png"} alt="" width={88} height={88} />
                                <div className="ringtone-market-body">
                                    <h3>{ringtone.title || t("ringtones.title")}</h3>
                                    <p>
                                        {formatRingtonePrice(Number(purchase.amount_cents) || 0, String(purchase.currency || "USD"))}
                                        {" · "}
                                        {purchase.purchased_at ? new Date(String(purchase.purchased_at)).toLocaleString() : ""}
                                    </p>
                                    <p>{t("ringtones.receipt")}: {String(purchase.payment_reference || purchase.id)}</p>
                                    <p>{t("ringtones.downloadAgain")}: {Number(purchase.downloadCount) || 0}</p>
                                    <div className="ringtone-market-actions">
                                        <button type="button" onClick={() => void handleDownload(String(purchase.ringtone_id), "iphone")}>
                                            {t("ringtones.downloadForIphone")}
                                        </button>
                                        <button type="button" onClick={() => void handleDownload(String(purchase.ringtone_id), "android")}>
                                            {t("ringtones.downloadForAndroid")}
                                        </button>
                                        <button type="button" onClick={() => void openDetail(String(purchase.ringtone_id))}>
                                            {t("ringtones.installationInstructions")}
                                        </button>
                                    </div>
                                </div>
                            </article>
                        );
                    })}
                    {isAuthenticated && purchases.length === 0 ? <p className="dashboard-empty-card">{t("ringtones.purchasedEmpty")}</p> : null}
                </div>
            ) : null}

            {mode === "favorites" ? (
                <div className="ringtone-market-grid">
                    {!isAuthenticated ? <p role="alert">{t("ringtones.loginToFavorite")}</p> : null}
                    {favorites.map((ringtone) => renderCard(ringtone))}
                    {isAuthenticated && favorites.length === 0 ? <p className="dashboard-empty-card">{t("ringtones.favoritesEmpty")}</p> : null}
                </div>
            ) : null}

            {installGuide ? (
                <div className="dashboard-panel ringtone-install-guide" role="dialog" aria-label={installGuide.title}>
                    <h3>{installGuide.title}</h3>
                    <ol>
                        {installGuide.steps.map((step) => <li key={step}>{step}</li>)}
                    </ol>
                    <button type="button" onClick={() => setInstallGuide(null)}>{t("ringtones.cancel")}</button>
                </div>
            ) : null}

            <style jsx>{`
                .ringtone-marketplace-page {
                    display: grid;
                    gap: 16px;
                    padding-bottom: calc(var(--mobile-player-reserve, 110px) + 28px);
                }
                .ringtone-market-header,
                .ringtone-market-tabs,
                .ringtone-market-controls,
                .ringtone-market-actions,
                .ringtone-section-links,
                .ringtone-pagination,
                .ringtone-creator-chips {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 10px;
                    align-items: center;
                }
                .ringtone-market-header { justify-content: space-between; }
                .ringtone-market-grid,
                .ringtone-purchased-list {
                    display: grid;
                    gap: 12px;
                    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
                }
                .ringtone-market-card {
                    display: grid;
                    grid-template-columns: 120px 1fr;
                    gap: 12px;
                    align-items: start;
                }
                .ringtone-market-cover,
                .ringtone-market-tabs button,
                .ringtone-market-actions button,
                .ringtone-section-links button,
                .ringtone-creator-chips button,
                .ringtone-pagination button {
                    min-height: 44px;
                    min-width: 44px;
                    border-radius: 8px;
                    border: 1px solid rgba(0, 212, 255, 0.28);
                    background: #0b1736;
                    color: #e8f7ff;
                    cursor: pointer;
                }
                .ringtone-market-tabs button.active { background: #22d3ee; color: #062033; font-weight: 800; }
                .ringtone-market-controls label { display: grid; gap: 6px; min-width: 160px; flex: 1; }
                .ringtone-market-controls input,
                .ringtone-market-controls select {
                    min-height: 44px;
                    border-radius: 8px;
                    border: 1px solid rgba(0, 212, 255, 0.28);
                    background: #08122b;
                    color: #e8f7ff;
                    padding: 0.65rem 0.8rem;
                    width: 100%;
                }
                .ringtone-detail-grid {
                    display: grid;
                    grid-template-columns: 220px 1fr;
                    gap: 18px;
                    align-items: start;
                }
                .ringtone-owned-badge {
                    color: #67e8f9;
                    font-weight: 700;
                }
                .ringtone-error { color: #fecaca; }
                .sr-only {
                    position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
                    overflow: hidden; clip: rect(0, 0, 0, 0); border: 0;
                }
                @media (max-width: 820px) {
                    .ringtone-market-card,
                    .ringtone-detail-grid { grid-template-columns: 1fr; }
                }
            `}</style>
        </section>
    );
}
