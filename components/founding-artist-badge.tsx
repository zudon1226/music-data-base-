"use client";

import { FOUNDING_ARTIST_BADGE_LABEL } from "@/lib/founding-artist-designation";

type FoundingArtistBadgeProps = {
    className?: string;
};

export function FoundingArtistBadge({ className = "" }: FoundingArtistBadgeProps) {
    return (
        <span
            className={`founding-artist-badge profile-role-badge${className ? ` ${className}` : ""}`}
            title="Recognition for early Artist supporters on Music Data Base. Not ownership, equity, or guaranteed earnings."
        >
            {FOUNDING_ARTIST_BADGE_LABEL}
        </span>
    );
}
