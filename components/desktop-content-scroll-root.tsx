"use client";

import { useEffect, useRef, type ReactNode } from "react";
import {
    bindDesktopMusicCardWheelScroll,
    DESKTOP_CONTENT_SCROLL_CSS,
} from "../lib/desktop-content-scroll";

type DesktopContentScrollRootProps = {
    children: ReactNode;
    className?: string;
};

/** DESKTOP ONLY — main content scroll container with music-card wheel routing. */
export function DesktopContentScrollRoot({
    children,
    className = "",
}: DesktopContentScrollRootProps) {
    const contentRef = useRef<HTMLElement | null>(null);

    useEffect(() => {
        return bindDesktopMusicCardWheelScroll(contentRef.current);
    }, []);

    return (
        <>
            <style jsx global>{DESKTOP_CONTENT_SCROLL_CSS}</style>
            <section
                ref={contentRef}
                className={`content desktop-content-scroll-root ${className}`.trim()}
            >
                {children}
            </section>
        </>
    );
}
