/**
 * Navigation scroll reset for the SPA shell.
 *
 * Important: scrollTop=0 is NOT enough. The shared video/hero sits above the
 * page heading inside the main scroll panel, so intentional navigation must
 * pin the destination heading (or upload shell) under the sticky topbar.
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

function getStickyTopOffset(container: HTMLElement) {
    const topbar = container.querySelector<HTMLElement>(".topbar");
    if (!topbar) return 0;
    const style = typeof window !== "undefined" ? window.getComputedStyle(topbar) : null;
    if (style && (style.position === "sticky" || style.position === "fixed")) {
        return Math.ceil(topbar.getBoundingClientRect().height || topbar.offsetHeight || 0);
    }
    return 0;
}

/** Scroll container so `target` sits at the top edge (below sticky chrome). */
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
 * Pin the destination (heading or upload) to the top of the real scroll panel.
 * Also clears document/window scroll as a nested-scroll fallback.
 */
export function resetNavigationScroll(options: {
    preferUpload?: boolean;
    focusHeading?: boolean;
} = {}) {
    if (typeof window === "undefined") return { ok: false as const, reason: "ssr" };
    markNavigationScrollLock();
    disableBrowserScrollRestoration();

    const container = getMainScrollContainer();
    const preferUpload = options.preferUpload === true;
    const destination = getNavigationDestination(preferUpload);

    if (container && destination) {
        scrollContainerToElement(container, destination);
    } else if (container) {
        container.scrollTop = 0;
        container.scrollLeft = 0;
        if (typeof container.scrollTo === "function") {
            container.scrollTo({ top: 0, left: 0, behavior: "auto" });
        }
    }

    resetDocumentScrollFallback();

    if (options.focusHeading !== false) {
        focusPageHeadingAfterNavigation();
        // Focus can restore prior scroll in some browsers — force destination again.
        if (container && destination) {
            scrollContainerToElement(container, destination);
        }
    }

    return {
        ok: true as const,
        containerScrollTop: container?.scrollTop ?? null,
        hasDestination: Boolean(destination),
        preferUpload,
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
