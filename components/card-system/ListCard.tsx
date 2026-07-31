"use client";

import type { ReactNode } from "react";
import "./card-system.css";

export type ListCardProps = {
    rank?: ReactNode;
    cover: string;
    title: ReactNode;
    secondary?: ReactNode;
    price?: ReactNode;
    actions?: ReactNode;
    className?: string;
};

/**
 * ListCard — Top Charts and other compact ranked rows.
 */
export function ListCard({
    rank,
    cover,
    title,
    secondary,
    price,
    actions,
    className = "",
}: ListCardProps) {
    return (
        <article
            className={["cs-list-card", className].filter(Boolean).join(" ")}
            data-card-family="list"
        >
            {rank != null ? <strong className="cs-list-card__rank">{rank}</strong> : <span />}
            <img className="cs-list-card__art" src={cover} alt="" />
            <div className="cs-list-card__copy">
                <b className="cs-list-card__title">{title}</b>
                {secondary != null && secondary !== "" ? (
                    <small className="cs-list-card__secondary">{secondary}</small>
                ) : null}
            </div>
            {price != null ? <em className="cs-list-card__price">{price}</em> : null}
            {actions ? <div className="cs-list-card__actions">{actions}</div> : null}
        </article>
    );
}
