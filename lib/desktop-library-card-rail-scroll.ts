/** DESKTOP ONLY — Library Grid View carousel CSS and grid detection helpers. */

export const DESKTOP_LIBRARY_CARD_RAIL_MIN_WIDTH_PX = 821;

export const DESKTOP_LIBRARY_CARD_RAIL_ROOT_CLASS = "desktop-library-card-rail";

export const DESKTOP_LIBRARY_CARD_RAIL_CSS = `
  @media (min-width: ${DESKTOP_LIBRARY_CARD_RAIL_MIN_WIDTH_PX}px) {
    .zml-app.view-grid .${DESKTOP_LIBRARY_CARD_RAIL_ROOT_CLASS} .horizontal-rail {
      width: 100%;
      min-width: 0;
      overflow: visible;
    }

    .zml-app.view-grid .${DESKTOP_LIBRARY_CARD_RAIL_ROOT_CLASS} .horizontal-rail-track {
      min-width: 0;
      width: 100%;
      max-width: none;
      overflow-x: auto !important;
      overflow-y: hidden !important;
      overscroll-behavior-x: contain;
      overscroll-behavior-y: none;
      scroll-behavior: auto !important;
      scroll-snap-type: none !important;
    }

    .zml-app.view-grid .${DESKTOP_LIBRARY_CARD_RAIL_ROOT_CLASS} .horizontal-rail-track > * {
      scroll-snap-align: unset;
    }

    .zml-app.view-grid .${DESKTOP_LIBRARY_CARD_RAIL_ROOT_CLASS} .horizontal-rail-track.song-grid,
    .zml-app.view-grid .${DESKTOP_LIBRARY_CARD_RAIL_ROOT_CLASS} .horizontal-rail-track.video-grid,
    .zml-app.view-grid .${DESKTOP_LIBRARY_CARD_RAIL_ROOT_CLASS} .horizontal-rail-track.artist-album-grid {
      display: grid;
      grid-auto-flow: column;
      grid-template-columns: none;
      align-items: stretch;
    }

    .zml-app.view-grid .${DESKTOP_LIBRARY_CARD_RAIL_ROOT_CLASS} .horizontal-rail-track.song-grid,
    .zml-app.view-grid .${DESKTOP_LIBRARY_CARD_RAIL_ROOT_CLASS} .horizontal-rail-track.video-grid {
      grid-auto-columns: minmax(174px, 188px);
    }

    .zml-app.view-grid .${DESKTOP_LIBRARY_CARD_RAIL_ROOT_CLASS} .horizontal-rail-track.artist-album-grid {
      grid-auto-columns: minmax(210px, 245px);
    }

    .zml-app.view-grid .${DESKTOP_LIBRARY_CARD_RAIL_ROOT_CLASS} .library-card,
    .zml-app.view-grid .${DESKTOP_LIBRARY_CARD_RAIL_ROOT_CLASS} .song-card,
    .zml-app.view-grid .${DESKTOP_LIBRARY_CARD_RAIL_ROOT_CLASS} .video-card,
    .zml-app.view-grid .${DESKTOP_LIBRARY_CARD_RAIL_ROOT_CLASS} .media-card {
      overflow: visible;
    }
  }
`;

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

export function isDesktopLibraryGridView(target: EventTarget | null) {
    if (!isDesktopViewport() || !(target instanceof Element)) {
        return false;
    }
    if (!isInsideDesktopLibraryCardRail(target)) {
        return false;
    }
    const app = target.closest(".zml-app");
    return app !== null && app.classList.contains("view-grid");
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

export function canDesktopLibraryGridScrollHorizontally(rail: HTMLElement, delta: number) {
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

export function scrollDesktopLibraryGridHorizontally(rail: HTMLElement, delta: number) {
    if (!canDesktopLibraryGridScrollHorizontally(rail, delta)) {
        return false;
    }
    rail.scrollBy({ left: delta, top: 0, behavior: "auto" });
    return true;
}
