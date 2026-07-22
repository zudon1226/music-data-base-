/**
 * Album Save vs Recently Played / Library Albums wiring.
 * Usage: node scripts/verify-library-album-save.mjs
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
    const saveRoute = read("app/api/library/save/route.ts");
    const libraryRoute = read("app/api/library-saves/route.ts");
    const dispatch = read("lib/desktop-protected-click-dispatch.ts");

    const playAlbumStart = page.indexOf("async function playAlbum(");
    const playAlbumSlice = playAlbumStart >= 0 ? page.slice(playAlbumStart, playAlbumStart + 1800) : "";
    record(
        "playAlbum writes Recently Played only (not library save)",
        playAlbumSlice.includes("saveAlbumPlay(")
            && !playAlbumSlice.includes("saveAlbumToLibrary(")
            && !playAlbumSlice.includes("saveLibraryItem("),
    );

    const saveAlbumStart = page.indexOf("async function saveAlbumToLibrary(");
    const saveAlbumSlice = saveAlbumStart >= 0 ? page.slice(saveAlbumStart, saveAlbumStart + 1600) : "";
    record(
        "saveAlbumToLibrary posts item_type album and updates savedAlbumIds",
        saveAlbumSlice.includes('saveLibraryItem(normalizedAlbum, "album")')
            && saveAlbumSlice.includes("setSavedAlbumIds")
            && saveAlbumSlice.includes("loadLibrary()"),
    );

    record(
        "library save API accepts item_type album with auth user id",
        saveRoute.includes('rawItemType === "album" ? "album"')
            && saveRoute.includes("requireMatchingUserId")
            && saveRoute.includes('onConflict: "user_id,item_id,item_type"'),
    );

    record(
        "library-saves GET splits album ids from same library_saves table",
        libraryRoute.includes('itemType === "album"')
            && libraryRoute.includes("albumIds")
            && libraryRoute.includes("savedAlbums"),
    );

    record(
        "dispatchDesktopLibrarySave sends item_type",
        dispatch.includes('"/api/library/save"')
            && dispatch.includes("item_type: request.itemType"),
    );

    record(
        "Library Albums list uses savedAlbumIds (not recently played alone)",
        page.includes("const libraryAlbums = useMemo")
            && /savedIds\.has\(album\.id\)/.test(page)
            && page.includes("No saved albums yet."),
    );

    record(
        "album cards expose Save Album / Saved control",
        page.includes('data-album-save="true"')
            && page.includes('{isSaved ? "Saved" : "Save Album"}'),
    );

    record(
        "Recently Played album rows expose Save Album control",
        page.includes('data-recent-album-save="true"')
            && page.includes('title={isAlbumSaved ? "Saved" : "Save Album"}'),
    );

    record(
        "catalog album reload preserves saved albums",
        page.includes("Preserve saved albums that catalog reload may omit")
            && page.includes("preservedSaved"),
    );

    record(
        "mobile recent-actions height allows Save Album row",
        /max-height:\s*170px/.test(page)
            && page.includes("Save Album + Queue needs three rows"),
    );

    writeFileSync(
        path.join(evidenceDir, "library-album-save-evidence.json"),
        JSON.stringify({ results, checkedAt: new Date().toISOString() }, null, 2),
    );
    const fails = results.filter((item) => !item.ok);
    console.log(`\nLIBRARY_ALBUM_SAVE_FAILS=${fails.length}`);
    process.exit(fails.length ? 1 : 0);
}

main();
