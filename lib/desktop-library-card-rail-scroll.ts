/** DESKTOP ONLY — Library Grid View horizontal card rail scroll routing. */

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
      overflow-x: auto;
      overflow-y: hidden;
      overscroll-behavior-x: contain;
      overscroll-behavior-y: auto;
      scroll-behavior: smooth;
      -webkit-overflow-scrolling: touch;
      touch-action: pan-x pan-y;
      cursor: grab;
    }

    .zml-app:not(.view-list) .${DESKTOP_LIBRARY_CARD_RAIL_ROOT_CLASS} .horizontal-rail-track.is-drag-scrolling {
      cursor: grabbing;
      scroll-behavior: auto;
      user-select: none;
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
    | { handled: true; preventDefault: false }
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

function railHasHorizontalOverflow(rail: HTMLElement) {
    return rail.scrollWidth > rail.clientWidth + 1;
}

function canScrollRailHorizontally(rail: HTMLElement, delta: number) {
    if (!railHasHorizontalOverflow(rail)) {
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

function readLibraryGridWheelDelta(event: WheelEvent) {
    if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
        return event.deltaX;
    }
    if (event.shiftKey && event.deltaY !== 0) {
        return event.deltaY;
    }
    return event.deltaY;
}

function isHorizontalRailIntent(event: WheelEvent) {
    return event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY);
}

function applyHorizontalRailWheel(event: WheelEvent, rail: HTMLElement) {
    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    if (!canScrollRailHorizontally(rail, delta)) {
        return false;
    }
    rail.scrollLeft += delta;
    return true;
}

function applyLibraryGridHorizontalWheel(event: WheelEvent, rail: HTMLElement) {
    const delta = readLibraryGridWheelDelta(event);
    if (delta === 0) {
        return false;
    }
    if (!canScrollRailHorizontally(rail, delta)) {
        return false;
    }
    rail.scrollLeft += delta;
    return true;
}

/**
 * Route wheel input for desktop Library card rails.
 * Grid View converts mouse wheel / trackpad movement into horizontal rail scroll.
 */
export function routeDesktopLibraryCardRailWheel(
    event: WheelEvent,
    options: {
        applyContentVerticalWheel?: (event: WheelEvent) => boolean;
    } = {},
): DesktopLibraryGridWheelResult {
    if (!isDesktopViewport() || event.defaultPrevented) {
        return { handled: false };
    }

    const track = findDesktopLibraryCardRailTrack(event.target);
    if (!track) {
        return { handled: false };
    }

    if (isDesktopLibraryGridViewRail(track)) {
        if (applyLibraryGridHorizontalWheel(event, track)) {
            return { handled: true, preventDefault: true };
        }

        if (Math.abs(event.deltaY) > Math.abs(event.deltaX) && options.applyContentVerticalWheel?.(event)) {
            return { handled: true, preventDefault: true };
        }

        return { handled: true, preventDefault: false };
    }

    if (isHorizontalRailIntent(event)) {
        if (applyHorizontalRailWheel(event, track)) {
            return { handled: true, preventDefault: true };
        }
        return { handled: true, preventDefault: false };
    }

    if (Math.abs(event.deltaY) > Math.abs(event.deltaX) && options.applyContentVerticalWheel?.(event)) {
        return { handled: true, preventDefault: true };
    }

    return { handled: true, preventDefault: false };
}

function isInteractiveDragTarget(target: EventTarget | null) {
    if (!(target instanceof Element)) {
        return false;
    }
    return Boolean(target.closest("button, a, input, textarea, select, label, [role='button']"));
}

/** Pointer drag for Library Grid View rails. */
export function bindDesktopLibraryCardRailScroll(track: HTMLElement | null) {
    if (!track) {
        return () => undefined;
    }

    const rail = track;
    let dragPointerId: number | null = null;
    let dragStartX = 0;
    let dragStartScrollLeft = 0;

    function handlePointerDown(event: PointerEvent) {
        if (!isDesktopViewport() || !isDesktopLibraryGridViewRail(rail) || event.button !== 0 || isInteractiveDragTarget(event.target)) {
            return;
        }
        if (!railHasHorizontalOverflow(rail)) {
            return;
        }

        dragPointerId = event.pointerId;
        dragStartX = event.clientX;
        dragStartScrollLeft = rail.scrollLeft;
        rail.classList.add("is-drag-scrolling");
        rail.setPointerCapture(event.pointerId);
    }

    function handlePointerMove(event: PointerEvent) {
        if (dragPointerId !== event.pointerId) {
            return;
        }
        rail.scrollLeft = dragStartScrollLeft - (event.clientX - dragStartX);
        event.preventDefault();
    }

    function endDrag(event: PointerEvent) {
        if (dragPointerId !== event.pointerId) {
            return;
        }
        dragPointerId = null;
        rail.classList.remove("is-drag-scrolling");
        if (rail.hasPointerCapture(event.pointerId)) {
            rail.releasePointerCapture(event.pointerId);
        }
    }

    rail.addEventListener("pointerdown", handlePointerDown);
    rail.addEventListener("pointermove", handlePointerMove);
    rail.addEventListener("pointerup", endDrag);
    rail.addEventListener("pointercancel", endDrag);

    return () => {
        rail.removeEventListener("pointerdown", handlePointerDown);
        rail.removeEventListener("pointermove", handlePointerMove);
        rail.removeEventListener("pointerup", endDrag);
        rail.removeEventListener("pointercancel", endDrag);
        rail.classList.remove("is-drag-scrolling");
    };
}
