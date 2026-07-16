/** Global styles for language selector and RTL shell. */
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
  }

  .language-selector-open {
    z-index: 10060;
  }

  .language-selector-trigger {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 34px;
    padding: 0 10px;
    border-radius: 8px;
    border: 1px solid rgba(0, 212, 255, 0.35);
    background: #0b1736;
    color: #e2f3ff;
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
    touch-action: manipulation;
  }

  .language-selector-compact .language-selector-trigger {
    padding: 0 8px;
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

  .mdb-rtl-shell .language-selector-panel {
    right: auto;
    left: 0;
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

  .mdb-rtl-shell .topbar,
  .mdb-rtl-shell .sidebar,
  .mdb-rtl-shell .section-heading,
  .mdb-rtl-shell .player,
  .mdb-rtl-shell .video-player-bar {
    direction: rtl;
  }

  .mdb-rtl-shell .search-box input,
  .mdb-rtl-shell .auth-form input,
  .mdb-rtl-shell .language-selector-search input {
    direction: ltr;
    text-align: start;
  }

  .mdb-rtl-shell .player-controls,
  .mdb-rtl-shell .player-center,
  .mdb-rtl-shell .player-song,
  .mdb-rtl-shell .desktop-sidebar-nav button {
    direction: ltr;
  }

  @media (max-width: 900px) {
    .topbar .language-selector {
      order: -1;
    }
  }
`;
