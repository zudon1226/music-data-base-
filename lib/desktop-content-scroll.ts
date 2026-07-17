/** DESKTOP ONLY — native browser scroll for content and shared card containers. */

export const DESKTOP_CONTENT_SCROLL_MIN_WIDTH_PX = 821;

/**
 * Desktop layout: body locked; main content scrolls natively.
 * Uses !important so page.tsx shell rules cannot expand .content to full
 * document height (which forces window/document scrolling instead).
 * No wheel listeners, no preventDefault, no synthetic scroll.
 */
export const DESKTOP_CONTENT_SCROLL_CSS = `
  @media (min-width: ${DESKTOP_CONTENT_SCROLL_MIN_WIDTH_PX}px) {
    html,
    body {
      height: 100% !important;
      max-height: 100% !important;
      overflow: hidden !important;
    }

    .zml-app {
      height: 100vh !important;
      max-height: 100vh !important;
      min-height: 100vh !important;
      overflow: hidden !important;
      padding-bottom: 0 !important;
    }

    .content.desktop-content-scroll-root {
      height: 100vh !important;
      max-height: 100vh !important;
      overflow-y: auto !important;
      overflow-x: hidden !important;
      overscroll-behavior: auto;
      scroll-behavior: auto;
      -webkit-overflow-scrolling: touch;
    }

    .content.desktop-content-scroll-root .horizontal-rail {
      overflow: visible;
    }

    .content.desktop-content-scroll-root .horizontal-rail-track {
      overflow-x: auto !important;
      overflow-y: clip !important;
      overscroll-behavior-x: contain;
      overscroll-behavior-y: auto !important;
      scroll-behavior: auto !important;
      scroll-snap-type: none !important;
      touch-action: auto;
    }

    .content.desktop-content-scroll-root .horizontal-rail-track > * {
      scroll-snap-align: unset !important;
    }

    .content.desktop-content-scroll-root .song-card,
    .content.desktop-content-scroll-root .video-card,
    .content.desktop-content-scroll-root .media-card,
    .content.desktop-content-scroll-root .library-card,
    .content.desktop-content-scroll-root .artist-card,
    .content.desktop-content-scroll-root .artist-album-card,
    .content.desktop-content-scroll-root .artist-playlist-card,
    .content.desktop-content-scroll-root .discovery-card,
    .content.desktop-content-scroll-root .playlist-tile,
    .content.desktop-content-scroll-root .cover-wrap,
    .content.desktop-content-scroll-root .video-cover-wrap,
    .content.desktop-content-scroll-root .song-body,
    .content.desktop-content-scroll-root .video-card-body,
    .content.desktop-content-scroll-root .media-card-content {
      overscroll-behavior: auto;
      touch-action: auto;
    }

    .content.desktop-content-scroll-root .sponsor-media::after,
    .content.desktop-content-scroll-root .artist-banner::after {
      pointer-events: none !important;
    }
  }
`;
