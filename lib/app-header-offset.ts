/**
 * Measured fixed/sticky app header offset for scroll clearance.
 * Never hard-code the toolbar height — measure the live .topbar.
 */

export const APP_HEADER_OFFSET_VAR = "--app-header-offset";
export const APP_HEADER_OFFSET_ATTR = "data-app-header-offset";
export const MAIN_SCROLL_CONTAINER_SELECTOR = "[data-main-scroll-container]";

/** Small breathing room for blur, subpixels, and font ascent — not a large gap. */
export const APP_HEADER_OFFSET_BREATHING_PX = 6;

/**
 * CSS that wires the measured offset into the real scrollport and destinations.
 * Safe to inject globally; values come from the custom property updated at runtime.
 */
export const APP_HEADER_OFFSET_CSS = `
  ${MAIN_SCROLL_CONTAINER_SELECTOR} {
    ${APP_HEADER_OFFSET_VAR}: 0px;
    scroll-padding-top: var(${APP_HEADER_OFFSET_VAR}, 0px);
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

/**
 * Measure the sticky/fixed top toolbar coverage inside the main scrollport.
 * Includes responsive height, padding, and transform-shifted visual bounds.
 */
export function measureAppHeaderOffset(): number {
    if (typeof document === "undefined") return 0;
    const topbar = document.querySelector<HTMLElement>(".topbar");
    if (!topbar) return 0;

    const barRect = topbar.getBoundingClientRect();
    const layoutHeight = Math.ceil(topbar.offsetHeight || 0);
    const visualHeight = Math.ceil(barRect.height || 0);

    const main = getScrollContainerForHeaderMeasure();
    const mainRect = main?.getBoundingClientRect();

    // When the bar is stuck at the top of the scrollport, coverage is bar.bottom - port.top.
    // When mid-page, prefer the bar's own height so we do not over-clear.
    let coverage = Math.max(layoutHeight, visualHeight);
    if (mainRect) {
        const distanceFromPortTop = barRect.top - mainRect.top;
        // Stuck (or nearly stuck) at the top of the scrollport.
        if (distanceFromPortTop <= 2) {
            coverage = Math.max(coverage, Math.ceil(barRect.bottom - mainRect.top));
        }
    }

    return Math.max(0, coverage + APP_HEADER_OFFSET_BREATHING_PX);
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
