"use client";

import type { ReactNode } from "react";
import "./card-system.css";

export type StoreCardProps = {
    cover: string;
    name: ReactNode;
    meta?: ReactNode;
    onOpen: () => void;
    openLabel?: string;
    primaryAction?: ReactNode;
    secondaryAction?: ReactNode;
    className?: string;
};

/**
 * StoreCard — Artist / Producer store tiles.
 * Artwork above text, centered, full-width actions.
 */
export function StoreCard({
    cover,
    name,
    meta,
    onOpen,
    openLabel = "Open store",
    primaryAction,
    secondaryAction,
    className = "",
}: StoreCardProps) {
    return (
        <article
            className={["cs-store-card", className].filter(Boolean).join(" ")}
            data-card-family="store"
        >
            <button
                className="cs-store-card__art-btn"
                type="button"
                aria-label={openLabel}
                onClick={onOpen}
            >
                <span className="cs-store-card__media">
                    <img className="cs-store-card__art" src={cover} alt="" />
                </span>
                <strong className="cs-store-card__name">{name}</strong>
                {meta != null && meta !== "" ? (
                    <small className="cs-store-card__meta">{meta}</small>
                ) : null}
            </button>
            {(primaryAction || secondaryAction) ? (
                <div className="cs-store-card__actions">
                    {primaryAction}
                    {secondaryAction}
                </div>
            ) : null}
        </article>
    );
}
