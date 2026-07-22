/**
 * Queue → playlist authorization contracts.
 * Run: node scripts/verify-queue-playlist-auth.mjs
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
const playlistsApi = read("app/api/playlists/route.ts");

record(
    "open dialog requires authentication",
    /function openSaveQueueAsPlaylistDialog[\s\S]{0,260}!isAuthenticated/.test(page)
        && page.includes("DESKTOP_PROTECTED_API_LOGIN_REQUIRED_MESSAGE"),
);

record(
    "add/create paths call guardDesktopProtectedAction",
    page.includes('guardDesktopProtectedAction("save-queue-playlist")'),
);

record(
    "playlist-items API requires matching user id",
    api.includes("requireMatchingUserId")
        && api.includes('"/api/playlist-items"'),
);

record(
    "batch and single paths verify playlist ownership",
    api.includes("assertPlaylistOwner")
        && api.includes('.eq("user_id", userId)'),
);

record(
    "create playlist API requires auth",
    playlistsApi.includes("requireMatchingUserId")
        && playlistsApi.includes("Log in before creating playlists"),
);

record(
    "empty queue does not open modal",
    (() => {
        const start = page.indexOf("function openSaveQueueAsPlaylistDialog");
        const slice = start >= 0 ? page.slice(start, start + 1200) : "";
        const emptyIdx = slice.indexOf("Queue is empty");
        const openIdx = slice.indexOf("setShowSaveQueuePlaylistDialog(true)");
        return emptyIdx >= 0
            && openIdx >= 0
            && emptyIdx < openIdx
            && /queueCount === 0 \|\| mediaQueueItems\.length === 0/.test(slice);
    })(),
);

record(
    "disabled when unauthenticated or empty",
    page.includes("canAddQueueToPlaylist")
        && /disabled=\{!canAddQueueToPlaylist\}/.test(page),
);

const failed = results.filter((row) => !row.ok).length;
console.log(`\nQUEUE_PLAYLIST_AUTH_FAILS=${failed}`);
process.exit(failed ? 1 : 0);
