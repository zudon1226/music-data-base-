/**
 * Global collapsible player clearance contracts.
 * Run: node scripts/verify-global-player-clearance.mjs
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
const globals = read("app/globals.css");
const pkg = read("package.json");

record(
    "global player height token defined",
    page.includes("--global-player-height")
        && page.includes("--global-player-height-expanded")
        && page.includes("--global-player-height-collapsed"),
);
record(
    "player collapsed localStorage key",
    page.includes('playerCollapsed: "zml_player_collapsed"')
        && page.includes("STORAGE_KEYS.playerCollapsed"),
);
record(
    "collapse toggle control present",
    page.includes('className="player-collapse-toggle"')
        && page.includes("togglePlayerCollapsed")
        && page.includes("is-collapsed"),
);
record(
    "content reserves player height token",
    /padding:\s*14px 14px var\(--mobile-player-reserve\)/.test(page)
        || /padding-bottom:\s*var\(--mobile-player-reserve\)/.test(page),
);
record(
    "mobile player height uses global token",
    /--mobile-player-height:\s*var\(--global-player-height\)/.test(page)
        && globals.includes("var(--global-player-height"),
);
record(
    "collapsed mobile player grid compact",
    page.includes(".music-bottom-player.is-collapsed")
        && page.includes("grid-template-columns: minmax(0, 1fr) 44px 44px")
        && globals.includes(".fixed-mobile-player.fixed-mobile-player.is-collapsed"),
);
record(
    "safe-area inset respected on player",
    page.includes("env(safe-area-inset-bottom")
        && globals.includes("env(safe-area-inset-bottom"),
);
record(
    "playback handlers untouched by collapse toggle",
    page.includes("onClick={togglePlay}")
        && page.includes("onClick={toggleVideoPlayback}")
        && !/togglePlayerCollapsed[\s\S]{0,80}audioRef\.current\.(pause|play|load)/.test(page),
);
record(
    "collapsed keeps play via display contents",
    page.includes(".player.is-collapsed .player-center")
        && /is-collapsed \.player-center[\s\S]{0,220}display:\s*contents/.test(page)
        && !/is-collapsed \.player-center[\s\S]{0,120}display:\s*none/.test(page),
);
record(
    "mobile collapsed grid reserves play + expand",
    globals.includes("minmax(0, 1fr) 44px 44px")
        && globals.includes(".fixed-mobile-player.fixed-mobile-player.is-collapsed .main-play"),
);
record("package script verify:playback", pkg.includes("verify:playback"));

const failed = results.filter((row) => !row.ok).length;
console.log(`\nGLOBAL_PLAYER_CLEARANCE_FAILS=${failed}`);
process.exit(failed ? 1 : 0);
