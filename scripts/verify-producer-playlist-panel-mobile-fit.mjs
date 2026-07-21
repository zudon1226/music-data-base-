/**
 * Producer Studio playlist panel mobile fit verification.
 * Usage: npm run verify:producer-playlist-panel-mobile-fit
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDir = path.join(root, "tmp");
mkdirSync(evidenceDir, { recursive: true });
const results = [];

function record(name, ok, detail = "") {
    results.push({ name, ok, detail });
    console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}

function read(rel) {
    return readFileSync(path.join(root, rel), "utf8").replace(/\r\n/g, "\n");
}

function main() {
    const page = read("app/page.tsx");
    const mobileIdx = page.indexOf(".modal-backdrop.playlist-modal-backdrop");
    const mobile = mobileIdx >= 0 ? page.slice(mobileIdx, mobileIdx + 1200) : "";

    record("playlist modal uses dedicated backdrop class", page.includes('className="modal-backdrop playlist-modal-backdrop"'));
    record("mobile backdrop offsets past sidebar", mobile.includes("left: var(--mobile-sidebar-width)")
        && mobile.includes("inset: unset")
        && /z-index:\s*130/.test(mobile));
    record("mobile playlist modal uses full content width", /\.playlist-modal,\s*\n\s*\.song-delete-modal\s*\{[^}]*width:\s*100%/s.test(page)
        || /playlist-modal[\s\S]{0,120}width:\s*100%/.test(mobile));
    record("playlist list scrolls internally", /\.playlist-modal-list\s*\{[^}]*overflow-y:\s*auto/s.test(page)
        && /grid-template-rows:\s*auto minmax\(0,\s*1fr\)/.test(page));
    record("mobile player reserve padding on backdrop", mobile.includes("padding-bottom: calc(var(--mobile-player-reserve)")
        || mobile.includes("padding-bottom: calc(var(--mobile-player-reserve) + 12px)"));
    record("desktop modal backdrop still full-screen default", /\.modal-backdrop\s*\{[^}]*inset:\s*0/s.test(page)
        && page.includes(".modal-backdrop.playlist-modal-backdrop"));
    record("playlist add behavior preserved", page.includes("addPlaylistTargetToPlaylist")
        && page.includes("already-added")
        && page.includes("openPlaylistMenu"));

    writeFileSync(path.join(evidenceDir, "producer-playlist-panel-mobile-fit-evidence.json"), JSON.stringify({ results }, null, 2));
    const fails = results.filter((item) => !item.ok);
    console.log(`\nPRODUCER_PLAYLIST_PANEL_MOBILE_FIT_FAILS=${fails.length}`);
    process.exit(fails.length ? 1 : 0);
}

main();
