/** DESKTOP ONLY — Library horizontal card rail scroll layer and wheel routing. */

export const DESKTOP_LIBRARY_CARD_RAIL_MIN_WIDTH_PX = 821;

export const DESKTOP_LIBRARY_CARD_RAIL_ROOT_CLASS = "desktop-library-card-rail";

export const DESKTOP_LIBRARY_CARD_RAIL_CSS = `
  @media (min-width: ${DESKTOP_LIBRARY_CARD_RAIL_MIN_WIDTH_PX}px) {
    .view-grid .${DESKTOP_LIBRARY_CARD_RAIL_ROOT_CLASS} .horizontal-rail {
      width: 100%;
      min-width: 0;
      overflow: visible;
    }

    .view-grid .${DESKTOP_LIBRARY_CARD_RAIL_ROOT_CLASS} .horizontal-rail-track {
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

    .view-grid .${DESKTOP_LIBRARY_CARD_RAIL_ROOT_CLASS} .horizontal-rail-track.is-drag-scrolling {
      cursor: grabbing;
      scroll-behavior: auto;
      user-select: none;
    }

    .view-grid .${DESKTOP_LIBRARY_CARD_RAIL_ROOT_CLASS} .horizontal-rail-track.song-grid,
    .view-grid .${DESKTOP_LIBRARY_CARD_RAIL_ROOT_CLASS} .horizontal-rail-track.video-grid,
    .view-grid .${DESKTOP_LIBRARY_CARD_RAIL_ROOT_CLASS} .horizontal-rail-track.artist-album-grid {
      display: grid;
      grid-auto-flow: column;
      grid-template-columns: none;
      align-items: stretch;
    }

    .view-grid .${DESKTOP_LIBRARY_CARD_RAIL_ROOT_CLASS} .horizontal-rail-track.song-grid,
    .view-grid .${DESKTOP_LIBRARY_CARD_RAIL_ROOT_CLASS} .horizontal-rail-track.video-grid {
      grid-auto-columns: minmax(174px, 188px);
    }

    .view-grid .${DESKTOP_LIBRARY_CARD_RAIL_ROOT_CLASS} .horizontal-rail-track.artist-album-grid {
      grid-auto-columns: minmax(210px, 245px);
    }
  }
`;

function isDesktopViewport() {
    if (typeof window === "undefined") {
        return false;
    }
    return window.matchMedia(`(min-width: ${DESKTOP_LIBRARY_CARD_RAIL_MIN_WIDTH_PX}px)`).matches;
}

function isLibraryGridView(rail: HTMLElement) {
    return !rail.closest(".view-list");
}

function findContentScrollRoot(track: HTMLElement) {
    return track.closest<HTMLElement>(".content.desktop-content-scroll-root")
        ?? document.querySelector<HTMLElement>(".content.desktop-content-scroll-root");
}

function isInteractiveDragTarget(target: EventTarget | null) {
    if (!(target instanceof Element)) {
        return false;
    }
    return Boolean(target.closest("button, a, input, textarea, select, label, [role='button']"));
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

function readRailWheelDelta(event: WheelEvent) {
    if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
        return event.deltaX;
    }
    if (event.shiftKey && event.deltaY !== 0) {
        return event.deltaY;
    }
    return event.deltaY;
}

function applyContentVerticalWheel(event: WheelEvent, contentRoot: HTMLElement) {
    if (event.deltaY === 0) {
        return false;
    }
    contentRoot.scrollTop += event.deltaY;
    return true;
}

function applyLibraryGridHorizontalWheel(event: WheelEvent, rail: HTMLElement) {
    const delta = readRailWheelDelta(event);
    if (delta === 0) {
        return false;
    }
    if (!canScrollRailHorizontally(rail, delta)) {
        return false;
    }
    rail.scrollLeft += delta;
    return true;
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

/**
 * Library rails own wheel + pointer drag.
 * Grid View: mouse wheel and trackpad move the card rail horizontally; vertical page
 * scroll chains only when the rail cannot absorb the wheel delta.
 * List View: vertical wheel scrolls the page; horizontal trackpad/shift+wheel scrolls the rail.
 */
export function bindDesktopLibraryCardRailScroll(track: HTMLElement | null) {
    if (!track) {
        return () => undefined;
    }

    const rail = track;
    let dragPointerId: number | null = null;
    let dragStartX = 0;
    let dragStartScrollLeft = 0;

    function handleWheel(event: WheelEvent) {
        if (!isDesktopViewport() || event.defaultPrevented) {
            return;
        }

        event.stopPropagation();

        if (isLibraryGridView(rail)) {
            if (applyLibraryGridHorizontalWheel(event, rail)) {
                event.preventDefault();
                return;
            }

            if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
                const contentRoot = findContentScrollRoot(rail);
                if (contentRoot && applyContentVerticalWheel(event, contentRoot)) {
                    event.preventDefault();
                }
            }
            return;
        }

        if (isHorizontalRailIntent(event)) {
            if (applyHorizontalRailWheel(event, rail)) {
                event.preventDefault();
            }
            return;
        }

        if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) {
            return;
        }

        const contentRoot = findContentScrollRoot(rail);
        if (contentRoot && applyContentVerticalWheel(event, contentRoot)) {
            event.preventDefault();
        }
    }

    function handlePointerDown(event: PointerEvent) {
        if (!isDesktopViewport() || !isLibraryGridView(rail) || event.button !== 0 || isInteractiveDragTarget(event.target)) {
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

    rail.addEventListener("wheel", handleWheel, { passive: false, capture: true });
    rail.addEventListener("pointerdown", handlePointerDown);
    rail.addEventListener("pointermove", handlePointerMove);
    rail.addEventListener("pointerup", endDrag);
    rail.addEventListener("pointercancel", endDrag);

    return () => {
        rail.removeEventListener("wheel", handleWheel, { capture: true });
        rail.removeEventListener("pointerdown", handlePointerDown);
        rail.removeEventListener("pointermove", handlePointerMove);
        rail.removeEventListener("pointerup", endDrag);
        rail.removeEventListener("pointercancel", endDrag);
        rail.classList.remove("is-drag-scrolling");
    };
}

export function isInsideDesktopLibraryCardRail(target: EventTarget | null) {
    if (!(target instanceof Element)) {
        return false;
    }
    return Boolean(target.closest(`.${DESKTOP_LIBRARY_CARD_RAIL_ROOT_CLASS}`));
}
