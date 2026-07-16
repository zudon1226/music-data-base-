/** Global styles for language selector and permanent LTR application shell. */
export const I18N_GLOBAL_STYLES = `
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  .language-selector {
    position: relative;
    z-index: 140;
    min-width: 0;
    flex-shrink: 0;
  }

  .language-selector-open {
    z-index: 10060;
  }

  .language-selector-trigger {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    height: 41px;
    min-height: 41px;
    max-width: 100%;
    padding: 0 10px;
    border-radius: 8px;
    border: 1px solid rgba(34, 211, 238, 0.28);
    background: #14265c;
    color: #ffffff;
    font-size: 12px;
    font-weight: 900;
    line-height: 1;
    cursor: pointer;
    touch-action: manipulation;
    white-space: nowrap;
    transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease, box-shadow 0.15s ease;
  }

  .language-selector-compact .language-selector-trigger {
    padding: 0 8px;
  }

  .language-selector-globe {
    flex-shrink: 0;
  }

  .language-selector-label {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .language-selector-label-desktop {
    display: inline;
    max-width: 11ch;
  }

  .language-selector-label-mobile {
    display: none;
    font-size: 11px;
    letter-spacing: 0.04em;
  }

  .language-selector-chevron {
    flex-shrink: 0;
    opacity: 0.9;
    transition: transform 0.15s ease;
  }

  .language-selector-trigger:hover,
  .language-selector-trigger:focus-visible {
    background: #22d3ee;
    border-color: #22d3ee;
    color: #020617;
    outline: none;
  }

  .language-selector-trigger:focus-visible {
    box-shadow: 0 0 0 2px rgba(34, 211, 238, 0.35);
  }

  .language-selector-trigger.is-open,
  .language-selector-open .language-selector-trigger {
    background: #22d3ee;
    border-color: #22d3ee;
    color: #020617;
  }

  .language-selector-trigger.is-open .language-selector-chevron,
  .language-selector-open .language-selector-trigger .language-selector-chevron {
    transform: rotate(180deg);
  }

  .language-selector-backdrop {
    position: fixed;
    inset: 0;
    border: 0;
    margin: 0;
    padding: 0;
    background: rgba(2, 6, 23, 0.12);
    z-index: 10050;
    cursor: default;
    pointer-events: auto;
    opacity: 1;
  }

  .language-selector-panel {
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    width: min(280px, 88vw);
    max-height: min(360px, 60vh);
    overflow: hidden;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    border: 1px solid rgba(0, 212, 255, 0.35);
    border-radius: 10px;
    background: #071631;
    box-shadow: 0 16px 40px rgba(0, 0, 0, 0.45);
    z-index: 10051;
    pointer-events: auto;
  }

  .language-selector-panel-portal {
    position: fixed;
    right: auto;
    top: auto;
    margin: 0;
  }

  .language-selector-search {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px;
    border-bottom: 1px solid rgba(0, 212, 255, 0.2);
    flex-shrink: 0;
  }

  .language-selector-search input {
    width: 100%;
    height: 32px;
    border: 1px solid #263c78;
    border-radius: 8px;
    background: #020617;
    color: white;
    padding: 0 10px;
    outline: none;
    pointer-events: auto;
  }

  .language-selector-panel ul {
    list-style: none;
    margin: 0;
    padding: 6px;
    overflow-y: auto;
    overflow-x: hidden;
    overscroll-behavior: contain;
    min-height: 0;
    -webkit-overflow-scrolling: touch;
  }

  .language-selector-panel li {
    margin: 0;
    padding: 0;
  }

  .language-selector-panel li button {
    width: 100%;
    display: grid;
    gap: 2px;
    text-align: start;
    padding: 8px 10px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: white;
    cursor: pointer;
    pointer-events: auto;
    touch-action: manipulation;
    position: relative;
    z-index: 1;
  }

  .language-selector-panel li button strong,
  .language-selector-panel li button span {
    pointer-events: none;
  }

  .language-selector-panel li button:hover,
  .language-selector-panel li button.active,
  .language-selector-panel li button.focused {
    background: rgba(34, 211, 238, 0.14);
  }

  .language-selector-panel li button strong {
    font-size: 13px;
  }

  .language-selector-panel li button span {
    font-size: 11px;
    color: #9bdcf0;
  }

  .language-selector-empty {
    padding: 12px;
    color: #9bdcf0;
    font-size: 12px;
  }

  .profile-language-row {
    display: grid;
    gap: 8px;
    margin-top: 12px;
  }

  .profile-language-row .language-selector-label-desktop {
    max-width: 16ch;
  }

  /*
   * Permanent physical shell: never reverse chrome for RTL locales.
   * html[dir=rtl] / .mdb-rtl-shell may exist for text metadata, but layout stays LTR.
   */
  html[dir="rtl"] .zml-app,
  html[dir="rtl"] .sidebar,
  html[dir="rtl"] .topbar,
  html[dir="rtl"] .search-wrap,
  html[dir="rtl"] .view-toggle,
  html[dir="rtl"] .notification-wrap,
  html[dir="rtl"] .upload-btn,
  html[dir="rtl"] .dashboard-btn,
  html[dir="rtl"] .profile-btn,
  html[dir="rtl"] .logout-btn,
  html[dir="rtl"] .player,
  html[dir="rtl"] .video-player-bar,
  html[dir="rtl"] .music-bottom-player,
  html[dir="rtl"] .video-bottom-player,
  html[dir="rtl"] .bottom-player,
  html[dir="rtl"] .player-controls,
  html[dir="rtl"] .player-center,
  html[dir="rtl"] .player-song,
  html[dir="rtl"] .desktop-sidebar-nav,
  html[dir="rtl"] .desktop-sidebar-nav button,
  html[dir="rtl"] .nav,
  .mdb-app-shell,
  .mdb-rtl-shell,
  .mdb-ltr-shell,
  .mdb-rtl-shell .zml-app,
  .mdb-rtl-shell .sidebar,
  .mdb-rtl-shell .topbar,
  .mdb-rtl-shell .search-wrap,
  .mdb-rtl-shell .view-toggle,
  .mdb-rtl-shell .notification-wrap,
  .mdb-rtl-shell .upload-btn,
  .mdb-rtl-shell .dashboard-btn,
  .mdb-rtl-shell .profile-btn,
  .mdb-rtl-shell .logout-btn,
  .mdb-rtl-shell .player,
  .mdb-rtl-shell .video-player-bar,
  .mdb-rtl-shell .music-bottom-player,
  .mdb-rtl-shell .video-bottom-player,
  .mdb-rtl-shell .bottom-player,
  .mdb-rtl-shell .player-controls,
  .mdb-rtl-shell .player-center,
  .mdb-rtl-shell .player-song,
  .mdb-rtl-shell .desktop-sidebar-nav,
  .mdb-rtl-shell .desktop-sidebar-nav button,
  .mdb-rtl-shell .nav {
    direction: ltr !important;
  }

  html[dir="rtl"] .sidebar,
  .mdb-rtl-shell .sidebar {
    left: 0 !important;
    right: auto !important;
  }

  /* Natural RTL text inside labels, content, dialogs, and editable fields */
  html[dir="rtl"] .content,
  html[dir="rtl"] .section-heading,
  html[dir="rtl"] .language-selector-panel,
  html[dir="rtl"] .language-selector-panel li button,
  html[dir="rtl"] .notification-center,
  html[dir="rtl"] .modal,
  html[dir="rtl"] .modal-backdrop,
  html[dir="rtl"] .auth-shell,
  html[dir="rtl"] .auth-form,
  .mdb-rtl-shell .content,
  .mdb-rtl-shell .section-heading,
  .mdb-rtl-shell .language-selector-panel,
  .mdb-rtl-shell .language-selector-panel li button,
  .mdb-rtl-shell .notification-center,
  .mdb-rtl-shell .modal,
  .mdb-rtl-shell .modal-backdrop,
  .mdb-rtl-shell .auth-shell,
  .mdb-rtl-shell .auth-form {
    direction: rtl;
  }

  html[dir="rtl"] .search-box input,
  html[dir="rtl"] .auth-form input,
  html[dir="rtl"] .auth-form textarea,
  html[dir="rtl"] .language-selector-search input,
  html[dir="rtl"] .content input,
  html[dir="rtl"] .content textarea,
  .mdb-rtl-shell .search-box input,
  .mdb-rtl-shell .auth-form input,
  .mdb-rtl-shell .auth-form textarea,
  .mdb-rtl-shell .language-selector-search input,
  .mdb-rtl-shell .content input,
  .mdb-rtl-shell .content textarea {
    direction: rtl;
    text-align: start;
    unicode-bidi: plaintext;
  }

  /* Keep nav/header control glyphs and chrome text order stable while allowing localized words */
  html[dir="rtl"] .desktop-sidebar-nav button span,
  html[dir="rtl"] .topbar .upload-btn,
  html[dir="rtl"] .topbar .dashboard-btn,
  html[dir="rtl"] .topbar .profile-btn,
  html[dir="rtl"] .topbar .logout-btn,
  html[dir="rtl"] .view-toggle button,
  .mdb-rtl-shell .desktop-sidebar-nav button span,
  .mdb-rtl-shell .topbar .upload-btn,
  .mdb-rtl-shell .topbar .dashboard-btn,
  .mdb-rtl-shell .topbar .profile-btn,
  .mdb-rtl-shell .topbar .logout-btn,
  .mdb-rtl-shell .view-toggle button {
    unicode-bidi: plaintext;
  }

  @media (max-width: 900px) {
    .language-selector-label-desktop {
      display: none;
    }

    .language-selector-label-mobile {
      display: inline;
    }

    .language-selector-chevron {
      display: none !important;
    }

    .topbar .language-selector-trigger,
    .language-selector-compact .language-selector-trigger {
      height: 31px;
      min-height: 31px;
      padding: 0 7px;
      gap: 4px;
    }
  }

  @media (max-width: 820px) {
    .auth-language-selector .language-selector-trigger {
      height: 36px;
      min-height: 36px;
    }
  }
`;
