/**
 * Add Queue to Playlist enablement contracts.
 * Run: node scripts/verify-save-queue-enablement.mjs
 * Or: npm run verify:save-queue
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
const pkg = read("package.json");

record(
    "action label is Add Queue to Playlist",
    page.includes("Add Queue to Playlist")
        && !/>Save Queue as Playlist</.test(page),
);

record(
    "save button no longer disables solely because videos exist",
    !/Add Queue to Playlist[\s\S]{0,220}queuedVideos\.length\s*>\s*0/.test(page)
        && !/unavailable while videos are in the queue/i.test(page),
);

record(
    "enablement requires auth + non-empty queue + not busy",
    page.includes("canAddQueueToPlaylist")
        && /canAddQueueToPlaylist\s*=\s*isAuthenticated/.test(page)
        && /queueCount\s*>\s*0/.test(page)
        && /!saveQueuePlaylistBusy/.test(page),
);

record(
    "opens two-mode dialog instead of window.prompt",
    page.includes("openSaveQueueAsPlaylistDialog")
        && page.includes("showSaveQueuePlaylistDialog")
        && page.includes("saveQueuePlaylistMode")
        && page.includes("Existing Playlist")
        && page.includes("Create New Playlist")
        && page.includes("save-queue-playlist-name")
        && !/window\.prompt\(\s*["']Save queue as playlist/.test(page),
);

record(
    "dialog exposes Cancel + primary actions and busy lock",
    page.includes("saveQueuePlaylistBusy")
        && page.includes("saveQueuePlaylistLockRef")
        && page.includes("save-queue-playlist-actions")
        && page.includes("closeSaveQueuePlaylistDialog")
        && /Cancel/.test(page.slice(page.indexOf("save-queue-playlist-actions"), page.indexOf("save-queue-playlist-actions") + 800))
        && page.includes('"Add Queue"')
        && page.includes('"Create Playlist"'),
);

record(
    "create path preserves mediaQueueItems order including videos",
    /orderedItems[\s\S]{0,160}mediaQueueItems/.test(page)
        && /itemType:\s*item\.mediaType\s*===\s*"video"\s*\?\s*"video"\s*:\s*"song"/.test(page)
        && page.includes("playlistId: savedPlaylist.id")
        && page.includes("items: orderedItems.map"),
);

record(
    "success keeps queue and refreshes playlists",
    page.includes("reloadPlaylistsFromSupabase")
        && (/Queue saved as playlist/.test(page) || /Added \$\{added\}/.test(page) || /Added \$\{added\} item/.test(page)),
);

record(
    "queue remains intact after save (no clearQueue in save paths)",
    (() => {
        const start = page.indexOf("async function addQueueToExistingPlaylist");
        const end = page.indexOf("async function createPlaylist", start);
        const slice = start >= 0 ? page.slice(start, end > start ? end : start + 8000) : "";
        return slice.length > 0 && !/clearQueue|clearSharedMediaQueue|replaceSharedMediaQueue\(\s*\[\]/.test(slice);
    })(),
);

record("package exposes verify:save-queue", pkg.includes("verify:save-queue"));

const failed = results.filter((row) => !row.ok).length;
console.log(`\nSAVE_QUEUE_ENABLEMENT_FAILS=${failed}`);
process.exit(failed ? 1 : 0);
