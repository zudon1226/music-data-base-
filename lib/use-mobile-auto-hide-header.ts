"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { MAIN_SCROLL_CONTAINER_SELECTOR } from "./app-header-offset";
import { MOBILE_COMPACT_MEDIA } from "./mobile-compact-viewport";

const SCROLL_THRESHOLD_PX = 10;
const NEAR_TOP_PX = 24;

export type MobileAutoHideHeaderOptions = {
    /** Keep header visible (action sheet, modal, nav interaction). */
    forceVisible?: boolean;
    enabled?: boolean;
    chromeRef?: RefObject<HTMLElement | null>;
    /** Reset last scroll position when this key changes (route/view). */
    resetKey?: string | number;
};

function isScrollableOverflowY(el: HTMLElement): boolean {
    const style = window.getComputedStyle(el);
    if (!/(auto|scroll)/.test(style.overflowY)) return false;
    return el.scrollHeight > el.clientHeight + 1;
}

/**
 * Resolve the element that actually receives vertical scroll for mobile pages.
 * Do not attach to a tall non-scrolling main container — that silently drops events
 * when the document/window is the real scroller (common ≤820px).
 */
export function resolveMobileScrollRoot(): HTMLElement | Window {
    if (typeof window === "undefined") return window;
    const main = document.querySelector<HTMLElement>(MAIN_SCROLL_CONTAINER_SELECTOR);
    if (main && isScrollableOverflowY(main)) {
        return main;
    }
    const candidates = [
        document.scrollingElement,
        document.documentElement,
        document.body,
    ].filter((node): node is HTMLElement => Boolean(node));
    for (const el of candidates) {
        if (isScrollableOverflowY(el)) return el;
    }
    return window;
}

/**
 * Auto-hide the full mobile chrome on downward scroll; reveal on upward scroll.
 * Uses rAF throttling + transform (applied by CSS via data attribute).
 */
export function useMobileAutoHideHeader(options: MobileAutoHideHeaderOptions = {}) {
    const { forceVisible = false, enabled = true, chromeRef, resetKey } = options;
    const [hidden, setHidden] = useState(false);
    const lastScrollTopRef = useRef(0);
    const rafRef = useRef(0);
    const hiddenRef = useRef(false);
    const interactingNavRef = useRef(false);
    const forceVisibleRef = useRef(forceVisible);
    const enabledRef = useRef(enabled);
    const scrollRootRef = useRef<HTMLElement | Window | null>(null);

    useEffect(() => {
        forceVisibleRef.current = forceVisible;
        if (forceVisible) {
            hiddenRef.current = false;
            setHidden(false);
        }
    }, [forceVisible]);

    useEffect(() => {
        enabledRef.current = enabled;
        if (!enabled) {
            hiddenRef.current = false;
            setHidden(false);
        }
    }, [enabled]);

    useEffect(() => {
        hiddenRef.current = hidden;
    }, [hidden]);

    useEffect(() => {
        if (!enabled || typeof window === "undefined") {
            setHidden(false);
            return;
        }

        const media = window.matchMedia(MOBILE_COMPACT_MEDIA);
        const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

        const readScrollTop = (root: HTMLElement | Window) => {
            if (root === window) {
                return window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
            }
            return (root as HTMLElement).scrollTop;
        };

        const applyChromeHeight = () => {
            const chrome = chromeRef?.current || document.querySelector<HTMLElement>("[data-mobile-app-chrome]");
            if (!chrome) return;
            const height = Math.ceil(chrome.getBoundingClientRect().height || chrome.offsetHeight || 0);
            document.documentElement.style.setProperty("--mobile-chrome-height", `${height}px`);
            chrome.style.setProperty("--mobile-chrome-height", `${height}px`);
        };

        const setHiddenSafe = (next: boolean) => {
            if (hiddenRef.current === next) return;
            const wasHidden = hiddenRef.current;
            hiddenRef.current = next;
            setHidden(next);
            // When revealing via margin restore, nudge scroll so sticky chrome does not cover
            // the first interactive row that filled the reclaimed space while hidden.
            if (wasHidden && !next) {
                const chrome = chromeRef?.current || document.querySelector<HTMLElement>("[data-mobile-app-chrome]");
                const height = Math.ceil(
                    Number.parseFloat(document.documentElement.style.getPropertyValue("--mobile-chrome-height"))
                    || chrome?.offsetHeight
                    || 0,
                );
                if (height > 0) {
                    const root = scrollRootRef.current || resolveMobileScrollRoot();
                    const top = readScrollTop(root);
                    if (top > NEAR_TOP_PX) {
                        if (root === window) {
                            window.scrollTo(0, top + height);
                        }
                        else {
                            (root as HTMLElement).scrollTop = top + height;
                        }
                        lastScrollTopRef.current = top + height;
                    }
                }
            }
        };

        const onScroll = () => {
            if (rafRef.current) return;
            rafRef.current = window.requestAnimationFrame(() => {
                rafRef.current = 0;
                if (!enabledRef.current || !media.matches || reducedMotion.matches
                    || forceVisibleRef.current || interactingNavRef.current) {
                    setHiddenSafe(false);
                    const root = scrollRootRef.current || resolveMobileScrollRoot();
                    lastScrollTopRef.current = readScrollTop(root);
                    return;
                }
                const scrollRoot = scrollRootRef.current || resolveMobileScrollRoot();
                const scrollTop = readScrollTop(scrollRoot);
                const delta = scrollTop - lastScrollTopRef.current;
                if (scrollTop <= NEAR_TOP_PX) {
                    setHiddenSafe(false);
                    lastScrollTopRef.current = scrollTop;
                    return;
                }
                if (Math.abs(delta) < SCROLL_THRESHOLD_PX) return;
                if (delta > 0) {
                    setHiddenSafe(true);
                }
                else {
                    setHiddenSafe(false);
                }
                lastScrollTopRef.current = scrollTop;
            });
        };

        const boundTargets = new Set<HTMLElement | Window | Document>();

        const bindTarget = (target: HTMLElement | Window | Document) => {
            if (boundTargets.has(target)) return;
            boundTargets.add(target);
            target.addEventListener("scroll", onScroll, { passive: true, capture: true });
        };

        const unbindAll = () => {
            for (const target of boundTargets) {
                target.removeEventListener("scroll", onScroll, { capture: true } as EventListenerOptions);
            }
            boundTargets.clear();
        };

        const rebind = () => {
            unbindAll();
            const root = resolveMobileScrollRoot();
            scrollRootRef.current = root;
            lastScrollTopRef.current = readScrollTop(root);
            applyChromeHeight();
            // Bind the resolved root plus window/document so nested↔document switches still work.
            bindTarget(root);
            if (root !== window) bindTarget(window);
            bindTarget(document);
            if (!media.matches) setHiddenSafe(false);
        };

        rebind();

        const onResize = () => {
            rebind();
        };

        const chrome = chromeRef?.current || document.querySelector<HTMLElement>("[data-mobile-app-chrome]");
        const nav = chrome?.querySelector<HTMLElement>("[data-mobile-horizontal-nav], .mobile-horizontal-nav");
        const markNavInteract = () => {
            interactingNavRef.current = true;
            setHiddenSafe(false);
        };
        const clearNavInteract = () => {
            window.setTimeout(() => {
                interactingNavRef.current = false;
            }, 400);
        };
        nav?.addEventListener("pointerdown", markNavInteract);
        nav?.addEventListener("touchstart", markNavInteract, { passive: true });
        nav?.addEventListener("pointerup", clearNavInteract);
        nav?.addEventListener("touchend", clearNavInteract, { passive: true });

        media.addEventListener("change", onResize);
        window.addEventListener("resize", onResize);
        window.addEventListener("orientationchange", onResize);
        const ro = typeof ResizeObserver !== "undefined" && chrome
            ? new ResizeObserver(() => applyChromeHeight())
            : null;
        if (chrome && ro) ro.observe(chrome);

        return () => {
            unbindAll();
            if (rafRef.current) window.cancelAnimationFrame(rafRef.current);
            media.removeEventListener("change", onResize);
            window.removeEventListener("resize", onResize);
            window.removeEventListener("orientationchange", onResize);
            nav?.removeEventListener("pointerdown", markNavInteract);
            nav?.removeEventListener("touchstart", markNavInteract);
            nav?.removeEventListener("pointerup", clearNavInteract);
            nav?.removeEventListener("touchend", clearNavInteract);
            ro?.disconnect();
            setHiddenSafe(false);
        };
    }, [enabled, chromeRef]);

    // Route/content change: reset baseline so the next scroll direction is measured cleanly.
    useEffect(() => {
        if (!enabled || typeof window === "undefined") return;
        const root = resolveMobileScrollRoot();
        scrollRootRef.current = root;
        lastScrollTopRef.current =
            root === window
                ? (window.scrollY || document.documentElement.scrollTop || 0)
                : (root as HTMLElement).scrollTop;
        hiddenRef.current = false;
        setHidden(false);
    }, [enabled, resetKey]);

    return {
        headerHidden: hidden,
        chromeProps: {
            "data-mobile-app-chrome": "true",
            "data-header-hidden": hidden ? "true" : "false",
            className: hidden ? "mobile-app-chrome is-header-hidden" : "mobile-app-chrome",
        } as const,
    };
}
