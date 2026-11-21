"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { ArrowLeft, Heart, LoaderCircle, Play } from "lucide-react";
import { authFetch } from "@/lib/client-api-auth";
import type { Mixtape, MixtapePlaybackRequest, MixtapeTrack } from "@/lib/mixtape-types";
import { supabase } from "@/lib/supabase";
import styles from "./mixtapes.module.css";

type MixtapeShowWorkspaceProps = {
    userId: string;
    mixtapeId: string;
    onPlayMixtape: (request: MixtapePlaybackRequest) => void | Promise<void>;
    onBackToDiscovery: () => void;
};

type DetailResponse = {
    mixtape?: Mixtape;
    tracks?: MixtapeTrack[];
    error?: string;
};

export function MixtapeShowWorkspace({
    userId,
    mixtapeId,
    onPlayMixtape,
    onBackToDiscovery,
}: MixtapeShowWorkspaceProps) {
    const [mixtape, setMixtape] = useState<Mixtape | null>(null);
    const [tracks, setTracks] = useState<MixtapeTrack[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [favorited, setFavorited] = useState(false);

    const loadDetail = useCallback(async (signal?: AbortSignal) => {
        queueMicrotask(() => {
            setLoading(true);
            setError("");
        });
        try {
            const response = await fetch(`/api/mixtapes/${encodeURIComponent(mixtapeId)}`, {
                cache: "no-store",
                signal,
            });
            const body = (await response.json().catch(() => ({}))) as DetailResponse;
            if (!response.ok || !body.mixtape) throw new Error(body.error || "Mixtape could not be loaded.");
            setMixtape(body.mixtape);
            setTracks(Array.isArray(body.tracks) ? body.tracks : []);
        }
        catch (loadError) {
            if (signal?.aborted) return;
            setMixtape(null);
            setTracks([]);
            setError(loadError instanceof Error ? loadError.message : "Mixtape could not be loaded.");
        }
        finally {
            if (!signal?.aborted) setLoading(false);
        }
    }, [mixtapeId]);

    useEffect(() => {
        const controller = new AbortController();
        queueMicrotask(() => void loadDetail(controller.signal));
        return () => controller.abort();
    }, [loadDetail]);

    useEffect(() => {
        if (!userId) return;
        const controller = new AbortController();
        void (async () => {
            const response = await authFetch(
                supabase,
                `/api/mixtapes/favorites?userId=${encodeURIComponent(userId)}`,
                { cache: "no-store", signal: controller.signal },
            );
            const body = (await response.json().catch(() => ({}))) as { favoriteMixtapeIds?: string[] };
            if (response.ok) setFavorited((body.favoriteMixtapeIds || []).includes(mixtapeId));
        })();
        return () => controller.abort();
    }, [mixtapeId, userId]);

    const playTrack = async (track: MixtapeTrack) => {
        await onPlayMixtape({ track, context: tracks });
    };

    const toggleFavorite = async () => {
        if (!userId) return;
        const response = await authFetch(supabase, "/api/mixtapes/favorites", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId, mixtapeId, favorite: !favorited }),
        });
        const body = (await response.json().catch(() => ({}))) as { favorited?: boolean };
        if (response.ok) setFavorited(Boolean(body.favorited ?? !favorited));
    };

    return (
        <section className={styles.workspace} data-mixtape-show>
            <button type="button" onClick={onBackToDiscovery}><ArrowLeft size={16} aria-hidden /> Back</button>
            {loading ? <p><LoaderCircle size={18} aria-hidden /> Loading…</p> : null}
            {error ? <div className={styles.errorState}>{error}</div> : null}
            {mixtape ? (
                <>
                    <header className={styles.discoveryHeader}>
                        <div>
                            <h2>{mixtape.title}</h2>
                            <p>{mixtape.creatorName || "DJ"} · {mixtape.genre || mixtape.categoryLabel || "Mixtape"}</p>
                        </div>
                        {userId ? (
                            <button type="button" onClick={() => void toggleFavorite()}>
                                <Heart size={16} aria-hidden /> {favorited ? "Favorited" : "Favorite"}
                            </button>
                        ) : null}
                    </header>
                    <p>{mixtape.description}</p>
                    <div className={styles.trackList}>
                        {tracks.map((track) => (
                            <MotionTrack
                                key={track.id}
                                track={track}
                                onPlay={playTrack}
                                onReport={userId
                                    ? () => authFetch(supabase, "/api/mixtapes/reports", {
                                        method: "POST",
                                        headers: { "Content-Type": "application/json" },
                                        body: JSON.stringify({
                                            userId,
                                            mixtapeId: mixtape.id,
                                            reasonCode: "other",
                                            details: `Reported track ${track.title}`,
                                        }),
                                    })
                                    : undefined}
                            />
                        ))}
                    </div>
                </>
            ) : null}
        </section>
    );
}

function MotionTrack({
    track,
    onPlay,
    onReport,
}: {
    track: MixtapeTrack;
    onPlay: (track: MixtapeTrack) => void | Promise<void>;
    onReport?: () => void;
}) {
    return (
        <MotionDiv className={styles.trackRow}>
            <span>{track.position}.</span>
            <div style={{ flex: 1 }}>
                <strong>{track.title}</strong>
            </div>
            <button type="button" onClick={() => void onPlay(track)}><Play size={16} aria-hidden /> Play</button>
            {onReport ? <button type="button" onClick={onReport}>Report</button> : null}
        </MotionDiv>
    );
}

function MotionDiv({ className, children }: { className: string; children: ReactNode }) {
    return <div className={className}>{children}</div>;
}