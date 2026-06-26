/** DESKTOP ONLY — main content scroll layer and horizontal-rail wheel routing. */

export const DESKTOP_CONTENT_SCROLL_MIN_WIDTH_PX = 821;

/**
 * Desktop layout: body locked; sidebar and main content each scroll independently.
 * Player stays fixed via existing .player { position: fixed } rules.
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

    .content {
      height: 100vh;
      overflow-y: auto;
      overflow-x: hidden;
      overscroll-behavior: auto;
      -webkit-overflow-scrolling: touch;
    }
  }
`;

export function shouldDesktopHorizontalRailCaptureWheel(event: WheelEvent, rail: HTMLElement) {
    if (rail.scrollWidth <= rail.clientWidth) {
        return false;
    }
    if (event.shiftKey) {
        return true;
    }
    return Math.abs(event.deltaX) > Math.abs(event.deltaY);
}

export function applyDesktopHorizontalRailWheel(event: WheelEvent, rail: HTMLElement) {
    if (!shouldDesktopHorizontalRailCaptureWheel(event, rail)) {
        return;
    }
    event.preventDefault();
    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    rail.scrollLeft += delta;
}

export function bindDesktopHorizontalRailWheel(track: HTMLElement | null) {
    if (!track) {
        return () => undefined;
    }
    const rail = track;
    function handleWheel(event: WheelEvent) {
        applyDesktopHorizontalRailWheel(event, rail);
    }
    rail.addEventListener("wheel", handleWheel, { passive: false });
    return () => rail.removeEventListener("wheel", handleWheel);
}
