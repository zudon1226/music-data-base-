"use client";

import { useRef, type ReactNode } from "react";
import {
    DESKTOP_LIBRARY_CARD_RAIL_CSS,
    DESKTOP_LIBRARY_CARD_RAIL_ROOT_CLASS,
} from "../lib/desktop-library-card-rail-scroll";

type DesktopLibraryCardRailProps = {
    children: ReactNode;
    className: string;
    label: string;
};

/** DESKTOP ONLY — Library Grid View carousel; wheel routing lives on the content scroll root. */
export function DesktopLibraryCardRail({
    children,
    className,
    label,
}: DesktopLibraryCardRailProps) {
    const trackRef = useRef<HTMLElement | null>(null);

    function scrollByCard(direction: -1 | 1) {
        const track = trackRef.current;
        if (!track) {
            return;
        }
        const firstCard = track.querySelector<HTMLElement>("article, button, .playlist-tile, .artist-playlist-card");
        const cardWidth = firstCard?.offsetWidth || Math.max(180, Math.round(track.clientWidth * 0.8));
        track.scrollBy({ left: direction * (cardWidth + 12), behavior: "smooth" });
    }

    return (
        <>
            <style jsx global>{DESKTOP_LIBRARY_CARD_RAIL_CSS}</style>
            <div className={`horizontal-rail ${DESKTOP_LIBRARY_CARD_RAIL_ROOT_CLASS}`} aria-label={label}>
                <button className="rail-arrow rail-arrow-left" onClick={() => scrollByCard(-1)} type="button" aria-label={`Scroll ${label} left`}>
                    <span aria-hidden="true">{"<"}</span>
                </button>
                <section ref={trackRef} className={`horizontal-rail-track ${className}`} tabIndex={0}>
                    {children}
                </section>
                <button className="rail-arrow rail-arrow-right" onClick={() => scrollByCard(1)} type="button" aria-label={`Scroll ${label} right`}>
                    <span aria-hidden="true">{">"}</span>
                </button>
            </div>
        </>
    );
}
