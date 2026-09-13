/**
 * Music player autoplay preference + pick logic.
 * Run: node lib/player-autoplay.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const moduleUrl = pathToFileURL(join(root, "player-autoplay.ts")).href;
const {
    pickAutoplayNextSong,
    PLAYER_AUTOPLAY_STORAGE_KEY,
    readAutoplayEnabled,
    writeAutoplayEnabled,
} = await import(moduleUrl);

function pickRandom(items) {
    return items[0] ?? null;
}

const catalog = [
    { id: "a" },
    { id: "b" },
    { id: "c" },
];

assert.equal(pickAutoplayNextSong(catalog, "a", false, pickRandom)?.id, "b");
assert.equal(pickAutoplayNextSong(catalog, "c", false, pickRandom)?.id, "a");
assert.equal(pickAutoplayNextSong(catalog, "c", true, pickRandom)?.id, "a");
assert.equal(pickAutoplayNextSong([{ id: "solo" }], "solo", false, pickRandom)?.id, "solo");
assert.equal(pickAutoplayNextSong([], "a", false, pickRandom), null);

if (typeof globalThis.localStorage !== "undefined") {
    globalThis.localStorage.removeItem(PLAYER_AUTOPLAY_STORAGE_KEY);
    assert.equal(readAutoplayEnabled(), false);
    writeAutoplayEnabled(true);
    assert.equal(readAutoplayEnabled(), true);
    writeAutoplayEnabled(false);
    assert.equal(readAutoplayEnabled(), false);
    globalThis.localStorage.removeItem(PLAYER_AUTOPLAY_STORAGE_KEY);
}
else {
    console.log("SKIP localStorage autoplay persistence (no localStorage in this runtime)");
}

console.log("PASS player-autoplay.test.mjs");
