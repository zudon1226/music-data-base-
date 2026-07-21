#!/usr/bin/env node
/**
 * Responsive UI stability lock — static verification.
 * Freezes approved desktop/mobile breakpoints, chrome, hero, cards, player, Profile.
 * Run: npm run verify:layout
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const results = [];

function record(name, ok, detail = "") {
    results.push({ name, ok: Boolean(ok), detail: String(detail || "") });
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

function read(rel) {
    const full = path.join(root, rel);
    if (!existsSync(full)) return "";
    // Normalize CRLF so CSS block extractors stay stable on Windows checkouts.
    return readFileSync(full, "utf8").replace(/\r\n/g, "\n");
}

function extractBetween(src, startMarker, endMarker) {
    const start = src.indexOf(startMarker);
    if (start < 0) return "";
    const end = src.indexOf(endMarker, start + startMarker.length);
    return end > start ? src.slice(start, end) : src.slice(start, start + 4000);
}

console.log("Responsive UI stability lock — static verification\n");

const lockFile = read("lib/ui/responsive-stability-lock.ts");
const page = read("app/page.tsx");
const scroll = read("lib/desktop-content-scroll.ts");
const rail = read("lib/desktop-library-card-rail-scroll.ts");
const i18n = read("lib/i18n/i18n-styles.ts");
const globals = read("app/globals.css");
const pkg = read("package.json");
const docs = read("docs/responsive-ui-stability-lock.md");
const language = read("components/language-selector.tsx");
const profileDash = read("components/user-profile-dashboard.tsx");

record("lock constants file exists", lockFile.includes("RESPONSIVE_STABILITY_LOCK"));
record("lock policy doc exists", docs.includes("Responsive UI stability lock") && docs.includes("verify:layout"));
record("package has verify:layout", pkg.includes('"verify:layout"'));
record("package has verify:ui-all", pkg.includes('"verify:ui-all"'));

// --- Breakpoints ---
record(
    "desktop min-width frozen at 821",
    lockFile.includes("desktopMinWidthPx: 821")
        && scroll.includes("DESKTOP_CONTENT_SCROLL_MIN_WIDTH_PX = 821")
        && rail.includes("DESKTOP_LIBRARY_CARD_RAIL_MIN_WIDTH_PX = 821")
        && page.includes("@media (min-width: 821px)"),
);
record(
    "mobile max-width frozen at 820",
    lockFile.includes("mobileMaxWidthPx: 820")
        && page.includes("@media (max-width: 820px)")
        && page.includes('(max-width: 820px), (pointer: coarse)'),
);
record(
    "narrow mobile max-width frozen at 768",
    lockFile.includes("narrowMobileMaxWidthPx: 768")
        && page.includes("@media (max-width: 768px)")
        && page.includes('(max-width: 768px)'),
);
record(
    "tiny mobile profile stack at 340",
    lockFile.includes("tinyMobileMaxWidthPx: 340")
        && page.includes("@media (max-width: 340px)")
        && /@media \(max-width: 340px\)[\s\S]{0,120}\.profile-actions/.test(page),
);

// --- Sidebar ---
const sidebarBlock = extractBetween(page, "\n          .sidebar {", "\n          .desktop-sidebar-nav");
record(
    "desktop sidebar width/position frozen",
    lockFile.includes("desktopWidthPx: 188")
        && page.includes("--desktop-sidebar-width: 188px")
        && /width:\s*188px/.test(sidebarBlock)
        && /position:\s*fixed/.test(sidebarBlock)
        && /left:\s*0/.test(sidebarBlock)
        && /top:\s*0/.test(sidebarBlock),
);
record(
    "content offset matches sidebar width",
    /margin-left:\s*188px/.test(page)
        && /width:\s*calc\(100% - 188px\)/.test(page),
);
record(
    "mobile sidebar width token frozen at 64px",
    lockFile.includes("mobileWidthPx: 64")
        && /--mobile-sidebar-width:\s*64px/.test(page)
        && page.includes("width: var(--mobile-sidebar-width)")
        && page.includes("left: var(--mobile-sidebar-width) !important"),
);

// --- Top navigation / search / view toggle / language ---
const topbarBlock = extractBetween(page, "\n          .topbar {", "\n          .topbar-account-actions");
record(
    "topbar grid template frozen",
    lockFile.includes('gridTemplateColumns: "minmax(0, 1.15fr) minmax(0, 0.7fr) auto"')
        && /grid-template-columns:\s*minmax\(0,\s*1\.15fr\)\s+minmax\(0,\s*0\.7fr\)\s+auto/.test(topbarBlock)
        && /position:\s*sticky/.test(topbarBlock)
        && /top:\s*0/.test(topbarBlock)
        && /gap:\s*8px/.test(topbarBlock),
);

const searchBlock = extractBetween(page, "\n          .search-box {", "\n          .search-box input");
record(
    "search bar sizing frozen",
    lockFile.includes("heightPx: 41")
        && /height:\s*41px/.test(searchBlock)
        && /border-radius:\s*8px/.test(searchBlock)
        && /padding:\s*0 13px/.test(searchBlock),
);

const viewToggleBlock = extractBetween(page, "\n          .view-toggle {", "\n          .view-toggle button");
record(
    "Grid/List toggle sizing frozen",
    lockFile.includes("viewToggle")
        && /height:\s*41px/.test(viewToggleBlock)
        && /grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/.test(viewToggleBlock)
        && /gap:\s*6px/.test(viewToggleBlock),
);

record(
    "language selector placement + height frozen",
    page.includes('className="topbar-language-selector"')
        && page.includes(".search-wrap .topbar-language-selector")
        && language.includes("LanguageSelector")
        && /height:\s*41px/.test(i18n)
        && /min-height:\s*41px/.test(i18n)
        && i18n.includes(".language-selector-compact .language-selector-trigger"),
);

// --- Global player ---
record(
    "global player heights frozen (88 / 52)",
    lockFile.includes("expandedHeightPx: 88")
        && lockFile.includes("collapsedHeightPx: 52")
        && page.includes("GLOBAL_PLAYER_HEIGHT_EXPANDED_PX = 88")
        && page.includes("GLOBAL_PLAYER_HEIGHT_COLLAPSED_PX = 52")
        && page.includes("--global-player-height-expanded")
        && page.includes("--global-player-height-collapsed")
        && page.includes("player-collapse-toggle")
        && page.includes("togglePlayerCollapsed"),
);
record(
    "desktop player clearance + collapse behavior preserved",
    scroll.includes("--desktop-player-clearance")
        && scroll.includes("global-player-height-collapsed, 52px")
        && scroll.includes("minmax(0, 1fr) 40px 36px")
        && scroll.includes("height: var(--global-player-height) !important")
        && globals.includes("minmax(0, 1fr) 44px 44px"),
);

// --- Hero ---
const heroBlock = extractBetween(page, "\n          .hero {", "\n          .hero p");
const sponsorBlock = extractBetween(page, "\n          .sponsor-media {", "\n          .sponsor-media img");
record(
    "desktop hero banner dimensions frozen",
    lockFile.includes("desktopMinHeightPx: 210")
        && /min-height:\s*210px/.test(heroBlock)
        && /padding:\s*24px 22px/.test(heroBlock)
        && page.includes("max-height: 170px")
        && /min-height:\s*230px/.test(sponsorBlock),
);
record(
    "mobile hero compact block preserved",
    page.includes("/* Home hero — compact at narrow widths so Recommended clears the player. */")
        && /Home hero — compact[\s\S]{0,500}\.hero[\s\S]{0,220}padding:\s*12px 12px 14px/.test(page)
        && /Home hero — compact[\s\S]{0,900}hero-logo[\s\S]{0,160}max-height:\s*72px/.test(page),
);

// --- Home recommendation + trending discovery cards ---
const homeDiscovery = extractBetween(
    page,
    "Home recommendation cards — clean equal-height layout (desktop).",
    ".subscription-section",
);
record(
    "Home recommendation grid card geometry frozen",
    lockFile.includes("gridCardHeightPx: 220")
        && lockFile.includes('gridCardMaxWidth: "none"')
        && homeDiscovery.includes("grid-auto-rows: 220px !important")
        && homeDiscovery.includes("height: 220px !important")
        && homeDiscovery.includes("max-width: none !important")
        && homeDiscovery.includes("grid-template-rows: 96px minmax(0, 1fr) 34px !important")
        && homeDiscovery.includes("gap: 12px !important")
        && homeDiscovery.includes("grid-template-columns: repeat(2, minmax(0, 1fr)) !important"),
);
record(
    "Home recommendation list card geometry frozen",
    lockFile.includes("listCardHeightPx: 92")
        && homeDiscovery.includes("grid-auto-rows: 92px !important")
        && homeDiscovery.includes("height: 92px !important")
        && homeDiscovery.includes("width: 116px !important")
        && homeDiscovery.includes("gap: 10px !important"),
);
record(
    "Home discovery lock scoped (does not retarget Library song cards)",
    homeDiscovery.includes('data-active-view="Home"')
        && homeDiscovery.includes(".discovery-section")
        && !homeDiscovery.includes(".song-card"),
);
record(
    "Trending discovery cards use shared discovery-card renderer",
    page.includes("trendingDiscoveryItems.map(renderDiscoveryItemCard)")
        && page.includes('className="discovery-card"')
        && page.includes('view === "Trending"'),
);
record(
    "rail stretch guard still rejects viewport-tall cards",
    scroll.includes("horizontal-rail-track > *")
        && scroll.includes("align-self: start !important")
        && scroll.includes("height: auto !important")
        && !/\.horizontal-rail-track\s*>\s*\*[\s\S]{0,120}min-height:\s*100%/.test(page),
);

// --- Profile ---
const profileActions = extractBetween(page, "\n          .profile-actions {", "\n          .profile-actions button");
record(
    "Profile Edit/Logout desktop gap frozen",
    lockFile.includes("desktopGapPx: 10")
        && /display:\s*flex/.test(profileActions)
        && /gap:\s*10px/.test(profileActions)
        && /flex-wrap:\s*nowrap/.test(profileActions)
        && profileDash.includes('className="profile-actions"')
        && profileDash.includes("onLogout"),
);
const mobileProfileActions = extractBetween(page, "\n            .profile-actions {\n", "\n            .profile-actions button");
record(
    "Profile mobile Edit/Logout grid gap frozen",
    /display:\s*grid\s*!important/.test(mobileProfileActions)
        && /gap:\s*8px\s*!important/.test(mobileProfileActions)
        && /grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)\s*!important/.test(mobileProfileActions),
);

// --- Shared layout isolation reminder markers ---
record(
    "desktop scroll root padding-top flush preserved",
    scroll.includes("padding-top: 0 !important")
        && scroll.includes("padding-bottom: var(--desktop-player-clearance) !important"),
);
record(
    "mobile content padding-top flush preserved",
    page.includes("padding: 0 10px var(--mobile-player-reserve) !important")
        || /padding:\s*0 10px var\(--mobile-player-reserve\)\s*!important/.test(page),
);

const failed = results.filter((row) => !row.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
if (failed) {
    console.log("\nResponsive stability lock failed. Update lib/ui/responsive-stability-lock.ts");
    console.log("and docs/responsive-ui-stability-lock.md only with an explicit layout task.\n");
    process.exit(1);
}
console.log("✓ Responsive UI stability lock passed.\n");
process.exit(0);
