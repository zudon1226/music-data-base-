"use client";

import type { ReactNode } from "react";
import { DESKTOP_CONTENT_SCROLL_CSS } from "../lib/desktop-content-scroll";

type DesktopContentScrollRootProps = {
    children: ReactNode;
    className?: string;
};

/** DESKTOP ONLY — main content scroll container; native browser wheel/touchpad only. */
export function DesktopContentScrollRoot({
    children,
    className = "",
}: DesktopContentScrollRootProps) {
    return (
        <>
            <style jsx global>{DESKTOP_CONTENT_SCROLL_CSS}</style>
            <section
                className={`content desktop-content-scroll-root ${className}`.trim()}
            >
                {children}
            </section>
        </>
    );
}
