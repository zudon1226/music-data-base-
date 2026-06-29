/** DESKTOP ONLY — Library Grid View carousel CSS (native scroll only). */

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
      overflow-y: clip !important;
      overscroll-behavior-x: contain;
      overscroll-behavior-y: auto !important;
      scroll-behavior: auto !important;
      scroll-snap-type: none !important;
      touch-action: auto;
    }

    .zml-app.view-grid .${DESKTOP_LIBRARY_CARD_RAIL_ROOT_CLASS} .horizontal-rail-track > * {
      scroll-snap-align: unset !important;
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
      overscroll-behavior: auto;
      touch-action: auto;
    }
  }
`;
