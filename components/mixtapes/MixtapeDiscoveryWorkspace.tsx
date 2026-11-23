"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { LoaderCircle, Play, Star } from "lucide-react";
import { authFetch } from "@/lib/client-api-auth";
import {
    filterFavoritedMixtapeDiscovery,
    filterMixtapeDiscovery,
    sortMixtapesRecent,
    type MixtapeDiscoverySection,
    uniqueMixtapeCategories,
} from "@/lib/mixtape-discovery";
import type { Mixtape, MixtapeCategory, MixtapePlaybackRequest, MixtapeTrack } from "@/lib/mixtape-types";
import { supabase } from "@/lib/supabase";
import styles from "./mixtapes.module.css";

type MixtapeDiscoveryWorkspaceProps = {
    userId: string;
    anonymousPublicListener?: boolean;
    onSignInRequired?: () => void;
    onPlayMixtape: (request: MixtapePlaybackRequest) => void | Promise<void>;
    onOpenMixtape: (mixtapeId: string) => void;
};

type CollectionResponse = {
    mixtapes?: Mixtape[];
    tracks?: MixtapeTrack[];
    categories?: MixtapeCategory[];
    error?: string;
};

const SECTIONS: Array<{ id: MixtapeDiscoverySection; label: string }> = [
    { id: "discover", label: "Discover" },
    { id: "featured", label: "Featured" },
    { id: "recent", label: "Recent" },
    { id: "favorites", label: "Favorites" },
];

function coverStyle(url: string) {
    const clean = url.trim();
    return clean ? { backgroundImage: `url(${JSON.stringify(clean)})` } : undefined;
}

export function MixtapeDiscoveryWorkspace({
    userId,
    anonymousPublicListener = false,
    onSignInRequired,
    onPlayMixtape,
    onOpenMixtape,
}: MixtapeDiscoveryWorkspaceProps) {
    const [section, setSection] = useState<MixtapeDiscoverySection>("discover");
    const [query, setQuery] = useState("");
    const [categoryId, setCategoryId] = useState("");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [mixtapes, setMixtapes] = useState<Mixtape[]>([]);
    const [tracks, setTracks] = useState<MixtapeTrack[]>([]);
    const [categories, setCategories] = useState<MixtapeCategory[]>([]);
    const [favoriteIds, setFavoriteIds] = useState<string[]>([]);

    const catalogQueryActive = Boolean(query.trim() || categoryId);

    function renderEmptyState() {
        if (catalogQueryActive) {
            return (
                <div className={styles.emptyState} data-mixtape-empty-reason="search">
                    <strong>No mixtapes match your filters</strong>
                    <p>Try another search term or category, or browse all categories.</p>
                </div>
            );
        }
        if (section === "favorites" && !userId) {
            return (
                <div className={styles.emptyState} data-mixtape-empty-reason="guest-favorites">
                    <strong>Sign in to save mixtapes</strong>
                    <p>Favorites sync across your devices once you log in. Browse Discover to hear what DJs publish.</p>
                    {onSignInRequired ? (
                        <button type="button" onClick={onSignInRequired}>
                            Log in
                        </button>
                    ) : null}
                </div>
            );
        }
        return (
            <div className={styles.emptyState} data-mixtape-empty-reason="catalog-empty">
                <strong>No published mixtapes yet</strong>
                <p>
                    Mixtapes are curated DJ sets on MDB. Approved DJs can publish from Mixtape Studio after they log in.
                </p>
                {anonymousPublicListener ? (
                    <p>Check back as founding creators add sets, or explore Music and Podcasts while the catalog grows.</p>
                ) : (
                    <p>Create a mixtape in Mixtape Studio to be first in this category.</p>
                )}
            </div>
        );
    }

    const loadCatalog = useCallback(async (signal?: AbortSignal) => {
        queueMicrotask(() => {
            setLoading(true);
            setError("");
        });
        try {
            const scope = section === "featured" ? "featured" : "public";
            const response = await fetch(`/api/mixtapes?scope=${encodeURIComponent(scope)}&limit=80`, {
                cache: "no-store",
                signal,
            });
            const body = (await response.json().catch(() => ({}))) as CollectionResponse;
            if (!response.ok) throw new Error(body.error || "Mixtapes could not be loaded.");
            setMixtapes(Array.isArray(body.mixtapes) ? body.mixtapes : []);
            setTracks(Array.isArray(body.tracks) ? body.tracks : []);
            setCategories(Array.isArray(body.categories) ? body.categories : []);
        }
        catch (loadError) {
            if (signal?.aborted) return;
            setMixtapes([]);
            setTracks([]);
            setError(loadError instanceof Error ? loadError.message : "Mixtapes could not be loaded.");
        }
        finally {
            if (!signal?.aborted) setLoading(false);
        }
    }, [section]);

    useEffect(() => {
        const controller = new AbortController();
        queueMicrotask(() => void loadCatalog(controller.signal));
        return () => controller.abort();
    }, [loadCatalog]);

    useEffect(() => {
        if (!userId || section !== "favorites") return;
        const controller = new AbortController();
        void (async () => {
            const response = await authFetch(
                supabase,
                `/api/mixtapes/favorites?userId=${encodeURIComponent(userId)}`,
                { cache: "no-store", signal: controller.signal },
            );
            const body = (await response.json().catch(() => ({}))) as { favoriteMixtapeIds?: string[] };
            if (response.ok) setFavoriteIds(body.favoriteMixtapeIds || []);
        })();
        return () => controller.abort();
    }, [section, userId]);

    const visibleMixtapes = useMemo(() => {
        const categoryChips = uniqueMixtapeCategories(mixtapes, categories);
        void categoryChips;
        if (section === "favorites") {
            return filterFavoritedMixtapeDiscovery({
                mixtapes,
                tracks,
                favoriteMixtapeIds: favoriteIds,
            }).mixtapes;
        }
        const filtered = filterMixtapeDiscovery({
            mixtapes,
            tracks,
            query,
            categoryId: categoryId || undefined,
            featuredOnly: section === "featured",
        });
        return section === "recent" ? sortMixtapesRecent(filtered.mixtapes) : filtered.mixtapes;
    }, [categoryId, categories, favoriteIds, mixtapes, query, section, tracks]);

    const playFirstTrack = async (mixtapeId: string) => {
        const mixtapeTracks = tracks
            .filter((track) => track.mixtapeId === mixtapeId)
            .sort((left, right) => left.position - right.position);
        const track = mixtapeTracks[0];
        if (!track) {
            onOpenMixtape(mixtapeId);
            return;
        }
        await onPlayMixtape({ track, context: mixtapeTracks });
    };

    const categoryChips = uniqueMixtapeCategories(mixtapes, categories);

    return (
        <section className={styles.workspace} data-mixtape-discovery>
            <header className={styles.discoveryHeader}>
                <MotionTitle title="Mixtapes" />
                <div className={styles.discoverySearch}>
                    <label className="sr-only" htmlFor="mixtape-discovery-search">Search published mixtapes</label>
                    <input
                        id="mixtape-discovery-search"
                        aria-label="Search published mixtapes"
                        placeholder="Search mixtapes, DJs, genres…"
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                    />
                </div>
            </header>

            <div className={styles.sectionTabs} role="tablist" aria-label="Mixtape discovery sections">
                {SECTIONS.map((entry) => (
                    <button
                        key={entry.id}
                        type="button"
                        role="tab"
                        aria-selected={section === entry.id}
                        className={section === entry.id ? `${styles.sectionTab} ${styles.sectionTabActive}` : styles.sectionTab}
                        onClick={() => {
                            if (entry.id === "favorites" && !userId) {
                                onSignInRequired?.();
                                return;
                            }
                            setSection(entry.id);
                        }}
                    >
                        {entry.label}
                    </button>
                ))}
            </div>

            {section === "discover" ? (
                <div className={styles.categoryChips} aria-label="Filter mixtapes by category">
                    <button
                        type="button"
                        className={!categoryId ? `${styles.categoryChip} ${styles.categoryChipActive}` : styles.categoryChip}
                        onClick={() => setCategoryId("")}
                    >
                        All categories
                    </button>
                    {categoryChips.map((category) => (
                        <button
                            key={category.id}
                            type="button"
                            className={categoryId === category.id ? `${styles.categoryChip} ${styles.categoryChipActive}` : styles.categoryChip}
                            onClick={() => setCategoryId(category.id)}
                        >
                            {category.label}
                        </button>
                    ))}
                </div>
            ) : null}

            {anonymousPublicListener && !userId ? (
                <p data-mixtape-guest-sign-in-prompt>Sign in to favorite mixtapes and sync listening progress.</p>
            ) : null}

            {loading ? (
                <p><LoaderCircle size={18} aria-hidden /> Loading mixtapes…</p>
            ) : error ? (
                <div className={styles.errorState}>{error}</div>
            ) : visibleMixtapes.length === 0 ? (
                renderEmptyState()
            ) : (
                <div className={styles.cardGrid}>
                    {visibleMixtapes.map((mixtape) => (
                        <article key={mixtape.id} className={styles.card}>
                            <button type="button" className={styles.cardCover} style={coverStyle(mixtape.coverImageUrl)} onClick={() => onOpenMixtape(mixtape.id)} aria-label={`Open ${mixtape.title}`} />
                            <h3>{mixtape.title}</h3>
                            <p>{mixtape.creatorName || "DJ"} · {mixtape.trackCount || 0} tracks</p>
                            <div className={styles.listeningMenuRow}>
                                <button type="button" onClick={() => void playFirstTrack(mixtape.id)}>
                                    <Play size={16} aria-hidden /> Play
                                </button>
                                <button type="button" onClick={() => onOpenMixtape(mixtape.id)}>Open</button>
                                {mixtape.isFeatured ? <Star size={16} aria-label="Featured" /> : null}
                            </div>
                        </article>
                    ))}
                </div>
            )}
        </section>
    );
}

function MotionTitle({ title }: { title: string }) {
    return <h2>{title}</h2>;
}