/** DESKTOP ONLY — sidebar/content/player stacking so nav clicks are never blocked. */

export const DESKTOP_SIDEBAR_LAYOUT_MIN_WIDTH_PX = 821;

export const DESKTOP_SIDEBAR_WIDTH_PX = 188;

/**
 * Desktop shell stacking:
 * - sidebar above content overlays and player (clickable nav)
 * - modals above sidebar
 * - content clipped to the right of the sidebar column
 */
export const DESKTOP_SIDEBAR_LAYOUT_CSS = `
  @media (min-width: ${DESKTOP_SIDEBAR_LAYOUT_MIN_WIDTH_PX}px) {
    .zml-app {
      position: relative;
      isolation: isolate;
    }

    .sidebar {
      position: fixed !important;
      left: 0 !important;
      top: 0 !important;
      bottom: 0 !important;
      width: ${DESKTOP_SIDEBAR_WIDTH_PX}px !important;
      z-index: 200 !important;
      pointer-events: auto !important;
      isolation: isolate;
    }

    .desktop-sidebar-nav,
    .desktop-sidebar-nav button,
    .sidebar .logo,
    .sidebar .reset-btn,
    .sidebar .queue-panel,
    .sidebar .mini-stats,
    .sidebar .queue-list,
    .sidebar .queue-item {
      pointer-events: auto !important;
      touch-action: manipulation;
    }

    .content.desktop-content-scroll-root,
    .content {
      position: relative !important;
      z-index: 1 !important;
      margin-left: ${DESKTOP_SIDEBAR_WIDTH_PX}px !important;
      width: calc(100% - ${DESKTOP_SIDEBAR_WIDTH_PX}px) !important;
      max-width: calc(100vw - ${DESKTOP_SIDEBAR_WIDTH_PX}px) !important;
      box-sizing: border-box !important;
      pointer-events: auto !important;
      isolation: isolate;
    }

    .topbar {
      z-index: 10 !important;
    }

    .queue-drawer {
      z-index: 38 !important;
    }

    .toast {
      z-index: 40 !important;
    }

    .player,
    .video-player-bar,
    .music-bottom-player,
    .video-bottom-player,
    .bottom-player,
    .fixed-mobile-player {
      z-index: 40 !important;
      left: ${DESKTOP_SIDEBAR_WIDTH_PX}px !important;
      right: 0 !important;
      pointer-events: auto !important;
    }

    .modal-backdrop {
      z-index: 300 !important;
    }
  }
`;
