"use client";

import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import {
    PODCAST_PLAYBACK_RATES,
    podcastPlaybackRateLabel,
    type PodcastPlaybackRate,
} from "@/lib/podcast-playback-controls";
import styles from "./mixtapes.module.css";

type MixtapeListeningControlsProps = {
    variant: "desktop" | "mobile";
    playbackRate: PodcastPlaybackRate;
    onSkipBack: () => void;
    onSkipForward: () => void;
    onPlaybackRateChange: (rate: PodcastPlaybackRate) => void;
};

export function MixtapeListeningControls({
    variant,
    playbackRate,
    onSkipBack,
    onSkipForward,
    onPlaybackRateChange,
}: MixtapeListeningControlsProps) {
    const menuId = useId();
    const [open, setOpen] = useState(false);
    const [menuStyle, setMenuStyle] = useState<CSSProperties>({});
    const triggerRef = useRef<HTMLButtonElement | null>(null);
    const menuRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (!open) return;
        const trigger = triggerRef.current;
        const place = () => {
            if (!trigger) return;
            const rect = trigger.getBoundingClientRect();
            const width = Math.min(240, Math.max(180, window.innerWidth - 16));
            const left = Math.min(Math.max(8, rect.right - width), window.innerWidth - width - 8);
            setMenuStyle({
                position: "fixed",
                left,
                width,
                bottom: Math.max(8, window.innerHeight - rect.top + 8),
                zIndex: 80,
            });
        };
        place();
        const onPointer = (event: MouseEvent) => {
            const target = event.target as Node | null;
            if (trigger?.contains(target) || menuRef.current?.contains(target)) return;
            setOpen(false);
        };
        window.addEventListener("resize", place);
        window.addEventListener("mousedown", onPointer);
        return () => {
            window.removeEventListener("resize", place);
            window.removeEventListener("mousedown", onPointer);
        };
    }, [open]);

    const menu = open && typeof document !== "undefined"
        ? createPortal(
            <div
                ref={menuRef}
                className={styles.listeningMenu}
                id={menuId}
                role="dialog"
                aria-label="Mixtape listening controls"
                style={menuStyle}
            >
                <MotionRow onSkipBack={onSkipBack} onSkipForward={onSkipForward} />
                <div className={styles.listeningMenuRow}>
                    {PODCAST_PLAYBACK_RATES.map((rate) => (
                        <button
                            key={rate}
                            type="button"
                            aria-pressed={playbackRate === rate}
                            onClick={() => {
                                onPlaybackRateChange(rate);
                                setOpen(false);
                            }}
                        >
                            {podcastPlaybackRateLabel(rate)}
                        </button>
                    ))}
                </div>
            </div>,
            document.body,
        )
        : null;

    return (
        <div className={styles.listeningControls}>
            <button
                ref={triggerRef}
                type="button"
                aria-expanded={open}
                aria-controls={menuId}
                onClick={() => setOpen((value) => !value)}
            >
                {variant === "mobile" ? "Listen" : `Speed ${podcastPlaybackRateLabel(playbackRate)}`}
            </button>
            {menu}
        </div>
    );
}

function MotionRow({
    onSkipBack,
    onSkipForward,
}: {
    onSkipBack: () => void;
    onSkipForward: () => void;
}) {
    return (
        <div className={styles.listeningMenuRow}>
            <button type="button" onClick={onSkipBack}>Skip back 15s</button>
            <button type="button" onClick={onSkipForward}>Skip forward 30s</button>
        </div>
    );
}