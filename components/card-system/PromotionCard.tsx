"use client";

import type { ReactNode } from "react";
import "./card-system.css";

export type PromotionCardProps = {
    cover: string;
    label: ReactNode;
    title: ReactNode;
    meta?: ReactNode;
    actionLabel: ReactNode;
    onAction: () => void;
    actionIcon?: ReactNode;
    className?: string;
};

/**
 * PromotionCard — Bundle Sales, Limited Releases, Pre-orders.
 * Equal-height column: art → content → full-width button.
 */
export function PromotionCard({
    cover,
    label,
    title,
    meta,
    actionLabel,
    onAction,
    actionIcon,
    className = "",
}: PromotionCardProps) {
    return (
        <article
            className={["cs-promotion-card", className].filter(Boolean).join(" ")}
            data-card-family="promotion"
        >
            <img className="cs-promotion-card__art" src={cover} alt="" />
            <div className="cs-promotion-card__body">
                <span className="cs-promotion-card__label">{label}</span>
                <strong className="cs-promotion-card__title">{title}</strong>
                {meta != null && meta !== "" ? (
                    <small className="cs-promotion-card__meta">{meta}</small>
                ) : null}
            </div>
            <button className="cs-promotion-card__action" type="button" onClick={onAction}>
                {actionIcon}
                {actionLabel}
            </button>
        </article>
    );
}
