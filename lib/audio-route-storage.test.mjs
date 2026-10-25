import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const route = readFileSync(path.join(root, "app/api/audio/route.ts"), "utf8");

assert.doesNotMatch(route, /fetchPublicSongBlob|object\/public\/\$\{SONGS_BUCKET\}/);
assert.match(route, /evaluateSongAudioPlaybackAccess/);
assert.match(route, /private, no-store/);
assert.match(route, /catalog\.pathError/);
assert.doesNotMatch(route, /catalog\.storagePath \|\| normalizeSongStoragePath/);

console.log("audio-route-storage tests passed.");
