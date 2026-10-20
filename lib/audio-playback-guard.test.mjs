/**
 * Audio playback moderation guard tests.
 * Run: npx tsx lib/audio-playback-guard.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
    AudioPlaybackGuardError,
    AUDIO_MODERATION_UNAVAILABLE_CODE,
    evaluateSongAudioPlaybackAccess,
    pickUniqueCatalogSongForStoragePath,
    rowMatchesStoragePath,
} from "./audio-playback-guard.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
function read(rel) {
    return readFileSync(path.join(root, rel), "utf8");
}

const clearSong = {
    id: "11111111-1111-4111-8111-111111111111",
    user_id: "22222222-2222-4222-8222-222222222222",
    storage_path: "user/22222222-2222-4222-8222-222222222222/song.mp3",
    audio_url: "",
    moderation_state: "clear",
};

const heldSong = {
    ...clearSong,
    id: "33333333-3333-4333-8333-333333333333",
    moderation_state: "takedown_pending",
};

assert.equal(evaluateSongAudioPlaybackAccess(clearSong, { userId: "", isAdmin: false }).ok, true);
assert.equal(evaluateSongAudioPlaybackAccess(heldSong, { userId: "", isAdmin: false }).ok, false);
assert.equal(
    evaluateSongAudioPlaybackAccess(heldSong, { userId: clearSong.user_id, isAdmin: false }).ok,
    true,
);
assert.equal(
    evaluateSongAudioPlaybackAccess(heldSong, { userId: "", isAdmin: true }).ok,
    true,
);
assert.equal(evaluateSongAudioPlaybackAccess(null, { userId: "", isAdmin: false }).code, "NOT_FOUND");

const normalizedPath = clearSong.storage_path;
assert.equal(rowMatchesStoragePath(clearSong, normalizedPath), true);
assert.equal(pickUniqueCatalogSongForStoragePath([clearSong], normalizedPath)?.id, clearSong.id);
assert.equal(pickUniqueCatalogSongForStoragePath([], normalizedPath), null);

const otherSong = {
    ...clearSong,
    id: "44444444-4444-4444-8444-444444444444",
    storage_path: "user/other/other.mp3",
};
assert.equal(pickUniqueCatalogSongForStoragePath([clearSong, otherSong], normalizedPath)?.id, clearSong.id);
assert.equal(
    pickUniqueCatalogSongForStoragePath([otherSong, { ...otherSong, id: "55555555-5555-4555-8555-555555555555" }], normalizedPath),
    null,
    "no exact path match among candidates",
);
assert.equal(
    pickUniqueCatalogSongForStoragePath(
        [
            { ...otherSong, storage_path: normalizedPath },
            { ...clearSong, storage_path: normalizedPath },
        ],
        normalizedPath,
    ),
    null,
    "two rows with same resolved path is ambiguous",
);

const route = read("app/api/audio/route.ts");
const guard = read("lib/audio-playback-guard.ts");

assert.match(route, /resolveCatalogSongForAudio/);
assert.match(route, /evaluateSongAudioPlaybackAccess/);
assert.match(route, /resolveAudioPlaybackViewer/);
assert.ok(route.indexOf("evaluateSongAudioPlaybackAccess") < route.indexOf("resolveAudioDownload"));
assert.match(route, /status: 404/);
assert.match(route, /AudioPlaybackGuardError/);
assert.match(route, /status: 503/);
assert.doesNotMatch(route, /lookupSongStoragePath/);

assert.match(guard, /moderation_state/);
assert.match(guard, /isCatalogItemPubliclyPlayable/);
assert.match(guard, /findSongsByStoragePath/);
assert.match(guard, /isModerationHoldColumnError/);
assert.match(guard, /pickUniqueCatalogSongForStoragePath/);
assert.doesNotMatch(
    guard,
    /moderation_state:\s*["']clear["']/,
    "must not default missing moderation_state to clear",
);
assert.doesNotMatch(
    guard,
    /select\(\s*["']id,user_id,storage_path,audio_url["']\s*\)/,
    "must not fall back to selects without moderation_state",
);
assert.doesNotMatch(guard, /exact \|\| songs\[0\]/, "must not pick arbitrary first match when ambiguous");

assert.equal(new AudioPlaybackGuardError().code, AUDIO_MODERATION_UNAVAILABLE_CODE);
assert.match(new AudioPlaybackGuardError().message, /202610172000/);

console.log("audio-playback-guard tests passed.");
