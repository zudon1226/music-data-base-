"use client";

import {
    DesktopMediaGridCard,
    type DesktopMediaGridCardProps,
} from "../desktop-media-grid-card";
import "./card-system.css";

/**
 * MediaCard — Home, Marketplace, Library, albums, discovery, queue, recent.
 * Canonical shared media geometry. All media grids inherit via this path or
 * DesktopMediaGridCard (which always applies cs-media-card + data-card-family).
 */
export type MediaCardProps = DesktopMediaGridCardProps;

export function MediaCard({ className = "", cardFamily = "media", ...props }: MediaCardProps) {
    return (
        <DesktopMediaGridCard
            {...props}
            cardFamily={cardFamily === "ringtone" ? "ringtone" : "media"}
            className={["cs-media-card", className].filter(Boolean).join(" ")}
        />
    );
}
