/**
 * Measured fixed/sticky app header offset for scroll clearance.
 * Never hard-code the toolbar height — measure the live .topbar.
 */

export const APP_HEADER_OFFSET_VAR = "--app-header-offset";
export const APP_HEADER_OFFSET_ATTR = "data-app-header-offset";
export const MAIN_SCROLL_CONTAINER_SELECTOR = "[data-main-scroll-container]";

/** Breathing room for blur, subpixels, and font ascent — not a large gap. */
export const APP_HEADER_OFFSET_BREATHING_PX = 8;

/**
 * CSS that wires the measured offset into the real scrollport and destinations.
 * Topbar margin-bottom gives in-flow titles clearance at scrollTop=0
 * (scroll-margin alone does not create layout space).
 */
export const APP_HEADER_OFFSET_CSS = `
  ${MAIN_SCROLL_CONTAINER_SELECTOR} {
    ${APP_HEADER_OFFSET_VAR}: 0px;
    scroll-padding-top: var(${APP_HEADER_OFFSET_VAR}, 0px);
  }

  ${MAIN_SCROLL_CONTAINER_SELECTOR} > .topbar {
    margin-bottom: ${APP_HEADER_OFFSET_BREATHING_PX}px;
  }

  [data-page-heading],
  [data-nav-destination="heading"],
  [data-nav-destination="upload"],
  .section-heading,
  .upload-shell {
    scroll-margin-top: var(${APP_HEADER_OFFSET_VAR}, 0px);
  }
`;

function getScrollContainerForHeaderMeasure(): HTMLElement | null {
    if (typeof document === "undefined") return null;
    return (
        document.querySelector<HTMLElement>(MAIN_SCROLL_CONTAINER_SELECTOR)
        || document.querySelector<HTMLElement>(".content.desktop-content-scroll-root")
        || document.querySelector<HTMLElement>(".content")
    );
}

/** Stuck sticky-header height (for --app-header-offset / scroll-padding). */
export function measureAppHeaderOffset(): number {
    if (typeof document === "undefined") return 0;
    const topbar = document.querySelector<HTMLElement>(".topbar");
    if (!topbar) return 0;

    const barRect = topbar.getBoundingClientRect();
    const layoutHeight = Math.ceil(topbar.offsetHeight || 0);
    const visualHeight = Math.ceil(barRect.height || 0);
    const coverage = Math.max(layoutHeight, visualHeight, 0);
    return Math.max(0, coverage + APP_HEADER_OFFSET_BREATHING_PX);
}

/**
 * Live clearance from the scrollport top to the visible bottom of the toolbar.
 * Use this when pinning destinations — near scrollTop=0 the topbar sits below
 * content padding, so height-only math can place titles underneath it.
 */
export function measureLiveHeaderClearance(container?: HTMLElement | null): number {
    if (typeof document === "undefined") return 0;
    const topbar = document.querySelector<HTMLElement>(".topbar");
    if (!topbar) return measureAppHeaderOffset();

    const port = container || getScrollContainerForHeaderMeasure();
    const portTop = port?.getBoundingClientRect().top ?? 0;
    const barBottom = topbar.getBoundingClientRect().bottom;
    const live = Math.ceil(barBottom - portTop) + APP_HEADER_OFFSET_BREATHING_PX;
    // Never under-clear relative to the stuck header height.
    return Math.max(live, measureAppHeaderOffset());
}

/** Write --app-header-offset onto the main scroll container and documentElement. */
export function applyAppHeaderOffset(offsetPx = measureAppHeaderOffset()): number {
    if (typeof document === "undefined") return offsetPx;
    const rounded = Math.max(0, Math.round(offsetPx));
    const value = `${rounded}px`;
    const main = getScrollContainerForHeaderMeasure();
    if (main) {
        main.style.setProperty(APP_HEADER_OFFSET_VAR, value);
        main.setAttribute(APP_HEADER_OFFSET_ATTR, String(rounded));
    }
    document.documentElement.style.setProperty(APP_HEADER_OFFSET_VAR, value);
    return rounded;
}

export function syncAppHeaderOffset(): number {
    return applyAppHeaderOffset(measureAppHeaderOffset());
}

/** Read the last applied offset (CSS px) or re-measure. */
export function getAppHeaderOffset(): number {
    if (typeof document === "undefined") return 0;
    const main = getScrollContainerForHeaderMeasure();
    const raw = main?.style.getPropertyValue(APP_HEADER_OFFSET_VAR)
        || document.documentElement.style.getPropertyValue(APP_HEADER_OFFSET_VAR);
    const parsed = Number.parseFloat(String(raw).replace("px", ""));
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
    return measureAppHeaderOffset();
}
