"use client";

import type { ReactNode } from "react";

type DesktopMediaListProps = {
    children: ReactNode;
    label: string;
};

/**
 * Shared desktop List View collection — same vertical stack Ringtone Marketplace uses.
 * Do not wrap list rows in horizontal rails.
 */
export function DesktopMediaList({ children, label }: DesktopMediaListProps) {
    return (
        <div className="desktop-media-list" role="list" aria-label={label} data-desktop-media-list="true">
            {children}
        </div>
    );
}
