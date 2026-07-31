"use client";

import type { ReactNode } from "react";
import "./card-system.css";

export type CardGridFamily = "media" | "store" | "promotion" | "ringtone" | "list" | "control";

export function CardGrid({
    family,
    className = "",
    label,
    children,
}: {
    family: CardGridFamily;
    className?: string;
    label?: string;
    children: ReactNode;
}) {
    return (
        <div
            className={["cs-grid", `cs-grid--${family}`, className].filter(Boolean).join(" ")}
            data-card-grid={family}
            aria-label={label}
        >
            {children}
        </div>
    );
}
