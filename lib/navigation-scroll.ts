/**
 * Navigation scroll reset for the SPA shell.
 *
 * Destination titles must sit fully below the sticky/fixed top toolbar.
 * Absolute scrollTop=0 alone is not enough when the toolbar overlays the
 * first paint of the destination — use the measured --app-header-offset.
 */

import {
    APP_HEADER_OFFSET_BREATHING_PX,
    APP_HEADER_OFFSET_VAR,
    getAppHeaderOffset,
    measureAppHeaderOffset,
    measureLiveHeaderClearance,
    syncAppHeaderOffset,
} from "./app-header-offset";

export const MAIN_SCROLL_CONTAINER_ATTR = "data-main-scroll-container";
export const MAIN_SCROLL_CONTAINER_SELECTOR = `[${MAIN_SCROLL_CONTAINER_ATTR}]`;
export const PAGE_HEADING_ATTR = "data-page-heading";
export const PAGE_HEADING_SELECTOR = `[${PAGE_HEADING_ATTR}]`;
export const UPLOAD_SHELL_SELECTOR = ".upload-shell";
export const NAV_DESTINATION_ATTR = "data-nav-destination";

export {
    APP_HEADER_OFFSET_VAR,
    getAppHeaderOffset,
    measureAppHeaderOffset,
    measureLiveHeaderClearance,
    syncAppHeaderOffset,
};

let navigationScrollLockUntil = 0;

/** Briefly block competing scrollIntoView (e.g. video focus) after explicit nav. */
export function markNavigationScrollLock(durationMs = 600) {
    if (typeof performance === "undefined") {
        navigationScrollLockUntil = Date.now() + durationMs;
        return;
    }
    navigationScrollLockUntil = performance.now() + durationMs;
}

export function isNavigationScrollLocked() {
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    return now < navigationScrollLockUntil;
}

export function disableBrowserScrollRestoration() {
    if (typeof window === "undefined" || !("scrollRestoration" in window.history)) return;
    try {
        window.history.scrollRestoration = "manual";
    } catch {
        // ignore
    }
}

export function getMainScrollContainer(): HTMLElement | null {
    if (typeof document === "undefined") return null;
    return (
        document.querySelector<HTMLElement>(MAIN_SCROLL_CONTAINER_SELECTOR)
        || document.querySelector<HTMLElement>(".content.desktop-content-scroll-root")
        || document.querySelector<HTMLElement>(".content")
    );
}

/**
 * Resolve every scrollport that can currently move vertical content.
 * Always includes the marked main panel first — even when it no longer
 * overflows. After a long→short navigation, iPhone Safari can keep a stale
 * scrollTop on `.content` while scrollHeight shrinks; excluding that panel
 * leaves a blank viewport until something else clamps scroll.
 * Never includes the sidebar.
 */
export function getActiveScrollContainers(): HTMLElement[] {
    if (typeof document === "undefined") return [];
    const found: HTMLElement[] = [];
    const seen = new Set<HTMLElement>();

    const push = (el: HTMLElement | null) => {
        if (!el || seen.has(el)) return;
        if (el.classList?.contains("sidebar")) return;
        if (el.closest?.(".sidebar")) return;
        seen.add(el);
        found.push(el);
    };

    const main = getMainScrollContainer();
    // Always reset the main content scrollport on navigation (mobile fixed panel).
    push(main);

    const scrolling = document.scrollingElement as HTMLElement | null;
    if (
        scrolling
        && (scrolling.scrollHeight > scrolling.clientHeight + 1 || scrolling.scrollTop > 0)
    ) {
        push(scrolling);
    }

    if (
        typeof document.documentElement !== "undefined"
        && (document.documentElement.scrollHeight > document.documentElement.clientHeight + 1
            || document.documentElement.scrollTop > 0)
    ) {
        push(document.documentElement);
    }
    if (
        document.body
        && document.body !== scrolling
        && (document.body.scrollHeight > document.body.clientHeight + 1 || document.body.scrollTop > 0)
    ) {
        push(document.body);
    }

    if (found.length === 0) {
        push(main);
        push(scrolling);
    }

    return found.filter(Boolean);
}

/** Hard-clear the main content scrollport before paint (stale mobile scrollTop). */
export function forceMainContentScrollTop() {
    if (typeof document === "undefined") return false;
    const main = getMainScrollContainer();
    if (!main) return false;
    main.scrollTop = 0;
    main.scrollLeft = 0;
    if (typeof main.scrollTo === "function") {
        main.scrollTo({ top: 0, left: 0, behavior: "auto" });
    }
    return true;
}

/** Measured sticky/fixed header offset (px), synced to --app-header-offset. */
export function getStickyTopOffset(container?: HTMLElement) {
    syncAppHeaderOffset();
    return measureLiveHeaderClearance(container);
}

/** Scroll a container so `target` sits fully below the sticky/fixed toolbar. */
export function scrollContainerToElement(
    container: HTMLElement,
    target: HTMLElement,
    extraOffset = 0,
) {
    syncAppHeaderOffset();
    const containerRect = container.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const topbar = typeof document !== "undefined"
        ? document.querySelector<HTMLElement>(".topbar")
        : null;
    const topbarBottom = topbar ? topbar.getBoundingClientRect().bottom : containerRect.top;
    const liveClearance = measureLiveHeaderClearance(container) + extraOffset;
    const gapBelowToolbar = targetRect.top - topbarBottom;

    // Already fully clear near the page top — use scrollTop=0 so we do not
    // pull the title up underneath a topbar that still sits below content padding.
    if (
        gapBelowToolbar >= APP_HEADER_OFFSET_BREATHING_PX - 0.5
        && container.scrollTop <= 64
        && targetRect.top < containerRect.top + Math.min(container.clientHeight, 480)
    ) {
        container.scrollTop = 0;
        container.scrollLeft = 0;
        if (typeof container.scrollTo === "function") {
            container.scrollTo({ top: 0, left: 0, behavior: "auto" });
        }
        return;
    }

    const nextTop = Math.max(
        0,
        Math.round(container.scrollTop + (targetRect.top - containerRect.top) - liveClearance),
    );
    container.scrollTop = nextTop;
    container.scrollLeft = 0;
    if (typeof container.scrollTo === "function") {
        container.scrollTo({ top: nextTop, left: 0, behavior: "auto" });
    }

    if (
        typeof window !== "undefined"
        && (container === document.scrollingElement
            || container === document.documentElement
            || container === document.body)
    ) {
        window.scrollTo({ top: nextTop, left: 0, behavior: "auto" });
    }
}

function resetDocumentScrollFallback() {
    if (typeof window === "undefined") return;
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    const scrolling = document.scrollingElement as HTMLElement | null;
    if (scrolling) {
        scrolling.scrollTop = 0;
        scrolling.scrollLeft = 0;
    }
    if (document.documentElement) {
        document.documentElement.scrollTop = 0;
        document.documentElement.scrollLeft = 0;
    }
    if (document.body) {
        document.body.scrollTop = 0;
        document.body.scrollLeft = 0;
    }
}

export function getNavigationDestination(preferUpload: boolean): HTMLElement | null {
    if (typeof document === "undefined") return null;
    if (preferUpload) {
        const upload = document.querySelector<HTMLElement>(UPLOAD_SHELL_SELECTOR)
            || document.querySelector<HTMLElement>(`[${NAV_DESTINATION_ATTR}="upload"]`);
        if (upload) return upload;
    }
    return (
        document.querySelector<HTMLElement>(PAGE_HEADING_SELECTOR)
        || document.querySelector<HTMLElement>(`[${NAV_DESTINATION_ATTR}="heading"]`)
        || document.querySelector<HTMLElement>(".section-heading")
        || document.querySelector<HTMLElement>(".section-heading h2")
    );
}

/** True when the marked page heading sits far below the first screen (e.g. Home). */
export function isDestinationBuriedInScrollport(
    container: HTMLElement,
    destination: HTMLElement,
) {
    const containerRect = container.getBoundingClientRect();
    const destRect = destination.getBoundingClientRect();
    const destinationDocumentTop = container.scrollTop + (destRect.top - containerRect.top);
    if (destinationDocumentTop > container.clientHeight * 0.85) {
        return true;
    }
    // Home (and similar) place `.hero` above the shared DestinationPageHeading.
    // Pinning to that heading scrolls past real page content and looks blank.
    const hero = container.querySelector?.(".hero");
    if (
        hero
        && typeof Node !== "undefined"
        && (hero.compareDocumentPosition(destination) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
    ) {
        return true;
    }
    return false;
}

function scrollContainerToTop(container: HTMLElement) {
    container.scrollTop = 0;
    container.scrollLeft = 0;
    if (typeof container.scrollTo === "function") {
        container.scrollTo({ top: 0, left: 0, behavior: "auto" });
    }
}

/**
 * Pin the destination (heading or upload) fully below the toolbar on every
 * active scrollport. Syncs --app-header-offset before scrolling.
 * Always clears the main content scrollport first so a prior long page cannot
 * leave iPhone Safari staring at empty space below a short destination.
 */
export function resetNavigationScroll(options: {
    preferUpload?: boolean;
    focusHeading?: boolean;
} = {}) {
    if (typeof window === "undefined") return { ok: false as const, reason: "ssr" };
    markNavigationScrollLock();
    disableBrowserScrollRestoration();

    const headerOffset = syncAppHeaderOffset();
    const preferUpload = options.preferUpload === true;
    // Clear stale main-panel scrollTop before measuring destinations.
    forceMainContentScrollTop();
    resetDocumentScrollFallback();

    const destination = getNavigationDestination(preferUpload);
    const containers = getActiveScrollContainers();
    const main = getMainScrollContainer();
    let openedAtPageTop = false;

    if (destination && containers.length > 0) {
        for (const container of containers) {
            // Home (and similar) bury .section-heading below hero/discovery blocks.
            // Open those views at the true top instead of jumping to a mid-page title.
            if (isDestinationBuriedInScrollport(container, destination)) {
                scrollContainerToTop(container);
                openedAtPageTop = true;
                continue;
            }
            scrollContainerToElement(container, destination);
        }
    } else {
        for (const container of containers) {
            scrollContainerToTop(container);
        }
        if (main && !containers.includes(main)) {
            scrollContainerToTop(main);
        }
        resetDocumentScrollFallback();
        openedAtPageTop = true;
    }

    if (options.focusHeading !== false) {
        focusPageHeadingAfterNavigation();
        // Focus can restore prior scroll — re-pin only when the heading is the
        // true first-screen destination (not a buried Home title).
        if (destination && !openedAtPageTop) {
            for (const container of getActiveScrollContainers()) {
                if (isDestinationBuriedInScrollport(container, destination)) {
                    scrollContainerToTop(container);
                    continue;
                }
                scrollContainerToElement(container, destination);
            }
        } else if (openedAtPageTop) {
            for (const container of getActiveScrollContainers()) {
                scrollContainerToTop(container);
            }
            forceMainContentScrollTop();
        }
    }

    const primary = containers[0] || main;
    return {
        ok: true as const,
        containerScrollTop: primary?.scrollTop ?? null,
        documentScrollTop: (document.scrollingElement as HTMLElement | null)?.scrollTop ?? null,
        headerOffset,
        hasDestination: Boolean(destination),
        preferUpload,
        activeContainerCount: containers.length,
    };
}

export function focusPageHeadingAfterNavigation() {
    if (typeof document === "undefined") return;
    const heading = document.querySelector<HTMLElement>(PAGE_HEADING_SELECTOR)
        || document.querySelector<HTMLElement>(".section-heading h2");
    if (!heading) return;
    // Keep scroll-margin in sync with the measured toolbar before focus.
    syncAppHeaderOffset();
    if (!heading.hasAttribute("tabindex")) {
        heading.tabIndex = -1;
    }
    try {
        heading.focus({ preventScroll: true });
    } catch {
        heading.focus();
    }
}

export type NavigationScrollResetOptions = {
    focusHeading?: boolean;
    ensureUploadVisible?: boolean;
};

/**
 * After React commits the destination view, pin destination below the toolbar.
 * Clears the main scrollport synchronously (before paint) so mobile never
 * flashes a blank panel from a stale scrollTop, then re-pins after layout.
 */
export function scheduleNavigationScrollReset(options: NavigationScrollResetOptions = {}) {
    if (typeof window === "undefined") return;
    const { focusHeading = true, ensureUploadVisible = false } = options;
    markNavigationScrollLock();
    syncAppHeaderOffset();
    // Synchronous pre-paint clear — critical on iPhone fixed `.content` panels.
    forceMainContentScrollTop();
    resetDocumentScrollFallback();

    const run = () => {
        resetNavigationScroll({
            preferUpload: ensureUploadVisible,
            focusHeading: ensureUploadVisible ? false : focusHeading,
        });
    };

    if (typeof window.requestAnimationFrame === "function") {
        requestAnimationFrame(() => {
            requestAnimationFrame(run);
        });
        return;
    }
    run();
}

/** Build a stable key for view/upload mode changes that should reset scroll. */
export function buildActiveNavigationKey(input: {
    view: string;
    showUpload: boolean;
    uploadMode?: string;
}) {
    if (input.showUpload) {
        return `upload:${input.uploadMode || "default"}|view:${input.view}`;
    }
    return `view:${input.view}`;
}
