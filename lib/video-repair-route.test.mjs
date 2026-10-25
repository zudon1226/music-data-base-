/**
 * Repair must not download or return held/removed video bytes.
 * Run: node lib/video-repair-route.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const route = readFileSync(path.join(root, "app/api/videos/repair-urls/route.ts"), "utf8");
const library = readFileSync(path.join(root, "app/api/library-saves/route.ts"), "utf8");

assert.match(route, /isCatalogItemPubliclyPlayable/);
assert.match(route, /moderation_state/);
assert.match(route, /const clearRows = \(data \|\| \[\]\)\.filter/);
assert.match(route, /const candidates = clearRows/);
assert.match(route, /const rowsWithStoragePaths = clearRows/);
assert.match(library, /redactNonPlayableCatalogMedia/);

console.log("video-repair-route tests passed.");
