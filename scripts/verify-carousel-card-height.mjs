/**
 * Rejects desktop horizontal-rail / card stretch regressions that blow cards
 * up to viewport height after player-clearance work.
 * Run: node scripts/verify-carousel-card-height.mjs
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
const scroll = read("lib/desktop-content-scroll.ts");
const pkg = read("package.json");

function extractBlock(src, startMarker, endMarker) {
    const start = src.indexOf(startMarker);
    if (start < 0) return "";
    const end = src.indexOf(endMarker, start + startMarker.length);
    return end > start ? src.slice(start, end) : src.slice(start, start + 2500);
}

const railBlock = extractBlock(page, ".horizontal-rail {", ".rail-arrow:hover");
const trackTyped = extractBlock(
    page,
    ".horizontal-rail-track.video-grid,",
    ".horizontal-rail-track.video-grid,\n          .horizontal-rail-track.song-grid {",
);
const discoveryCard = extractBlock(page, ".discovery-card {", "@media (hover: hover)");
const songCard = extractBlock(page, "\n          .song-card {", ".cover-wrap {");

record(
    "rail viewport uses content height",
    /height:\s*auto/.test(railBlock) && /min-height:\s*0/.test(railBlock) && /align-items:\s*start/.test(railBlock),
);
record(
    "rail track align-items start (not stretch)",
    page.includes(".horizontal-rail-track")
        && /align-items:\s*start/.test(railBlock)
        && !/\.horizontal-rail-track\s*>\s*\*[\s\S]{0,120}min-height:\s*100%/.test(page),
);
record(
    "rail slides not stretched to 100%",
    /\.horizontal-rail-track\s*>\s*\*[\s\S]{0,160}align-self:\s*start/.test(page)
        && /\.horizontal-rail-track\s*>\s*\*[\s\S]{0,200}min-height:\s*0/.test(page)
        && !/\.horizontal-rail-track\s*>\s*\*[\s\S]{0,160}min-height:\s*100%/.test(page),
);
record(
    "rail cards height auto (no height 100%)",
    /\.horizontal-rail-track \.song-card[\s\S]{0,500}height:\s*auto/.test(page)
        && /\.horizontal-rail-track \.discovery-card[\s\S]{0,400}min-height:\s*0/.test(page)
        && !/\.horizontal-rail-track \.song-card[\s\S]{0,500}height:\s*100%/.test(page),
);
record(
    "typed rail tracks use grid-auto-rows auto / align start",
    page.includes("grid-auto-rows: auto")
        && /horizontal-rail-track\.discovery-grid[\s\S]{0,220}align-items:\s*start/.test(page)
        && !/horizontal-rail-track\.discovery-grid[\s\S]{0,180}align-items:\s*stretch/.test(page),
);
record(
    "discovery-card not viewport/1fr stretched",
    /height:\s*auto/.test(discoveryCard)
        && /grid-template-rows:\s*96px auto auto/.test(discoveryCard)
        && !/minmax\(0,\s*1fr\)/.test(discoveryCard)
        && !/100vh/.test(discoveryCard),
);
record(
    "song-card content height (no stretch / 340 floor)",
    /height:\s*auto/.test(songCard)
        && /min-height:\s*0/.test(songCard)
        && /align-self:\s*start/.test(songCard)
        && !/min-height:\s*340px/.test(songCard)
        && !/align-self:\s*stretch/.test(songCard),
);
record(
    "desktop scroll root enforces rail content height",
    scroll.includes("horizontal-rail-track > *")
        && scroll.includes("align-self: start !important")
        && scroll.includes("height: auto !important")
        && scroll.includes("min-height: 0 !important")
        && !/horizontal-rail-track > \*[\s\S]{0,120}min-height:\s*100%/.test(scroll),
);
record(
    "rejects viewport-height card sizing in shared rails",
    !/\.horizontal-rail[\s\S]{0,400}100vh/.test(page)
        && !/\.horizontal-rail-track[\s\S]{0,500}100vh/.test(page)
        && !/\.discovery-card[\s\S]{0,200}100vh/.test(page),
);
record(
    "rail arrows no longer min-height 100%",
    /\.rail-arrow\s*\{[\s\S]{0,220}min-height:\s*44px/.test(page)
        && !/\.rail-arrow\s*\{[\s\S]{0,160}min-height:\s*100%/.test(page),
);
record(
    "player dock clearance tokens still present",
    page.includes("--player-scrollbar-gutter")
        && page.includes("player-collapse-toggle")
        && page.includes("--global-player-height"),
);
record("package exposes verify:carousel", pkg.includes("verify:carousel"));

const failed = results.filter((row) => !row.ok).length;
console.log(`\nCAROUSEL_CARD_HEIGHT_FAILS=${failed}`);
process.exit(failed ? 1 : 0);
