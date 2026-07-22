/**
 * Add Queue → Existing Playlist contracts.
 * Run: node scripts/verify-add-queue-to-existing-playlist.mjs
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
const api = read("app/api/playlist-items/route.ts");

record(
    "two-mode modal title Add Queue to Playlist",
    page.includes("Add Queue to Playlist")
        && page.includes('aria-label="Add queue to playlist"'),
);

record(
    "defaults existing mode when playlists exist",
    /setSaveQueuePlaylistMode\(hasPlaylists \? "existing" : "create"\)/.test(page),
);

record(
    "existing mode lists playlists with song/video counts",
    page.includes("save-queue-playlist-list")
        && page.includes("songCount")
        && page.includes("videoCount")
        && /song\$\{songCount === 1 \? "" : "s"\}/.test(page)
        && /video\$\{videoCount === 1 \? "" : "s"\}/.test(page),
);

record(
    "single playlist selection state",
    page.includes("saveQueueSelectedPlaylistId")
        && page.includes("setSaveQueueSelectedPlaylistId(playlist.id)")
        && page.includes('role="option"'),
);

record(
    "Add Queue primary action uses one batch request",
    page.includes("async function addQueueToExistingPlaylist")
        && page.includes("items: itemsPayload")
        && api.includes("parseQueueItems")
        && api.includes("batch insert"),
);

record(
    "all-existing disables Add Queue and shows message",
    page.includes("All queue items are already in this playlist")
        && page.includes("selectedPresence.state === \"all\"")
        && page.includes("existingAddDisabled"),
);

record(
    "presence helper supports all/partial/none",
    page.includes("function getQueuePlaylistPresence")
        && page.includes('state: "all"')
        && page.includes('state: "partial"')
        && page.includes('state: "none"'),
);

record(
    "busy lock prevents double submit",
    page.includes("saveQueuePlaylistLockRef")
        && /if \(saveQueuePlaylistLockRef\.current \|\| saveQueuePlaylistBusy\)/.test(page),
);

record(
    "failure keeps modal open (no close on error in add path)",
    (() => {
        const start = page.indexOf("async function addQueueToExistingPlaylist");
        const end = page.indexOf("async function saveQueueAsPlaylist", start);
        const slice = start >= 0 ? page.slice(start, end > start ? end : start + 3500) : "";
        return slice.includes('showToast(data.error || "Could not add queue to playlist.", "error")')
            && !/if \(!response\.ok\)[\s\S]{0,120}setShowSaveQueuePlaylistDialog\(false\)/.test(slice);
    })(),
);

const failed = results.filter((row) => !row.ok).length;
console.log(`\nADD_QUEUE_TO_EXISTING_PLAYLIST_FAILS=${failed}`);
process.exit(failed ? 1 : 0);
