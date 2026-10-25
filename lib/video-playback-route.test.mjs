import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const route = readFileSync(path.join(root, "app/api/video-playback/route.ts"), "utf8");

assert.ok(route.includes("evaluateVideoPlaybackAccess"));
assert.ok(route.includes("createSignedUrl"));
assert.ok(route.includes("proxyMediaStreamWithRange"));
assert.doesNotMatch(route, /object\/public\/videos/);
assert.doesNotMatch(route, /fetchPublic/);
assert.doesNotMatch(route, /signedUrl.*Response\.json/);
assert.match(route, /Cache-Control.*private, no-store|proxyMediaStreamWithRange/);
assert.match(route, /catalog\.pathError/);
assert.doesNotMatch(route, /catalog\.storagePath \|\| normalizeVideoStoragePath/);

console.log("video-playback-route tests passed.");
