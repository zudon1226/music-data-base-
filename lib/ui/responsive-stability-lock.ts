/**
 * Responsive UI stability lock — approved layout freeze.
 *
 * These values match the visually approved desktop + mobile shell.
 * Do NOT change them casually. Feature work must isolate layout changes
 * to feature-scoped components and must not edit shared page containers,
 * global CSS, breakpoints, or chrome (sidebar / topbar / player).
 *
 * Enforced by: `npm run verify:layout`
 * Policy: `docs/responsive-ui-stability-lock.md`
 */

export const RESPONSIVE_STABILITY_LOCK = {
    /** Desktop scroll + library rail + Home discovery equal-height cards */
    desktopMinWidthPx: 821,
    /** Primary mobile chrome breakpoint (sidebar collapse, player reserve) */
    mobileMaxWidthPx: 820,
    /** Narrow mobile layout contracts (Recently Played / Queue / Profile / hero) */
    narrowMobileMaxWidthPx: 768,
    /** Profile Edit/Logout stack to single column */
    tinyMobileMaxWidthPx: 340,

    sidebar: {
        desktopWidthPx: 188,
        /** `--mobile-sidebar-width` at max-width 820px */
        mobileWidthPx: 64,
        desktopPosition: "fixed" as const,
        desktopLeftPx: 0,
        desktopTopPx: 0,
    },

    content: {
        desktopMarginLeftPx: 188,
        desktopPaddingInlinePx: 14,
        desktopPaddingTopPx: 14,
    },

    topbar: {
        /** Search | Grid/List | account actions */
        gridTemplateColumns: "minmax(0, 1.15fr) minmax(0, 0.7fr) auto",
        gapPx: 8,
        stickyTopPx: 0,
        accountActionsGapPx: 8,
    },

    searchBox: {
        heightPx: 41,
        borderRadiusPx: 8,
        paddingInlinePx: 13,
    },

    viewToggle: {
        heightPx: 41,
        gapPx: 6,
        columns: 2,
    },

    languageSelector: {
        triggerHeightPx: 41,
        compactPaddingInlinePx: 8,
        topbarClassName: "topbar-language-selector",
    },

    player: {
        expandedHeightPx: 88,
        collapsedHeightPx: 52,
        dockInsetBottomPx: 12,
        dockInsetInlinePx: 12,
        dockRadiusPx: 16,
        scrollbarGutterMinPx: 20,
        collapsedDesktopGrid: "minmax(0, 1fr) 40px 36px",
        collapsedMobileGrid: "minmax(0, 1fr) 44px 44px",
    },

    hero: {
        desktopMinHeightPx: 210,
        desktopPadding: "24px 22px",
        desktopLogoMaxHeightPx: 170,
        sponsorMediaMinHeightPx: 230,
        mobileHeroPadding: "12px 12px 14px",
        mobileLogoMaxHeightPx: 72,
    },

    homeDiscoveryCards: {
        gridCardHeightPx: 220,
        gridCardMaxWidthPx: 218,
        gridArtHeightPx: 96,
        gridActionHeightPx: 34,
        gridGapPx: 12,
        listCardHeightPx: 92,
        listArtWidthPx: 116,
        listGapPx: 10,
    },

    profileActions: {
        desktopDisplay: "flex",
        desktopGapPx: 10,
        mobileDisplay: "grid",
        mobileGapPx: 8,
        mobileColumns: "repeat(2, minmax(0, 1fr))",
    },
} as const;

export type ResponsiveStabilityLock = typeof RESPONSIVE_STABILITY_LOCK;
