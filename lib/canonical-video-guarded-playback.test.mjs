import assert from "node:assert/strict";
import { resolveVideoPlaybackUrl } from "./canonical-video.ts";

const result = resolveVideoPlaybackUrl({
    id: "11111111-1111-4111-8111-111111111111",
    moderation_state: "clear",
    storage_path: "user-id/sample.mp4",
    video_url: "https://example.supabase.co/storage/v1/object/public/videos/user-id/sample.mp4",
});

assert.equal(result.ok, true);
assert.equal(result.source, "guardedApi");
assert.match(result.playableUrl, /^\/api\/video-playback\?/);

console.log("canonical-video-guarded-playback tests passed.");
