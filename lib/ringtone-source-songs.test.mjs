/**
 * Run: node lib/ringtone-source-songs.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isCatalogItemPubliclyPlayable } from "./moderation-status.mjs";
import {
    coerceSongPlaybackCandidate,
    resolveGuardedAudioPlaybackUrlFromRecord,
} from "./guarded-playback-url.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const route = readFileSync(path.join(root, "app/api/ringtones/source-songs/route.ts"), "utf8");

assert.ok(route.includes("isCatalogItemPubliclyPlayable"));
assert.ok(route.includes("resolveGuardedAudioPlaybackUrlFromRecord"));
assert.ok(route.includes("MODERATION_UNAVAILABLE"));
assert.ok(route.includes("notClearModeration"));

const id = "11111111-1111-4111-8111-111111111111";
const legacyPublic = "https://proj.supabase.co/storage/v1/object/public/songs/u/h.mp3";

assert.equal(isCatalogItemPubliclyPlayable({ moderation_state: "takedown_pending" }), false);
assert.equal(isCatalogItemPubliclyPlayable({ moderation_state: "removed" }), false);
assert.equal(isCatalogItemPubliclyPlayable({ moderation_state: "clear" }), true);

const heldRecord = {
    id,
    moderation_state: "takedown_pending",
    storage_path: "u/h.mp3",
    audio_url: legacyPublic,
};
assert.equal(isCatalogItemPubliclyPlayable(heldRecord), false);

const clearRecord = {
    id,
    moderation_state: "clear",
    storage_path: "u/clear.mp3",
    audio_url: legacyPublic,
};
assert.match(resolveGuardedAudioPlaybackUrlFromRecord(clearRecord), /^\/api\/audio\?/);
assert.equal(coerceSongPlaybackCandidate(clearRecord, legacyPublic).includes("object/public"), false);

console.log("ringtone-source-songs tests passed.");
