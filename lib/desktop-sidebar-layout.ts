/** DESKTOP ONLY — sidebar/content/player stacking so nav clicks are never blocked. */

export const DESKTOP_SIDEBAR_LAYOUT_MIN_WIDTH_PX = 821;

export const DESKTOP_SIDEBAR_WIDTH_PX = 188;

/**
 * Desktop shell stacking:
 * - sidebar above content overlays and player
 * - modals above sidebar
 * - content never paints over the sidebar hit area
 */
export const DESKTOP_SIDEBAR_LAYOUT_CSS = `
  @media (min-width: ${DESKTOP_SIDEBAR_LAYOUT_MIN_WIDTH_PX}px) {
    .zml-app {
      position: relative;
      isolation: isolate;
    }

    .sidebar {
      position: fixed;
      left: 0;
      top: 0;
      bottom: 0;
      width: ${DESKTOP_SIDEBAR_WIDTH_PX}px;
      z-index: 130;
      pointer-events: auto;
      isolation: isolate;
    }

    .desktop-sidebar-nav,
    .desktop-sidebar-nav button,
    .sidebar .logo,
    .sidebar .reset-btn,
    .sidebar .queue-panel,
    .sidebar .mini-stats {
      pointer-events: auto;
    }

    .content.desktop-content-scroll-root,
    .content {
      position: relative;
      z-index: 1;
      margin-left: ${DESKTOP_SIDEBAR_WIDTH_PX}px;
      width: calc(100% - ${DESKTOP_SIDEBAR_WIDTH_PX}px);
      max-width: calc(100vw - ${DESKTOP_SIDEBAR_WIDTH_PX}px);
      box-sizing: border-box;
      pointer-events: auto;
      isolation: isolate;
    }

    .content.desktop-content-scroll-root::before,
    .content::before {
      content: none;
    }

    .topbar {
      z-index: 10;
    }

    .queue-drawer {
      z-index: 38;
    }

    .toast {
      z-index: 40;
    }

    .player,
    .video-player-bar,
    .music-bottom-player,
    .video-bottom-player,
    .bottom-player {
      z-index: 40;
      left: ${DESKTOP_SIDEBAR_WIDTH_PX}px;
      right: 0;
      pointer-events: auto;
    }

    .modal-backdrop {
      z-index: 200;
    }

    .horizontal-rail,
    .horizontal-rail-track,
    .desktop-library-card-rail,
    .song-card,
    .library-card,
    .media-card {
      pointer-events: auto;
    }
  }
`;
