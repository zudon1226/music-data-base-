"use client";

import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { Clock3 } from "lucide-react";
import {
    PODCAST_PLAYBACK_RATES,
    PODCAST_SLEEP_MINUTE_OPTIONS,
    podcastPlaybackRateLabel,
    podcastSleepModeLabel,
    type PodcastPlaybackRate,
    type PodcastSleepMode,
} from "@/lib/podcast-playback-controls";
import styles from "./podcasts.module.css";

type PodcastListeningControlsProps = {
    variant: "desktop" | "mobile";
    includeSkip: boolean;
    collapsed?: boolean;
    playbackRate: PodcastPlaybackRate;
    sleepMode: PodcastSleepMode;
    onSkipBack: () => void;
    onSkipForward: () => void;
    onPlaybackRateChange: (rate: PodcastPlaybackRate) => void;
    onSleepModeChange: (mode: PodcastSleepMode) => void;
};

type OpenMenu = "speed" | "sleep" | "listen" | null;

export function PodcastListeningControls({
    variant,
    includeSkip,
    collapsed = false,
    playbackRate,
    sleepMode,
    onSkipBack,
    onSkipForward,
    onPlaybackRateChange,
    onSleepModeChange,
}: PodcastListeningControlsProps) {
    const menuId = useId();
    const [openMenu, setOpenMenu] = useState<OpenMenu>(null);
    const [menuStyle, setMenuStyle] = useState<CSSProperties>({});
    const speedRef = useRef<HTMLButtonElement | null>(null);
    const sleepRef = useRef<HTMLButtonElement | null>(null);
    const listenRef = useRef<HTMLButtonElement | null>(null);
    const menuRef = useRef<HTMLDivElement | null>(null);

    const closeMenu = () => setOpenMenu(null);

    useEffect(() => {
        if (!openMenu) return;
        const trigger = openMenu === "speed"
            ? speedRef.current
            : openMenu === "sleep"
                ? sleepRef.current
                : listenRef.current;
        const place = () => {
            if (!trigger) return;
            const rect = trigger.getBoundingClientRect();
            const width = Math.min(280, Math.max(196, window.innerWidth - 16));
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
            closeMenu();
        };
        const onKey = (event: KeyboardEvent) => {
            if (event.key === "Escape") closeMenu();
        };
        window.addEventListener("resize", place);
        window.addEventListener("scroll", place, true);
        window.addEventListener("mousedown", onPointer);
        window.addEventListener("keydown", onKey);
        return () => {
            window.removeEventListener("resize", place);
            window.removeEventListener("scroll", place, true);
            window.removeEventListener("mousedown", onPointer);
            window.removeEventListener("keydown", onKey);
        };
    }, [openMenu]);

    useEffect(() => {
        if (collapsed) closeMenu();
    }, [collapsed]);

    const sleepActive = sleepMode !== "off";
    const menu = openMenu && typeof document !== "undefined"
        ? createPortal(
            <div
                ref={menuRef}
                className={styles.listeningMenu}
                id={menuId}
                role="dialog"
                aria-label="Podcast listening controls"
                style={menuStyle}
            >
                {includeSkip ? (
                    <div className={styles.listeningMenuSection}>
                        <p>Skip</p>
                        <div className={styles.listeningMenuRow}>
                            <button type="button" onClick={() => { onSkipBack(); closeMenu(); }}>
                                Skip back 15 seconds
                            </button>
                            <button type="button" onClick={() => { onSkipForward(); closeMenu(); }}>
                                Skip forward 30 seconds
                            </button>
                        </div>
                    </div>
                ) : null}
                {openMenu !== "sleep" ? (
                    <div className={styles.listeningMenuSection}>
                        <p>Playback speed</p>
                        <div className={styles.listeningMenuRow}>
                            {PODCAST_PLAYBACK_RATES.map((rate) => (
                                <button
                                    key={rate}
                                    type="button"
                                    aria-pressed={playbackRate === rate}
                                    className={playbackRate === rate ? styles.listeningMenuActive : undefined}
                                    onClick={() => {
                                        onPlaybackRateChange(rate);
                                        if (openMenu === "speed") closeMenu();
                                    }}
                                >
                                    {podcastPlaybackRateLabel(rate)}
                                </button>
                            ))}
                        </div>
                    </div>
                ) : null}
                {openMenu !== "speed" ? (
                    <div className={styles.listeningMenuSection}>
                        <p>Sleep timer</p>
                        <div className={styles.listeningMenuRow}>
                            <button
                                type="button"
                                aria-pressed={sleepMode === "off"}
                                className={sleepMode === "off" ? styles.listeningMenuActive : undefined}
                                onClick={() => {
                                    onSleepModeChange("off");
                                    closeMenu();
                                }}
                            >
                                Off
                            </button>
                            {PODCAST_SLEEP_MINUTE_OPTIONS.map((minutes) => (
                                <button
                                    key={minutes}
                                    type="button"
                                    aria-pressed={sleepMode === minutes}
                                    className={sleepMode === minutes ? styles.listeningMenuActive : undefined}
                                    onClick={() => {
                                        onSleepModeChange(minutes);
                                        closeMenu();
                                    }}
                                >
                                    {minutes} min
                                </button>
                            ))}
                            <button
                                type="button"
                                aria-pressed={sleepMode === "end-of-episode"}
                                className={sleepMode === "end-of-episode" ? styles.listeningMenuActive : undefined}
                                onClick={() => {
                                    onSleepModeChange("end-of-episode");
                                    closeMenu();
                                }}
                            >
                                End of episode
                            </button>
                        </div>
                    </div>
                ) : null}
            </div>,
            document.body,
        )
        : null;

    if (variant === "mobile") {
        if (collapsed) return null;
        return (
            <>
                <button
                    ref={listenRef}
                    type="button"
                    className={styles.listeningMobileTrigger}
                    aria-haspopup="dialog"
                    aria-expanded={openMenu === "listen"}
                    aria-controls={openMenu === "listen" ? menuId : undefined}
                    title="Podcast listening controls"
                    onClick={() => setOpenMenu((current) => current === "listen" ? null : "listen")}
                >
                    Listen
                </button>
                {menu}
            </>
        );
    }

    if (includeSkip) {
        return (
            <>
                <button
                    ref={listenRef}
                    type="button"
                    className={styles.listeningSideTrigger}
                    aria-haspopup="dialog"
                    aria-expanded={openMenu === "listen"}
                    aria-controls={openMenu === "listen" ? menuId : undefined}
                    title="Podcast listening controls"
                    onClick={() => setOpenMenu((current) => current === "listen" ? null : "listen")}
                >
                    Listen
                </button>
                {menu}
            </>
        );
    }

    return (
        <div className={styles.listeningSideCluster}>
            <button
                ref={speedRef}
                type="button"
                className={styles.listeningSideTrigger}
                aria-haspopup="dialog"
                aria-expanded={openMenu === "speed"}
                aria-controls={openMenu === "speed" ? menuId : undefined}
                title="Podcast playback speed"
                onClick={() => setOpenMenu((current) => current === "speed" ? null : "speed")}
            >
                {podcastPlaybackRateLabel(playbackRate)}
            </button>
            <button
                ref={sleepRef}
                type="button"
                className={`${styles.listeningSideTrigger}${sleepActive ? ` ${styles.listeningSideActive}` : ""}`}
                aria-haspopup="dialog"
                aria-expanded={openMenu === "sleep"}
                aria-controls={openMenu === "sleep" ? menuId : undefined}
                title={`Podcast sleep timer: ${podcastSleepModeLabel(sleepMode)}`}
                onClick={() => setOpenMenu((current) => current === "sleep" ? null : "sleep")}
            >
                <Clock3 size={14} aria-hidden="true"/>
                <span>
                    {sleepMode === "off"
                        ? "Sleep"
                        : sleepMode === "end-of-episode"
                            ? "End"
                            : `${sleepMode}m`}
                </span>
            </button>
            {menu}
        </div>
    );
}
