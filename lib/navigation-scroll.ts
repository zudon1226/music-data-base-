/**
 * Centralized navigation scroll restoration for the SPA shell.
 * Desktop scrolls inside [data-main-scroll-container]; mobile uses .content;
 * window is a fallback only.
 */

export const MAIN_SCROLL_CONTAINER_ATTR = "data-main-scroll-container";
export const MAIN_SCROLL_CONTAINER_SELECTOR = `[${MAIN_SCROLL_CONTAINER_ATTR}]`;
export const PAGE_HEADING_ATTR = "data-page-heading";
export const PAGE_HEADING_SELECTOR = `[${PAGE_HEADING_ATTR}]`;
export const UPLOAD_SHELL_SELECTOR = ".upload-shell";

export function getMainScrollContainer(): HTMLElement | null {
    if (typeof document === "undefined") return null;
    return (
        document.querySelector<HTMLElement>(MAIN_SCROLL_CONTAINER_SELECTOR)
        || document.querySelector<HTMLElement>(".content.desktop-content-scroll-root")
        || document.querySelector<HTMLElement>(".content")
    );
}

/** Instantly reset the real main content scroll container (and window fallback). */
export function scrollMainContentToTop() {
    if (typeof window === "undefined") return;
    const container = getMainScrollContainer();
    if (container) {
        container.scrollTop = 0;
        container.scrollLeft = 0;
        if (typeof container.scrollTo === "function") {
            container.scrollTo({ top: 0, left: 0, behavior: "auto" });
        }
    }
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    if (document.documentElement) {
        document.documentElement.scrollTop = 0;
        document.documentElement.scrollLeft = 0;
    }
    if (document.body) {
        document.body.scrollTop = 0;
        document.body.scrollLeft = 0;
    }
}

/** Move focus to the destination page heading without causing a second scroll jump. */
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

/** Ensure the upload shell is visible at the top of the main scroll container. */
export function ensureUploadShellVisible() {
    if (typeof document === "undefined") return;
    const shell = document.querySelector<HTMLElement>(UPLOAD_SHELL_SELECTOR);
    const container = getMainScrollContainer();
    if (!shell || !container) {
        scrollMainContentToTop();
        return;
    }
    scrollMainContentToTop();
    // If layout placed the shell below the fold for any reason, pin it into view without smooth motion.
    const containerRect = container.getBoundingClientRect();
    const shellRect = shell.getBoundingClientRect();
    if (shellRect.top < containerRect.top || shellRect.top > containerRect.top + 120) {
        const nextTop = Math.max(0, container.scrollTop + (shellRect.top - containerRect.top));
        container.scrollTop = nextTop;
        container.scrollLeft = 0;
    }
}

export type NavigationScrollResetOptions = {
    focusHeading?: boolean;
    ensureUploadVisible?: boolean;
};

/**
 * Run after the destination view has committed/painted.
 * Uses double rAF (not arbitrary long timeouts) so layout exists first.
 */
export function scheduleNavigationScrollReset(options: NavigationScrollResetOptions = {}) {
    if (typeof window === "undefined") return;
    const { focusHeading = true, ensureUploadVisible = false } = options;

    const run = () => {
        if (ensureUploadVisible) {
            ensureUploadShellVisible();
        } else {
            scrollMainContentToTop();
        }
        if (focusHeading) {
            focusPageHeadingAfterNavigation();
        }
    };

    requestAnimationFrame(() => {
        requestAnimationFrame(run);
    });
}
