/**
 * Producer Studio song delete action verification.
 * Usage: npm run verify:producer-song-delete-action
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

    record("delete opens in-app confirmation", page.includes("songDeleteConfirm")
        && page.includes("setSongDeleteConfirm")
        && page.includes("song-delete-modal"));
    record("confirmation includes title Cancel Delete", page.includes("song-delete-modal-actions")
        && /Cancel[\s\S]{0,200}Delete/.test(page)
        && page.includes("songDeleteConfirm.title"));
    record("dashboard delete wires permanentDeleteSong", /danger-btn[\s\S]{0,120}permanentDeleteSong\(song\.id\)/.test(page));
    record("confirm executes authorized delete once", page.includes("executePermanentSongDelete")
        && page.includes("songDeleteLockRef")
        && page.includes("setSongDeleteBusy(true)")
        && /method:\s*"DELETE"/.test(page));
    record("cancel closes without request", page.includes("cancelSongDeleteConfirm")
        && /cancelSongDeleteConfirm[\s\S]{0,120}setSongDeleteConfirm\(null\)/.test(page));
    record("no window.confirm in song delete path", !/permanentlyDeleteSong[\s\S]{0,400}window\.confirm/.test(page)
        && !/permanentDeleteSong[\s\S]{0,400}window\.confirm/.test(page)
        && !/executePermanentSongDelete[\s\S]{0,400}window\.confirm/.test(page));
    record("success purges UI and toasts", page.includes("purgeDeletedSongFromUi")
        && page.includes('showToast("Track deleted everywhere.", "success")'));
    record("failure keeps card and shows error", page.includes('showToast(data.error || "Track could not be deleted from Supabase.", "error")')
        && page.includes("restoreSongLocalStorageSnapshot"));
    record("mobile actions remain pointer-interactive", page.includes("dashboard-song-actions button")
        && /pointer-events:\s*auto !important/.test(page)
        && /overflow:\s*visible !important/.test(page));

    writeFileSync(path.join(evidenceDir, "producer-song-delete-action-evidence.json"), JSON.stringify({ results }, null, 2));
    const fails = results.filter((item) => !item.ok);
    console.log(`\nPRODUCER_SONG_DELETE_ACTION_FAILS=${fails.length}`);
    process.exit(fails.length ? 1 : 0);
}

main();
