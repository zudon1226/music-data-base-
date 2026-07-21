/**
 * Homepage recommendation / media card wrapping-grid contracts.
 * Run: node scripts/verify-homepage-card-grid.mjs
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
    return readFileSync(full, "utf8");
}

const page = read("app/page.tsx");
const lock = read("lib/ui/responsive-stability-lock.ts");
const pkg = read("package.json");

record(
    "home discovery uses wrapping grid markup (not horizontal rail)",
    page.includes('className="discovery-grid home-discovery-grid"')
        && (page.match(/home-discovery-grid/g) || []).length >= 5
        && page.includes('aria-label="For You Recommendations"')
        && !page.includes('<DesktopHorizontalRail className="discovery-grid" label="For You Recommendations">'),
);
record(
    "home discovery grid base is CSS grid full width",
    page.includes(".home-discovery-grid")
        && /home-discovery-grid[\s\S]{0,180}display:\s*grid/.test(page)
        && /home-discovery-grid[\s\S]{0,220}width:\s*100%/.test(page),
);
record(
    "tablet desktop shell uses 2 columns (821px+)",
    page.includes("grid-template-columns: repeat(2, minmax(0, 1fr)) !important")
        && lock.includes("gridColumnsTablet: 2"),
);
record(
    "standard desktop uses 3 columns (1100px+)",
    page.includes("@media (min-width: 1100px)")
        && page.includes("grid-template-columns: repeat(3, minmax(0, 1fr)) !important")
        && lock.includes("gridColumnsDesktop: 3"),
);
record(
    "wide desktop uses 4 columns (1440px+)",
    page.includes("@media (min-width: 1440px)")
        && page.includes("grid-template-columns: repeat(4, minmax(0, 1fr)) !important")
        && lock.includes("gridColumnsWide: 4"),
);
record(
    "home cards fill tracks without 218px cap",
    page.includes("max-width: none !important")
        && lock.includes('gridCardMaxWidth: "none"')
        && !page.includes("max-width: 218px !important"),
);
record(
    "equal card height and artwork geometry preserved",
    page.includes("grid-auto-rows: 220px !important")
        && page.includes("grid-template-rows: 96px minmax(0, 1fr) 34px !important")
        && page.includes("object-fit: cover !important"),
);
record(
    "home song/video/album rails convert to wrapping grid",
    page.includes('.artist-section:not(.discovery-section) .horizontal-rail-track.song-grid')
        && page.includes('.artist-section:not(.discovery-section) .horizontal-rail-track.video-grid')
        && page.includes('.artist-section:not(.discovery-section) .horizontal-rail-track.artist-album-grid')
        && page.includes('.artist-section:not(.discovery-section) .rail-arrow'),
);
record(
    "list mode stays single-column full width",
    page.includes('.zml-app.view-list[data-active-view="Home"] .discovery-section .discovery-grid')
        && /view-list\[data-active-view="Home"\][\s\S]{0,220}grid-template-columns:\s*1fr !important/.test(page),
);
record(
    "mobile narrow override keeps single column",
    page.includes("@media (max-width: 430px)")
        && /discovery-grid[\s\S]{0,80}grid-template-columns:\s*1fr !important/.test(page),
);
record(
    "no card markup duplication helper",
    (page.match(/function renderDiscoveryItemCard/g) || []).length === 1
        && page.includes("trendingDiscoveryItems.map(renderDiscoveryItemCard)"),
);
record(
    "subscription section remains present after discovery",
    page.includes(".subscription-section")
        && (page.includes("SubscriptionBillingPanel") || page.includes("subscription")),
);
record(
    "library carousel rail display:grid still present for non-home rails",
    page.includes(".horizontal-rail-track.discovery-grid")
        && /horizontal-rail-track\.video-grid,[\s\S]{0,280}horizontal-rail-track\.discovery-grid \{\s*display:\s*grid;/.test(page),
);
record(
    "package can run focused homepage card grid verify",
    pkg.includes("verify:layout")
        && existsSync(path.join(root, "scripts/verify-homepage-card-grid.mjs")),
);

const failed = results.filter((row) => !row.ok).length;
console.log(`\nHOMEPAGE_CARD_GRID_FAILS=${failed}`);
process.exit(failed ? 1 : 0);
