/** DESKTOP ONLY — music-card/content scroll layer and wheel routing. */

import {
    isInsideDesktopLibraryCardRail,
    resolveDesktopLibraryGridWheel,
} from "./desktop-library-card-rail-scroll";

export const DESKTOP_CONTENT_SCROLL_MIN_WIDTH_PX = 821;

export const DESKTOP_MUSIC_CARD_LAYER_SELECTOR = [
    ".horizontal-rail-track",
    ".horizontal-rail",
    ".song-card",
    ".media-card",
    ".video-card",
    ".library-card",
    ".artist-album-card",
    ".artist-playlist-card",
    ".playlist-tile",
    ".discovery-grid",
].join(", ");

/**
 * Desktop layout: body locked; sidebar and main content scroll independently.
 * Library Grid vertical wheel is never handled here — the browser owns it.
 */
export const DESKTOP_CONTENT_SCROLL_CSS = `
  @media (min-width: ${DESKTOP_CONTENT_SCROLL_MIN_WIDTH_PX}px) {
    html,
    body {
      height: 100%;
      overflow: hidden;
    }

    .zml-app {
      height: 100vh;
      min-height: 100vh;
      overflow: hidden;
      padding-bottom: 0;
    }

    .sidebar {
      height: 100vh;
      overflow-y: auto;
      overscroll-behavior: contain;
    }

    .content.desktop-content-scroll-root {
      height: 100vh;
      overflow-y: auto;
      overflow-x: hidden;
      overscroll-behavior: auto;
      scroll-behavior: auto;
      -webkit-overflow-scrolling: touch;
    }

    .content.desktop-content-scroll-root ${DESKTOP_MUSIC_CARD_LAYER_SELECTOR} {
      overscroll-behavior-y: auto;
    }
  }
`;

function isDesktopViewport() {
    if (typeof window === "undefined") {
        return false;
    }
    return window.matchMedia(`(min-width: ${DESKTOP_CONTENT_SCROLL_MIN_WIDTH_PX}px)`).matches;
}

function findHorizontalRailTrack(target: EventTarget | null) {
    if (!(target instanceof Element)) {
        return null;
    }
    return target.closest<HTMLElement>(".horizontal-rail-track");
}

function isInsideMusicCardLayer(target: EventTarget | null) {
    if (!(target instanceof Element)) {
        return false;
    }
    return Boolean(target.closest(DESKTOP_MUSIC_CARD_LAYER_SELECTOR));
}

function isVerticallyScrollable(element: HTMLElement, deltaY: number) {
    const style = window.getComputedStyle(element);
    const overflowY = style.overflowY;
    if (overflowY !== "auto" && overflowY !== "scroll" && overflowY !== "overlay") {
        return false;
    }
    if (element.scrollHeight <= element.clientHeight + 1) {
        return false;
    }
    if (deltaY < 0) {
        return element.scrollTop > 0;
    }
    if (deltaY > 0) {
        return element.scrollTop + element.clientHeight < element.scrollHeight - 1;
    }
    return false;
}

function shouldUseNestedVerticalScroller(event: WheelEvent, contentRoot: HTMLElement) {
    let node = event.target instanceof Element ? event.target as HTMLElement : null;
    while (node && node !== contentRoot) {
        if (isInsideDesktopLibraryCardRail(node)) {
            return false;
        }
        if (node.classList.contains("horizontal-rail-track")) {
            node = node.parentElement;
            continue;
        }
        if (isVerticallyScrollable(node, event.deltaY)) {
            return true;
        }
        node = node.parentElement;
    }
    return false;
}

function isHorizontalRailIntent(event: WheelEvent) {
    return event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY);
}

function applyHorizontalRailWheel(event: WheelEvent, rail: HTMLElement) {
    if (rail.scrollWidth <= rail.clientWidth) {
        return false;
    }
    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    rail.scrollBy({ left: delta, top: 0, behavior: "auto" });
    return true;
}

function applyContentVerticalWheel(event: WheelEvent, contentRoot: HTMLElement) {
    if (event.deltaY === 0) {
        return false;
    }
    if (shouldUseNestedVerticalScroller(event, contentRoot)) {
        return false;
    }
    contentRoot.scrollBy({ top: event.deltaY, left: 0, behavior: "auto" });
    return true;
}

/**
 * Desktop wheel router for the main content scroller.
 * Library Grid: browser owns vertical wheel; JS only handles Shift+wheel or pure deltaX.
 */
export function bindDesktopMusicCardWheelScroll(contentRoot: HTMLElement | null) {
    if (!contentRoot) {
        return () => undefined;
    }
    const scrollRoot = contentRoot;

    function handleWheel(event: WheelEvent) {
        if (!isDesktopViewport() || event.defaultPrevented) {
            return;
        }

        const libraryGridWheel = resolveDesktopLibraryGridWheel(event);
        if (libraryGridWheel.scope === "library-grid") {
            if (libraryGridWheel.action === "horizontal") {
                event.preventDefault();
            }
            return;
        }

        const rail = findHorizontalRailTrack(event.target);
        const onMusicLayer = isInsideMusicCardLayer(event.target) || Boolean(rail);

        if (rail && isHorizontalRailIntent(event)) {
            if (applyHorizontalRailWheel(event, rail)) {
                event.preventDefault();
            }
            return;
        }

        if (!onMusicLayer && event.target instanceof Element && !scrollRoot.contains(event.target)) {
            return;
        }

        if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) {
            return;
        }

        if (!onMusicLayer && scrollRoot.contains(event.target as Node)) {
            return;
        }

        if (applyContentVerticalWheel(event, scrollRoot)) {
            event.preventDefault();
        }
    }

    scrollRoot.addEventListener("wheel", handleWheel, { passive: false, capture: true });
    return () => scrollRoot.removeEventListener("wheel", handleWheel, { capture: true });
}

/** @deprecated Use bindDesktopMusicCardWheelScroll */
export function bindDesktopHorizontalRailWheel(_unusedTrack: HTMLElement | null) {
    void _unusedTrack;
    return () => undefined;
}

/** @deprecated */
export function shouldDesktopHorizontalRailCaptureWheel() {
    return false;
}

/** @deprecated */
export function applyDesktopHorizontalRailWheel() {
    return undefined;
}
