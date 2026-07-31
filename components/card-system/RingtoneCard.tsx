"use client";

import {
    DesktopMediaGridCard,
    type DesktopMediaGridCardProps,
} from "../desktop-media-grid-card";
import "./card-system.css";

export type RingtoneCardProps = DesktopMediaGridCardProps;

/**
 * RingtoneCard — Marketplace / Purchased / Favorites tiles.
 * Same vertical media geometry; family tag isolates ringtone grids.
 */
export function RingtoneCard({ className = "", ...props }: RingtoneCardProps) {
    return (
        <DesktopMediaGridCard
            {...props}
            kind={props.kind || "ringtone"}
            cardFamily="ringtone"
            className={["cs-ringtone-card", "ringtone-market-card", className]
                .filter(Boolean)
                .join(" ")}
        />
    );
}
