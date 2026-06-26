/** DESKTOP ONLY — Library Grid View carousel CSS and wheel routing helpers. */

export const DESKTOP_LIBRARY_CARD_RAIL_MIN_WIDTH_PX = 821;

export const DESKTOP_LIBRARY_CARD_RAIL_ROOT_CLASS = "desktop-library-card-rail";

export const DESKTOP_LIBRARY_CARD_RAIL_CSS = `
  @media (min-width: ${DESKTOP_LIBRARY_CARD_RAIL_MIN_WIDTH_PX}px) {
    .zml-app:not(.view-list) .${DESKTOP_LIBRARY_CARD_RAIL_ROOT_CLASS} .horizontal-rail {
      width: 100%;
      min-width: 0;
      overflow: visible;
      pointer-events: auto;
    }

    .zml-app:not(.view-list) .${DESKTOP_LIBRARY_CARD_RAIL_ROOT_CLASS} .horizontal-rail-track {
      min-width: 0;
      width: 100%;
      max-width: none;
      overflow-x: auto;
      overflow-y: visible;
      overscroll-behavior-x: contain;
      overscroll-behavior-y: auto;
      scroll-behavior: smooth;
      -webkit-overflow-scrolling: touch;
      touch-action: pan-x pan-y;
    }

    .zml-app:not(.view-list) .${DESKTOP_LIBRARY_CARD_RAIL_ROOT_CLASS} .horizontal-rail-track.song-grid,
    .zml-app:not(.view-list) .${DESKTOP_LIBRARY_CARD_RAIL_ROOT_CLASS} .horizontal-rail-track.video-grid,
    .zml-app:not(.view-list) .${DESKTOP_LIBRARY_CARD_RAIL_ROOT_CLASS} .horizontal-rail-track.artist-album-grid {
      display: grid;
      grid-auto-flow: column;
      grid-template-columns: none;
      align-items: stretch;
    }

    .zml-app:not(.view-list) .${DESKTOP_LIBRARY_CARD_RAIL_ROOT_CLASS} .horizontal-rail-track.song-grid,
    .zml-app:not(.view-list) .${DESKTOP_LIBRARY_CARD_RAIL_ROOT_CLASS} .horizontal-rail-track.video-grid {
      grid-auto-columns: minmax(174px, 188px);
    }

    .zml-app:not(.view-list) .${DESKTOP_LIBRARY_CARD_RAIL_ROOT_CLASS} .horizontal-rail-track.artist-album-grid {
      grid-auto-columns: minmax(210px, 245px);
    }
  }
`;

export type DesktopLibraryGridWheelResult =
    | { handled: true; preventDefault: true }
    | { handled: false };

function isDesktopViewport() {
    if (typeof window === "undefined") {
        return false;
    }
    return window.matchMedia(`(min-width: ${DESKTOP_LIBRARY_CARD_RAIL_MIN_WIDTH_PX}px)`).matches;
}

export function isInsideDesktopLibraryCardRail(target: EventTarget | null) {
    if (!(target instanceof Element)) {
        return false;
    }
    return Boolean(target.closest(`.${DESKTOP_LIBRARY_CARD_RAIL_ROOT_CLASS}`));
}

export function findDesktopLibraryCardRailTrack(target: EventTarget | null) {
    if (!(target instanceof Element)) {
        return null;
    }
    const root = target.closest(`.${DESKTOP_LIBRARY_CARD_RAIL_ROOT_CLASS}`);
    if (!root) {
        return null;
    }
    return root.querySelector<HTMLElement>(".horizontal-rail-track")
        ?? target.closest<HTMLElement>(".horizontal-rail-track");
}

export function isDesktopLibraryGridViewRail(rail: HTMLElement | null) {
    if (!rail) {
        return false;
    }
    return !rail.closest(".view-list");
}

function isHorizontalCarouselIntent(event: WheelEvent) {
    return event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY);
}

function canScrollRailHorizontally(rail: HTMLElement, delta: number) {
    if (rail.scrollWidth <= rail.clientWidth + 1) {
        return false;
    }
    if (delta < 0) {
        return rail.scrollLeft > 0;
    }
    if (delta > 0) {
        return rail.scrollLeft + rail.clientWidth < rail.scrollWidth - 1;
    }
    return false;
}

function applyHorizontalCarouselWheel(event: WheelEvent, rail: HTMLElement) {
    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    if (!canScrollRailHorizontally(rail, delta)) {
        return false;
    }
    rail.scrollLeft += delta;
    return true;
}

/**
 * Library Grid View: only Shift+wheel or dominant deltaX scrolls the carousel horizontally.
 * Vertical wheel (dominant deltaY) is not handled here — page scroll owns that path.
 */
export function routeDesktopLibraryGridCarouselWheel(event: WheelEvent): DesktopLibraryGridWheelResult {
    if (!isDesktopViewport() || event.defaultPrevented) {
        return { handled: false };
    }

    const track = findDesktopLibraryCardRailTrack(event.target);
    if (!track || !isDesktopLibraryGridViewRail(track)) {
        return { handled: false };
    }

    if (!isHorizontalCarouselIntent(event)) {
        return { handled: false };
    }

    if (applyHorizontalCarouselWheel(event, track)) {
        return { handled: true, preventDefault: true };
    }

    return { handled: false };
}
