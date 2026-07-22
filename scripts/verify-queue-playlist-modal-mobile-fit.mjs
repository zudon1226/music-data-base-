/**
 * Queue playlist modal mobile fit contracts.
 * Run: node scripts/verify-queue-playlist-modal-mobile-fit.mjs
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
    return readFileSync(full, "utf8").replace(/\r\n/g, "\n");
}

const page = read("app/page.tsx");

record(
    "backdrop uses playlist-modal-backdrop + save-queue class",
    page.includes("playlist-modal-backdrop save-queue-playlist-backdrop"),
);

record(
    "mobile backdrop starts after sidebar width",
    /\.modal-backdrop\.save-queue-playlist-backdrop[\s\S]{0,220}left:\s*var\(--mobile-sidebar-width\)/.test(page)
        || /\.modal-backdrop\.playlist-modal-backdrop,\s*\n\s*\.modal-backdrop\.save-queue-playlist-backdrop[\s\S]{0,260}left:\s*var\(--mobile-sidebar-width\)/.test(page),
);

record(
    "no negative left positioning on save-queue modal",
    !/\.save-queue-playlist-(modal|backdrop)[\s\S]{0,160}left:\s*-/.test(page),
);

record(
    "modal max-height accounts for player reserve",
    /save-queue-playlist-modal[\s\S]{0,400}--mobile-player-reserve/.test(page),
);

record(
    "visualViewport caps modal height for keyboard",
    page.includes("--save-queue-modal-vv-max")
        && page.includes("visualViewport")
        && page.includes("updateSaveQueueModalViewportMax"),
);

record(
    "internal list scrolls",
    page.includes("save-queue-playlist-list")
        && /\.save-queue-playlist-list[\s\S]{0,120}overflow-y:\s*auto/.test(page),
);

record(
    "footer actions sticky/reachable",
    /\.save-queue-playlist-actions[\s\S]{0,120}position:\s*sticky/.test(page),
);

record(
    "create input uses 16px font (no iOS focus zoom)",
    /\.save-queue-playlist-form input\s*\{[^}]*font-size:\s*16px/.test(page),
);

const failed = results.filter((row) => !row.ok).length;
console.log(`\nQUEUE_PLAYLIST_MODAL_MOBILE_FIT_FAILS=${failed}`);
process.exit(failed ? 1 : 0);
