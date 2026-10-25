/**
 * Run: npx.cmd --yes tsx lib/video-playback-guard.test.mjs
 */
import assert from "node:assert/strict";
import {
    evaluateVideoPlaybackAccess,
} from "./video-playback-guard.ts";

const ownerId = "22222222-2222-4222-8222-222222222222";
const clearVideo = {
    id: "11111111-1111-4111-8111-111111111111",
    user_id: ownerId,
    storage_path: "user/video.mp4",
    video_url: "",
    moderation_state: "clear",
};
const heldVideo = { ...clearVideo, moderation_state: "takedown_pending" };
const removedVideo = { ...clearVideo, moderation_state: "removed" };

assert.equal(evaluateVideoPlaybackAccess(clearVideo, { userId: "", isAdmin: false }).ok, true);
assert.equal(evaluateVideoPlaybackAccess(heldVideo, { userId: "", isAdmin: false }).ok, false);
assert.equal(evaluateVideoPlaybackAccess(heldVideo, { userId: ownerId, isAdmin: false }).ok, false);
assert.equal(evaluateVideoPlaybackAccess(heldVideo, { userId: ownerId, isAdmin: true }).ok, false);
assert.equal(evaluateVideoPlaybackAccess(removedVideo, { userId: ownerId, isAdmin: true }).ok, false);
assert.equal(evaluateVideoPlaybackAccess(null, { userId: "", isAdmin: false }).ok, false);

console.log("video-playback-guard tests passed.");
