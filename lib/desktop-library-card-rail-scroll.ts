/** DESKTOP ONLY — Library Grid View carousel CSS and wheel pass-through rules. */

export const DESKTOP_LIBRARY_CARD_RAIL_MIN_WIDTH_PX = 821;

export const DESKTOP_LIBRARY_CARD_RAIL_ROOT_CLASS = "desktop-library-card-rail";

export const DESKTOP_LIBRARY_CARD_RAIL_CSS = `
  @media (min-width: ${DESKTOP_LIBRARY_CARD_RAIL_MIN_WIDTH_PX}px) {
    .zml-app:not(.view-list) .${DESKTOP_LIBRARY_CARD_RAIL_ROOT_CLASS} .horizontal-rail {
      width: 100%;
      min-width: 0;
      overflow: visible;
    }

    .zml-app:not(.view-list) .${DESKTOP_LIBRARY_CARD_RAIL_ROOT_CLASS} .horizontal-rail-track {
      min-width: 0;
      width: 100%;
      max-width: none;
      overflow-x: auto !important;
      overflow-y: hidden !important;
      overscroll-behavior-x: contain;
      overscroll-behavior-y: none;
      scroll-behavior: auto;
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

    .zml-app:not(.view-list) .${DESKTOP_LIBRARY_CARD_RAIL_ROOT_CLASS} .library-card,
    .zml-app:not(.view-list) .${DESKTOP_LIBRARY_CARD_RAIL_ROOT_CLASS} .song-card,
    .zml-app:not(.view-list) .${DESKTOP_LIBRARY_CARD_RAIL_ROOT_CLASS} .video-card,
    .zml-app:not(.view-list) .${DESKTOP_LIBRARY_CARD_RAIL_ROOT_CLASS} .media-card {
      overflow: visible;
      overscroll-behavior-y: auto;
    }
  }
`;

export type DesktopLibraryGridWheelOutcome =
    | { scope: "not-library-grid" }
    | { scope: "library-grid"; action: "pass-through" }
    | { scope: "library-grid"; action: "horizontal"; preventDefault: true };

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

function isDesktopLibraryGridView(target: EventTarget | null) {
    if (!(target instanceof Element)) {
        return false;
    }
    return Boolean(target.closest(".zml-app:not(.view-list)"))
        && isInsideDesktopLibraryCardRail(target);
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

function scrollLibraryGridCarouselHorizontally(rail: HTMLElement, delta: number) {
    if (!canScrollRailHorizontally(rail, delta)) {
        return false;
    }
    rail.scrollBy({ left: delta, top: 0, behavior: "auto" });
    return true;
}

/**
 * Library Grid wheel routing only.
 * Any deltaY without Shift passes through to the browser (no listeners, no preventDefault).
 * Horizontal carousel: Shift+wheel uses deltaY, pure horizontal trackpad uses deltaX only.
 */
export function resolveDesktopLibraryGridWheel(event: WheelEvent): DesktopLibraryGridWheelOutcome {
    if (!isDesktopViewport() || event.defaultPrevented) {
        return { scope: "not-library-grid" };
    }

    if (!isDesktopLibraryGridView(event.target)) {
        return { scope: "not-library-grid" };
    }

    const track = findDesktopLibraryCardRailTrack(event.target);
    if (!track) {
        return { scope: "library-grid", action: "pass-through" };
    }

    if (event.deltaY !== 0 && !event.shiftKey) {
        return { scope: "library-grid", action: "pass-through" };
    }

    if (event.shiftKey && event.deltaY !== 0) {
        if (scrollLibraryGridCarouselHorizontally(track, event.deltaY)) {
            return { scope: "library-grid", action: "horizontal", preventDefault: true };
        }
        return { scope: "library-grid", action: "pass-through" };
    }

    if (event.deltaY === 0 && event.deltaX !== 0) {
        if (scrollLibraryGridCarouselHorizontally(track, event.deltaX)) {
            return { scope: "library-grid", action: "horizontal", preventDefault: true };
        }
        return { scope: "library-grid", action: "pass-through" };
    }

    return { scope: "library-grid", action: "pass-through" };
}
