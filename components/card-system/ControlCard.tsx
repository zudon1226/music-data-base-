"use client";

import type { ReactNode } from "react";
import "./card-system.css";

export type ControlCardProps = {
    title?: ReactNode;
    value?: ReactNode;
    children?: ReactNode;
    className?: string;
    variant?: "overview" | "center" | "health";
};

/**
 * ControlCard — Platform Control Center metric / health tiles.
 * Existing .control-*-card class names also inherit this geometry via CSS.
 */
export function ControlCard({
    title,
    value,
    children,
    className = "",
    variant = "overview",
}: ControlCardProps) {
    const variantClass =
        variant === "health"
            ? "control-health-card"
            : variant === "center"
                ? "control-center-card"
                : "control-overview-card";

    return (
        <article
            className={["cs-control-card", variantClass, className].filter(Boolean).join(" ")}
            data-card-family="control"
        >
            {value != null ? <strong className="cs-control-card__value">{value}</strong> : null}
            {title != null ? <span className="cs-control-card__title">{title}</span> : null}
            {children}
        </article>
    );
}
