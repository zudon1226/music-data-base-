"use client";

import type { ReactNode } from "react";
import { DESKTOP_CONTENT_SCROLL_CSS } from "../lib/desktop-content-scroll";

type DesktopContentScrollRootProps = {
    children: ReactNode;
    className?: string;
};

/**
 * DESKTOP ONLY — main content scroll container; native browser wheel/touchpad only.
 * Inject CSS via a plain style tag (avoid Next styled jsx stripping) so the
 * scrollport rules actually ship in production builds.
 */
export function DesktopContentScrollRoot({
    children,
    className = "",
}: DesktopContentScrollRootProps) {
    return (
        <>
            <style
                data-desktop-content-scroll=""
                dangerouslySetInnerHTML={{ __html: DESKTOP_CONTENT_SCROLL_CSS }}
            />
            <section
                className={`content desktop-content-scroll-root ${className}`.trim()}
                data-main-scroll-container=""
            >
                {children}
            </section>
        </>
    );
}
