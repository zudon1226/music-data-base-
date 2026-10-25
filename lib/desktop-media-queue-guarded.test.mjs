/**
 * Run: npx --yes tsx lib/desktop-media-queue-guarded.test.mjs
 */
import assert from "node:assert/strict";
import { resolveSongPlayableUrl, resolveVideoPlayableUrl } from "./desktop-media-queue.ts";

const id = "11111111-1111-4111-8111-111111111111";
const legacySongPublic = "https://proj.supabase.co/storage/v1/object/public/songs/user/legacy.mp3";
const legacyVideoPublic = "https://proj.supabase.co/storage/v1/object/public/videos/user/legacy.mp4";

const songResolved = resolveSongPlayableUrl({
    id,
    moderation_state: "clear",
    audio_url: legacySongPublic,
});
assert.match(songResolved.playableUrl, /^\/api\/audio\?/);
assert.equal(songResolved.playableUrl.includes("object/public"), false);

const videoResolved = resolveVideoPlayableUrl({
    id,
    moderation_state: "clear",
    video_url: legacyVideoPublic,
});
assert.match(videoResolved.playableUrl, /^\/api\/video-playback\?/);
assert.equal(videoResolved.playableUrl.includes("object/public"), false);

console.log("desktop-media-queue-guarded tests passed.");
