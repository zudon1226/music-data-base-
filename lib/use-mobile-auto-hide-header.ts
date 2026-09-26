"use client";

import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { MAIN_SCROLL_CONTAINER_SELECTOR } from "./app-header-offset";
import { MOBILE_COMPACT_MEDIA } from "./mobile-compact-viewport";

const SCROLL_THRESHOLD_PX = 10;
const NEAR_TOP_PX = 24;
const MOBILE_NAV_SELECTOR = "[data-mobile-horizontal-nav], .mobile-horizontal-nav";

const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

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
 * The chrome is sticky inside the main scroll container on phones. Prefer that
 * container by overflow style (content may not overflow yet right after mount).
 */
function resolveChromeScrollRoot(chrome: HTMLElement): HTMLElement | Window {
    const main = chrome.closest<HTMLElement>(MAIN_SCROLL_CONTAINER_SELECTOR);
    if (main && /(auto|scroll)/.test(window.getComputedStyle(main).overflowY)) {
        return main;
    }
    return resolveMobileScrollRoot();
}

function isDocumentScrollTarget(target: EventTarget | null): boolean {
    return target === document
        || target === window
        || target === document.documentElement
        || target === document.body
        || target === document.scrollingElement;
}

function readScrollTop(root: HTMLElement | Window): number {
    if (root === window) {
        return window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
    }
    return (root as HTMLElement).scrollTop;
}

/**
 * Auto-hide the full mobile chrome on downward scroll; reveal on upward scroll.
 * The chrome mounts only after auth/founding gates clear, so all measurement and
 * listeners bind to the live chrome element and rebind whenever it changes.
 *
 * Hiding is visual only (CSS keeps the sticky box in layout), so hide/reveal never
 * moves content or the scroll position. Hiding is allowed only once the chrome's
 * in-flow slot has scrolled fully out of view, so no header-sized gap can show.
 */
export function useMobileAutoHideHeader(options: MobileAutoHideHeaderOptions = {}) {
    const { forceVisible = false, enabled = true, chromeRef, resetKey } = options;
    const [hidden, setHidden] = useState(false);
    const [hiddenResetKey, setHiddenResetKey] = useState(resetKey);
    const [chromeElement, setChromeElement] = useState<HTMLElement | null>(null);
    const lastScrollTopRef = useRef(0);
    const rafRef = useRef(0);
    const hiddenRef = useRef(false);
    const interactingNavRef = useRef(false);
    const forceVisibleRef = useRef(forceVisible);
    const enabledRef = useRef(enabled);
    const scrollRootRef = useRef<HTMLElement | Window | null>(null);
    const chromeHeightRef = useRef(0);

    // Ref objects do not notify on attach/detach; sync after every commit so the
    // effect below binds to the chrome once the app shell actually renders it.
    useIsomorphicLayoutEffect(() => {
        const next = chromeRef?.current ?? null;
        setChromeElement((previous) => (previous === next ? previous : next));
    });

    // Route/view change, forced visibility, disabled hook or missing chrome always show the header.
    if (hiddenResetKey !== resetKey) {
        setHiddenResetKey(resetKey);
        if (hidden) setHidden(false);
    }
    else if (hidden && (forceVisible || !enabled || !chromeElement)) {
        setHidden(false);
    }

    useEffect(() => {
        forceVisibleRef.current = forceVisible;
    }, [forceVisible]);

    useEffect(() => {
        enabledRef.current = enabled;
    }, [enabled]);

    useEffect(() => {
        hiddenRef.current = hidden;
    }, [hidden]);

    useEffect(() => {
        const chrome = chromeElement;
        if (!enabled || !chrome || typeof window === "undefined") {
            chromeHeightRef.current = 0;
            scrollRootRef.current = null;
            hiddenRef.current = false;
            return;
        }

        const media = window.matchMedia(MOBILE_COMPACT_MEDIA);
        const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

        const applyChromeHeight = () => {
            if (!chrome.isConnected) return 0;
            // visibility/opacity do not change the box height, so this is valid while hidden.
            const height = Math.ceil(chrome.getBoundingClientRect().height || chrome.offsetHeight || 0);
            if (height <= 0) return chromeHeightRef.current;
            chromeHeightRef.current = height;
            document.documentElement.style.setProperty("--mobile-chrome-height", `${height}px`);
            chrome.style.setProperty("--mobile-chrome-height", `${height}px`);
            return height;
        };

        // Scroll offset below which the chrome's in-flow slot is (partly) visible.
        const revealTop = () => Math.max(NEAR_TOP_PX, chromeHeightRef.current);

        const setHiddenSafe = (next: boolean) => {
            if (hiddenRef.current === next) return;
            // Never hide without a measured height: the visible-slot threshold would be unknown.
            if (next && applyChromeHeight() <= 0) return;
            hiddenRef.current = next;
            setHidden(next);
        };

        const onScroll = (event: Event) => {
            const target = event.target;
            let eventRoot: HTMLElement | Window | null = null;
            if (isDocumentScrollTarget(target)) {
                eventRoot = window;
            }
            else if (target instanceof HTMLElement && target.matches(MAIN_SCROLL_CONTAINER_SELECTOR)) {
                eventRoot = target;
            }
            // Horizontal nav, carousels and nested list shells do not drive the chrome.
            if (!eventRoot) return;
            if (eventRoot !== scrollRootRef.current) {
                scrollRootRef.current = eventRoot;
                lastScrollTopRef.current = readScrollTop(eventRoot);
                return;
            }
            if (rafRef.current) return;
            rafRef.current = window.requestAnimationFrame(() => {
                rafRef.current = 0;
                const scrollRoot = scrollRootRef.current || resolveChromeScrollRoot(chrome);
                if (!enabledRef.current || !media.matches || reducedMotion.matches
                    || forceVisibleRef.current || interactingNavRef.current) {
                    setHiddenSafe(false);
                    lastScrollTopRef.current = readScrollTop(scrollRoot);
                    return;
                }
                const scrollTop = readScrollTop(scrollRoot);
                const delta = scrollTop - lastScrollTopRef.current;
                if (scrollTop <= revealTop()) {
                    setHiddenSafe(false);
                    lastScrollTopRef.current = scrollTop;
                    return;
                }
                if (Math.abs(delta) < SCROLL_THRESHOLD_PX) return;
                setHiddenSafe(delta > 0);
                lastScrollTopRef.current = scrollTop;
            });
        };

        const rebind = () => {
            const root = resolveChromeScrollRoot(chrome);
            scrollRootRef.current = root;
            lastScrollTopRef.current = readScrollTop(root);
            applyChromeHeight();
            if (!media.matches || lastScrollTopRef.current <= revealTop()) setHiddenSafe(false);
        };

        rebind();

        // Scroll does not bubble; a capturing document listener sees both the
        // main container and document scrolling without per-target rebinding.
        document.addEventListener("scroll", onScroll, { passive: true, capture: true });

        const isNavEvent = (event: Event) => event.target instanceof Element
            && Boolean(event.target.closest(MOBILE_NAV_SELECTOR));
        const markNavInteract = (event: Event) => {
            if (!isNavEvent(event)) return;
            interactingNavRef.current = true;
            setHiddenSafe(false);
        };
        const clearNavInteract = (event: Event) => {
            if (!isNavEvent(event)) return;
            window.setTimeout(() => {
                interactingNavRef.current = false;
            }, 400);
        };
        chrome.addEventListener("pointerdown", markNavInteract);
        chrome.addEventListener("touchstart", markNavInteract, { passive: true });
        chrome.addEventListener("pointerup", clearNavInteract);
        chrome.addEventListener("touchend", clearNavInteract, { passive: true });

        media.addEventListener("change", rebind);
        window.addEventListener("resize", rebind);
        window.addEventListener("orientationchange", rebind);
        const ro = typeof ResizeObserver !== "undefined"
            ? new ResizeObserver(() => {
                applyChromeHeight();
                const root = scrollRootRef.current;
                if (hiddenRef.current && root && readScrollTop(root) <= revealTop()) {
                    setHiddenSafe(false);
                }
            })
            : null;
        ro?.observe(chrome);

        return () => {
            document.removeEventListener("scroll", onScroll, { capture: true } as EventListenerOptions);
            if (rafRef.current) {
                window.cancelAnimationFrame(rafRef.current);
                rafRef.current = 0;
            }
            media.removeEventListener("change", rebind);
            window.removeEventListener("resize", rebind);
            window.removeEventListener("orientationchange", rebind);
            chrome.removeEventListener("pointerdown", markNavInteract);
            chrome.removeEventListener("touchstart", markNavInteract);
            chrome.removeEventListener("pointerup", clearNavInteract);
            chrome.removeEventListener("touchend", clearNavInteract);
            ro?.disconnect();
            interactingNavRef.current = false;
            chromeHeightRef.current = 0;
            scrollRootRef.current = null;
            hiddenRef.current = false;
        };
    }, [enabled, chromeElement]);

    // Route/content change: reset baseline so the next scroll direction is measured cleanly.
    useEffect(() => {
        if (!enabled || !chromeElement || typeof window === "undefined") return;
        const root = resolveChromeScrollRoot(chromeElement);
        scrollRootRef.current = root;
        lastScrollTopRef.current = readScrollTop(root);
        hiddenRef.current = false;
    }, [enabled, chromeElement, resetKey]);

    return {
        headerHidden: hidden,
        chromeProps: {
            "data-mobile-app-chrome": "true",
            "data-header-hidden": hidden ? "true" : "false",
            className: hidden ? "mobile-app-chrome is-header-hidden" : "mobile-app-chrome",
        } as const,
    };
}
