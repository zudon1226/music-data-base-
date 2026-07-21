/**
 * Save Queue as Playlist enablement contracts.
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
    "save button no longer disables solely because videos exist",
    !/Save Queue as Playlist[\s\S]{0,220}queuedVideos\.length\s*>\s*0/.test(page)
        && !/unavailable while videos are in the queue/i.test(page),
);

record(
    "save enablement requires auth + non-empty queue + not busy",
    page.includes("canSaveQueueAsPlaylist")
        && /canSaveQueueAsPlaylist\s*=\s*isAuthenticated/.test(page)
        && /queueCount\s*>\s*0/.test(page)
        && /!saveQueuePlaylistBusy/.test(page),
);

record(
    "opens name dialog instead of window.prompt",
    page.includes("openSaveQueueAsPlaylistDialog")
        && page.includes("showSaveQueuePlaylistDialog")
        && page.includes("save-queue-playlist-name")
        && !/window\.prompt\(\s*["']Save queue as playlist/.test(page),
);

record(
    "dialog exposes Cancel + Save and busy lock",
    page.includes("saveQueuePlaylistBusy")
        && page.includes("saveQueuePlaylistLockRef")
        && page.includes("save-queue-playlist-actions")
        && page.includes(">Cancel<")
        && /save-queue-playlist-actions[\s\S]{0,600}\{saveQueuePlaylistBusy \? "Saving…" : "Save"\}/.test(page),
);

record(
    "save preserves mediaQueueItems order including videos",
    /orderedItems\s*=\s*mediaQueueItems\.slice\(\)/.test(page)
        && /itemType:\s*item\.mediaType\s*===\s*"video"\s*\?\s*"video"\s*:\s*"song"/.test(page)
        && /for\s*\(\s*const\s+item\s+of\s+orderedItems\s*\)/.test(page),
);

record(
    "success keeps queue and refreshes playlists",
    /Queue saved as playlist[\s\S]{0,200}reloadPlaylistsFromSupabase/.test(page)
        || (/showToast\("Queue saved as playlist\."/.test(page) && page.includes("reloadPlaylistsFromSupabase")),
);

record(
    "queue remains intact after save (no clearQueue in save path)",
    (() => {
        const start = page.indexOf("async function saveQueueAsPlaylist");
        const end = page.indexOf("async function createPlaylist", start);
        const slice = start >= 0 ? page.slice(start, end > start ? end : start + 3500) : "";
        return slice.length > 0 && !/clearQueue|clearSharedMediaQueue|replaceSharedMediaQueue\(\s*\[\]/.test(slice);
    })(),
);

record("package exposes verify:save-queue", pkg.includes("verify:save-queue"));

const failed = results.filter((row) => !row.ok).length;
console.log(`\nSAVE_QUEUE_ENABLEMENT_FAILS=${failed}`);
process.exit(failed ? 1 : 0);
