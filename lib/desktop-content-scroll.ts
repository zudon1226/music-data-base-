/** DESKTOP ONLY — native browser scroll for content and shared card containers. */

export const DESKTOP_CONTENT_SCROLL_MIN_WIDTH_PX = 821;

/**
 * Desktop layout: body locked; main content scrolls natively.
 * Uses !important so page.tsx shell rules cannot expand .content to full
 * document height (which forces window/document scrolling instead).
 * No wheel listeners, no preventDefault, no synthetic scroll.
 *
 * Desktop player clearance (clean replacement):
 * --desktop-player-clearance tracks --global-player-height (+ 12px) and is
 * applied ONLY to the shared main scroll container. Player is flush to the
 * app bottom and stays clear of the browser scrollbar gutter.
 */
export const DESKTOP_CONTENT_SCROLL_CSS = `
  @media (min-width: ${DESKTOP_CONTENT_SCROLL_MIN_WIDTH_PX}px) {
    :root {
      --desktop-player-clearance: calc(var(--global-player-height, 0px) + 12px);
    }

    html[data-player-collapsed="true"],
    html.player-collapsed {
      --desktop-player-clearance: calc(var(--global-player-height-collapsed, 52px) + 12px);
    }

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
      /* Restore toolbar flush to content top (undo content padding-top gap only) */
      padding-top: 0 !important;
      padding-bottom: var(--desktop-player-clearance) !important;
      scroll-padding-bottom: var(--desktop-player-clearance) !important;
    }

    /* Flush dock at app bottom; never enter the scrollbar gutter (≥16px). */
    .player,
    .video-player-bar {
      bottom: 0 !important;
      right: max(16px, var(--player-scrollbar-gutter, 20px)) !important;
      max-width: calc(
        100vw
        - var(--desktop-sidebar-width, 188px)
        - var(--player-dock-inset-inline, 12px)
        - max(16px, var(--player-scrollbar-gutter, 20px))
      ) !important;
    }

    /*
      Desktop collapse — clean replacement at the desktop scroll/player source.
      Expanded: keep live height token (unchanged dock chrome).
      Collapsed: physically shrink to the collapsed height token and show only
      artwork | title | play | expand. Never keep an expanded-tall shell.
    */
    .player:not(.is-collapsed),
    .video-player-bar:not(.is-collapsed) {
      height: var(--global-player-height) !important;
      min-height: var(--global-player-height) !important;
      max-height: var(--global-player-height) !important;
    }

    .player.is-collapsed,
    .video-player-bar.is-collapsed {
      height: var(--global-player-height-collapsed, 52px) !important;
      min-height: var(--global-player-height-collapsed, 52px) !important;
      max-height: var(--global-player-height-collapsed, 52px) !important;
      /* art+title | play | expand — no leftover expanded grid tracks */
      grid-template-columns: minmax(0, 1fr) 40px 36px !important;
      grid-template-rows: 1fr !important;
      gap: 8px !important;
      padding: 6px 10px !important;
      align-items: center !important;
      overflow: hidden !important;
      box-sizing: border-box !important;
    }

    .player.is-collapsed .player-side,
    .video-player-bar.is-collapsed .video-player-side,
    .player.is-collapsed .progress-row,
    .video-player-bar.is-collapsed .progress-row,
    .video-player-bar.is-collapsed .video-progress-row,
    .player.is-collapsed .player-album-meta,
    .video-player-bar.is-collapsed .player-album-meta,
    .player.is-collapsed .artist-name,
    .video-player-bar.is-collapsed .artist-name,
    .player.is-collapsed .player-controls > button:not(.main-play),
    .video-player-bar.is-collapsed .video-player-controls > button:not(.main-play) {
      display: none !important;
    }

    .player.is-collapsed .player-center,
    .video-player-bar.is-collapsed .video-player-center,
    .player.is-collapsed .player-controls,
    .video-player-bar.is-collapsed .video-player-controls {
      display: contents !important;
    }

    .player.is-collapsed .player-song,
    .player.is-collapsed .player-main,
    .video-player-bar.is-collapsed .video-player-now,
    .video-player-bar.is-collapsed .player-main {
      display: flex !important;
      align-items: center !important;
      gap: 8px !important;
      min-width: 0 !important;
      max-height: 100% !important;
      overflow: hidden !important;
    }

    .player.is-collapsed .main-play,
    .video-player-bar.is-collapsed .main-play {
      width: 40px !important;
      height: 40px !important;
      min-width: 40px !important;
      min-height: 40px !important;
      max-width: 40px !important;
      max-height: 40px !important;
    }

    .player.is-collapsed .player-collapse-toggle,
    .video-player-bar.is-collapsed .player-collapse-toggle {
      width: 36px !important;
      height: 36px !important;
      min-width: 36px !important;
      min-height: 36px !important;
      max-width: 36px !important;
      max-height: 36px !important;
    }

    .player.is-collapsed .player-song img,
    .video-player-bar.is-collapsed .video-player-now img {
      width: 36px !important;
      height: 36px !important;
      flex-shrink: 0 !important;
    }

    .player.is-collapsed .song-title,
    .video-player-bar.is-collapsed .track-title {
      display: block !important;
      white-space: nowrap !important;
      overflow: hidden !important;
      text-overflow: ellipsis !important;
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
