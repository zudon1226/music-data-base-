"use client";

import { useLayoutEffect, type ReactNode } from "react";
import { APP_HEADER_OFFSET_CSS, syncAppHeaderOffset } from "../lib/app-header-offset";
import { DESKTOP_CONTENT_SCROLL_CSS } from "../lib/desktop-content-scroll";

type DesktopContentScrollRootProps = {
    children: ReactNode;
    className?: string;
};

/**
 * DESKTOP ONLY — main content scroll container; native browser wheel/touchpad only.
 * Inject CSS via a plain style tag so scrollport + header-offset rules ship in production.
 */
export function DesktopContentScrollRoot({
    children,
    className = "",
}: DesktopContentScrollRootProps) {
    useLayoutEffect(() => {
        const sync = () => {
            syncAppHeaderOffset();
        };
        sync();

        const topbar = document.querySelector(".topbar");
        const main = document.querySelector("[data-main-scroll-container]");
        const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(sync) : null;
        if (observer && topbar) observer.observe(topbar);
        if (observer && main) observer.observe(main);

        window.addEventListener("resize", sync);
        window.addEventListener("orientationchange", sync);
        return () => {
            observer?.disconnect();
            window.removeEventListener("resize", sync);
            window.removeEventListener("orientationchange", sync);
        };
    }, []);

    return (
        <>
            <style
                data-desktop-content-scroll=""
                dangerouslySetInnerHTML={{ __html: DESKTOP_CONTENT_SCROLL_CSS }}
            />
            <style
                data-app-header-offset-css=""
                dangerouslySetInnerHTML={{ __html: APP_HEADER_OFFSET_CSS }}
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
