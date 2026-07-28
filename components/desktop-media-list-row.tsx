"use client";

import { MoreHorizontal, Play } from "lucide-react";
import type { ReactNode } from "react";
import "./desktop-media-list-row.css";

export type DesktopMediaListRowProps = {
    kind: string;
    cover: string;
    title: ReactNode;
    secondary: ReactNode;
    tertiary?: ReactNode;
    /** Non-layout modifiers only (e.g. "active"). Do not pass grid card class names. */
    className?: string;
    leading?: ReactNode;
    onPlay?: () => void;
    onOpenOverflow?: (trigger: HTMLElement) => void;
    overflowLabel?: string;
};

/** Presentation-only desktop List View row (compact ringtone Marketplace style). */
export function DesktopMediaListRow({
    kind,
    cover,
    title,
    secondary,
    tertiary,
    className = "",
    leading,
    onPlay,
    onOpenOverflow,
    overflowLabel = "More actions",
}: DesktopMediaListRowProps) {
    return (
        <article
            className={["desktop-media-list-row", className].filter(Boolean).join(" ")}
            data-desktop-media-card={kind}
            data-desktop-layout="list"
            data-desktop-media-list-row="true"
            role="listitem"
        >
            {leading ? <div className="desktop-media-list-row__leading">{leading}</div> : null}
            <img className="desktop-media-list-row__art" src={cover} alt="" />
            <div className="desktop-media-list-row__copy">
                <h3 className="desktop-media-list-row__title">{title}</h3>
                <p className="desktop-media-list-row__secondary">{secondary}</p>
                {tertiary ? <small className="desktop-media-list-row__meta">{tertiary}</small> : null}
            </div>
            <button
                className="desktop-media-list-row__play"
                type="button"
                aria-label="Play"
                disabled={!onPlay}
                onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onPlay?.();
                }}
            >
                <Play size={15} fill="currentColor" aria-hidden="true" />
            </button>
            <button
                className="desktop-media-list-row__more"
                type="button"
                aria-label={overflowLabel}
                aria-haspopup="menu"
                data-desktop-overflow-trigger="true"
                disabled={!onOpenOverflow}
                onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onOpenOverflow?.(event.currentTarget);
                }}
            >
                <MoreHorizontal size={16} aria-hidden="true" />
            </button>
        </article>
    );
}
