/**
 * Navigation scroll reset for the SPA shell.
 *
 * Important: scrollTop=0 on the wrong element is NOT enough.
 * Production often scrolls document/window when the desktop content
 * scrollport CSS fails to apply; and even inside the main panel the
 * shared video/hero sits above the page heading. Intentional navigation
 * must pin the destination heading (or upload shell) under the sticky topbar
 * on every element that is actually scrolling.
 */

export const MAIN_SCROLL_CONTAINER_ATTR = "data-main-scroll-container";
export const MAIN_SCROLL_CONTAINER_SELECTOR = `[${MAIN_SCROLL_CONTAINER_ATTR}]`;
export const PAGE_HEADING_ATTR = "data-page-heading";
export const PAGE_HEADING_SELECTOR = `[${PAGE_HEADING_ATTR}]`;
export const UPLOAD_SHELL_SELECTOR = ".upload-shell";
export const NAV_DESTINATION_ATTR = "data-nav-destination";

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

function canElementScroll(el: HTMLElement | null): el is HTMLElement {
    if (!el) return false;
    return el.scrollHeight > el.clientHeight + 1;
}

/**
 * Resolve every scrollport that can currently move vertical content.
 * Prefers the marked main panel; always includes document.scrollingElement
 * when the window/document is the real scroller (production desktop bug).
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
    if (canElementScroll(main)) {
        push(main);
    }

    const scrolling = document.scrollingElement as HTMLElement | null;
    if (canElementScroll(scrolling)) {
        push(scrolling);
    }

    if (typeof document.documentElement !== "undefined" && canElementScroll(document.documentElement)) {
        push(document.documentElement);
    }
    if (document.body && canElementScroll(document.body) && document.body !== scrolling) {
        push(document.body);
    }

    // If nothing reports as scrollable yet (layout mid-commit), still target main + document.
    if (found.length === 0) {
        push(main);
        push(scrolling);
    }

    return found.filter(Boolean);
}

function getStickyTopOffset(container: HTMLElement) {
    const scope = container.querySelector?.(".topbar")
        ? container
        : (getMainScrollContainer() || document);
    const topbar = (scope as ParentNode).querySelector?.(".topbar") as HTMLElement | null
        || document.querySelector<HTMLElement>(".topbar");
    if (!topbar) return 0;
    const style = typeof window !== "undefined" ? window.getComputedStyle(topbar) : null;
    if (style && (style.position === "sticky" || style.position === "fixed")) {
        return Math.ceil(topbar.getBoundingClientRect().height || topbar.offsetHeight || 0);
    }
    // Sticky may not resolve on document element; still account for visible topbar height.
    return Math.ceil(topbar.getBoundingClientRect().height || topbar.offsetHeight || 0);
}

/** Scroll a container so `target` sits at the top edge (below sticky chrome). */
export function scrollContainerToElement(
    container: HTMLElement,
    target: HTMLElement,
    extraOffset = 0,
) {
    const stickyOffset = getStickyTopOffset(container) + extraOffset;
    const containerRect = container.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const nextTop = Math.max(0, Math.round(container.scrollTop + (targetRect.top - containerRect.top) - stickyOffset));
    container.scrollTop = nextTop;
    container.scrollLeft = 0;
    if (typeof container.scrollTo === "function") {
        container.scrollTo({ top: nextTop, left: 0, behavior: "auto" });
    }

    // When the document/window is the scroller, also sync window.scrollTo.
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

/**
 * Pin the destination (heading or upload) to the top of every active scrollport.
 * Falls back to clearing document/window scroll only when no destination exists.
 */
export function resetNavigationScroll(options: {
    preferUpload?: boolean;
    focusHeading?: boolean;
} = {}) {
    if (typeof window === "undefined") return { ok: false as const, reason: "ssr" };
    markNavigationScrollLock();
    disableBrowserScrollRestoration();

    const preferUpload = options.preferUpload === true;
    const destination = getNavigationDestination(preferUpload);
    const containers = getActiveScrollContainers();
    const main = getMainScrollContainer();

    if (destination && containers.length > 0) {
        for (const container of containers) {
            scrollContainerToElement(container, destination);
        }
    } else {
        for (const container of containers) {
            container.scrollTop = 0;
            container.scrollLeft = 0;
            if (typeof container.scrollTo === "function") {
                container.scrollTo({ top: 0, left: 0, behavior: "auto" });
            }
        }
        if (main && !containers.includes(main)) {
            main.scrollTop = 0;
            main.scrollLeft = 0;
        }
        resetDocumentScrollFallback();
    }

    if (options.focusHeading !== false) {
        focusPageHeadingAfterNavigation();
        // Focus can restore prior scroll in some browsers — force destination again.
        if (destination) {
            for (const container of getActiveScrollContainers()) {
                scrollContainerToElement(container, destination);
            }
        }
    }

    const primary = containers[0] || main;
    return {
        ok: true as const,
        containerScrollTop: primary?.scrollTop ?? null,
        documentScrollTop: (document.scrollingElement as HTMLElement | null)?.scrollTop ?? null,
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
 * After React commits the destination view, pin destination into view.
 * Double rAF waits for layout without arbitrary long timeouts.
 */
export function scheduleNavigationScrollReset(options: NavigationScrollResetOptions = {}) {
    if (typeof window === "undefined") return;
    const { focusHeading = true, ensureUploadVisible = false } = options;
    markNavigationScrollLock();

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
