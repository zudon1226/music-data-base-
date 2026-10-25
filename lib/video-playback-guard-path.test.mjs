/**
 * Run: npx.cmd --yes tsx lib/video-playback-guard-path.test.mjs
 */
import assert from "node:assert/strict";
import { evaluateVideoPlaybackAccess } from "./video-playback-guard.ts";

assert.equal(evaluateVideoPlaybackAccess(null, { userId: "", isAdmin: false }).ok, false);
assert.equal(
    evaluateVideoPlaybackAccess(
        { id: "1", user_id: "2", storage_path: "x.mp4", video_url: "", moderation_state: "removed" },
        { userId: "", isAdmin: false },
    ).ok,
    false,
);

console.log("video-playback-guard-path tests passed.");
