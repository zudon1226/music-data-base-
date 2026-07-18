/**
 * Centralized UI shell tokens + polish rules for the SPA content area.
 * Injected globally (plain <style>) so production builds always ship them.
 * Does not replace nav-scroll / header-offset / RTL shell systems.
 */

export const APP_UI_SHELL_CSS = `
  :root {
    --ui-space-1: 4px;
    --ui-space-2: 8px;
    --ui-space-3: 12px;
    --ui-space-4: 16px;
    --ui-space-5: 20px;
    --ui-space-6: 24px;
    --ui-radius-sm: 8px;
    --ui-radius-md: 12px;
    --ui-radius-lg: 16px;
    --ui-touch-min: 44px;
    --ui-title-size: 1.45rem;
    --ui-title-line: 1.2;
    --ui-subtitle-size: 0.84rem;
    --ui-subtitle-line: 1.4;
    --ui-heading-gap: 6px;
    --ui-heading-margin-bottom: 14px;
    --ui-content-pad-x: 14px;
    --ui-content-pad-top: 14px;
    --ui-card-pad: 12px;
    --ui-card-gap: 10px;
    --ui-focus-ring: 0 0 0 2px rgba(34, 211, 238, 0.95);
    --ui-focus-ring-offset: 0 0 0 2px rgba(2, 6, 23, 0.9);
    --ui-text-muted: #a9bed6;
    --ui-panel-border: rgba(0, 212, 255, 0.28);
  }

  /* ---- Content shell padding (aligned L/R, player clearance preserved) ---- */
  .content.desktop-content-scroll-root {
    padding-left: var(--ui-content-pad-x) !important;
    padding-right: var(--ui-content-pad-x) !important;
    box-sizing: border-box;
  }

  /* ---- Canonical destination page heading ---- */
  .content .section-heading,
  .content .destination-page-heading {
    display: flex !important;
    align-items: flex-end !important;
    justify-content: space-between !important;
    gap: var(--ui-space-3) !important;
    flex-wrap: wrap !important;
    margin: 0 0 var(--ui-heading-margin-bottom) !important;
    padding-top: 0 !important;
    min-width: 0;
  }

  .content .section-heading > div,
  .content .destination-page-heading > div {
    min-width: 0;
    flex: 1 1 auto;
  }

  .content .section-heading h2,
  .content .section-heading [data-page-heading],
  .content .destination-page-heading h2,
  .content .destination-page-heading [data-page-heading] {
    margin: 0 !important;
    font-size: var(--ui-title-size) !important;
    line-height: var(--ui-title-line) !important;
    font-weight: 700 !important;
    letter-spacing: -0.01em;
    overflow-wrap: anywhere;
  }

  .content .section-heading p,
  .content .destination-page-heading p {
    margin: var(--ui-heading-gap) 0 0 !important;
    color: var(--ui-text-muted) !important;
    font-size: var(--ui-subtitle-size) !important;
    line-height: var(--ui-subtitle-line) !important;
    max-width: 62ch;
  }

  /* Secondary hero leads under the canonical title — not competing h2s */
  .destination-hero-lead,
  .sales-hero .destination-hero-lead,
  .marketplace-hero .destination-hero-lead,
  .license-history-hero .destination-hero-lead {
    margin: 0 !important;
    font-size: 1.05rem !important;
    line-height: 1.35 !important;
    font-weight: 650 !important;
    color: #e8f4ff !important;
  }

  .sales-hero h2,
  .marketplace-hero h2,
  .license-history-hero h2 {
    /* Legacy fallback if any h2 remains */
    font-size: 1.05rem !important;
    line-height: 1.35 !important;
  }

  /* ---- Buttons / controls: touch + focus ---- */
  .content button,
  .topbar button,
  .sidebar button,
  .player button,
  .music-bottom-player button,
  .fixed-mobile-player button {
    border-radius: var(--ui-radius-sm);
  }

  .topbar .topbar-account-actions .upload-btn,
  .topbar .topbar-account-actions .dashboard-btn,
  .topbar .topbar-account-actions .producer-dashboard-btn,
  .topbar .topbar-account-actions .profile-btn,
  .topbar .topbar-account-actions .logout-btn,
  .topbar .topbar-account-actions .notification-button,
  .sidebar .desktop-sidebar-nav button,
  .sidebar .logo,
  .content .save-upload,
  .content .clear-recent,
  .content .dashboard-nav-row button,
  .content .hero-buttons .sub-btn,
  .content .sales-actions button,
  .content .danger-btn {
    min-height: var(--ui-touch-min);
    min-width: var(--ui-touch-min);
  }

  .content .song-card button,
  .content .video-card button,
  .content .media-card button,
  .content .library-card button,
  .content .discovery-card button,
  .content .artist-card button,
  .content .play-btn,
  .content .like-btn,
  .content .queue-btn,
  .content .follow-btn,
  .content .library-btn,
  .content .playlist-btn {
    min-height: var(--ui-touch-min);
    min-width: var(--ui-touch-min);
  }

  .zml-app button:focus-visible,
  .zml-app a:focus-visible,
  .zml-app input:focus-visible,
  .zml-app select:focus-visible,
  .zml-app textarea:focus-visible,
  .zml-app [tabindex]:focus-visible {
    outline: none;
    box-shadow: var(--ui-focus-ring-offset), var(--ui-focus-ring);
  }

  .zml-app button:disabled,
  .zml-app button[aria-disabled="true"] {
    opacity: 0.55;
    cursor: not-allowed;
  }

  /* ---- Cards / panels ---- */
  .content .song-card,
  .content .video-card,
  .content .media-card,
  .content .library-card,
  .content .discovery-card,
  .content .artist-card,
  .content .dashboard-panel,
  .content .artist-section,
  .content .upload-card,
  .content .video-upload-card,
  .content .plan-card,
  .content .sponsor-card {
    border-radius: var(--ui-radius-md);
  }

  .content .dashboard-panel,
  .content .artist-section,
  .content .sales-panel,
  .content .upload-card,
  .content .video-upload-card {
    padding: var(--ui-card-pad);
    gap: var(--ui-card-gap);
  }

  .content .song-card strong,
  .content .video-card strong,
  .content .media-card strong,
  .content .library-card strong,
  .content .discovery-card strong,
  .content .artist-card strong,
  .content .song-card small,
  .content .video-card small,
  .content .media-card small {
    overflow-wrap: anywhere;
    word-break: break-word;
  }

  .content .song-grid,
  .content .video-grid,
  .content .media-grid {
    gap: var(--ui-card-gap);
  }

  /* Bottom player clearance for last content blocks */
  .content .sales-page,
  .content .marketplace-page,
  .content .license-history-page,
  .content .dashboard-page,
  .content .profile-page,
  .content .queue-page,
  .content .liked-page,
  .content .playlist-workspace,
  .content .ringtone-creator-page,
  .content .ringtone-marketplace-page,
  .content .video-page {
    padding-bottom: var(--ui-space-4);
  }

  /* Forms: usable labels */
  .content label {
    display: inline-flex;
    flex-direction: column;
    gap: var(--ui-space-1);
    min-width: 0;
  }

  .content input,
  .content select,
  .content textarea {
    min-height: var(--ui-touch-min);
    border-radius: var(--ui-radius-sm);
  }

  .content input[type="checkbox"],
  .content input[type="radio"] {
    width: 20px;
    height: 20px;
    min-height: 20px;
    min-width: 20px;
  }

  /* Prevent horizontal page overflow in the main shell */
  .content.desktop-content-scroll-root,
  .content.desktop-content-scroll-root .section-heading,
  .content.desktop-content-scroll-root .destination-page-heading,
  .content.desktop-content-scroll-root .sales-page,
  .content.desktop-content-scroll-root .marketplace-page,
  .content.desktop-content-scroll-root .dashboard-page {
    max-width: 100%;
    overflow-x: clip;
  }

  /* Horizontal rails remain intentionally scrollable */
  .content .horizontal-rail-track,
  .content .desktop-horizontal-rail,
  .content [data-horizontal-rail] {
    overflow-x: auto;
    overflow-y: clip;
    max-width: 100%;
  }

  @media (max-width: 1024px) {
    :root {
      --ui-content-pad-x: 12px;
      --ui-title-size: 1.35rem;
    }
  }

  @media (max-width: 820px) {
    :root {
      --ui-content-pad-x: 10px;
      --ui-title-size: 1.28rem;
      --ui-heading-margin-bottom: 12px;
    }

    .content .section-heading,
    .content .destination-page-heading {
      align-items: stretch !important;
      flex-direction: column !important;
    }

    .content .dashboard-nav-row {
      display: flex;
      flex-wrap: wrap;
      gap: var(--ui-space-2);
    }

    .content .dashboard-nav-row button {
      flex: 1 1 calc(50% - var(--ui-space-2));
    }
  }

  @media (max-width: 768px) {
    :root {
      --ui-content-pad-x: 10px;
      --ui-title-size: 1.22rem;
    }

    /* Prefer measured header offset over hard-coded transforms for title clearance */
    .content .topbar {
      transform: none !important;
    }
  }
`;
