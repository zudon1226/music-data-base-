/**
 * External HTTPS and unknown moderation_state must not bypass catalog playback gates.
 * Run: npx --yes tsx lib/catalog-external-playback-moderation.test.mjs
 */
import assert from "node:assert/strict";
import { normalizeCanonicalVideo, resolveVideoPlaybackUrl } from "./canonical-video.ts";
import { resolveSongPlayableUrl, resolveVideoPlayableUrl } from "./desktop-media-queue.ts";

const id = "22222222-2222-4222-8222-222222222222";
const externalVideo = "https://cdn.example.com/off-platform/clip.mp4";

const clearExternal = resolveVideoPlaybackUrl({
    id,
    moderation_state: "clear",
    video_url: externalVideo,
});
assert.equal(clearExternal.ok, true);
assert.equal(clearExternal.playableUrl, externalVideo);

const heldExternal = resolveVideoPlaybackUrl({
    id,
    moderation_state: "takedown_pending",
    video_url: externalVideo,
});
assert.equal(heldExternal.ok, false);

const removedExternal = resolveVideoPlaybackUrl({
    id,
    moderation_state: "removed",
    video_url: externalVideo,
});
assert.equal(removedExternal.ok, false);

const unknownExternal = resolveVideoPlaybackUrl({
    id,
    moderation_state: "corrupt_value",
    video_url: externalVideo,
});
assert.equal(unknownExternal.ok, false);

const queueHeldExternal = resolveVideoPlayableUrl({
    id,
    moderation_state: "takedown_pending",
    video_url: externalVideo,
});
assert.equal(queueHeldExternal.playableUrl, "");

const queueClearExternal = resolveVideoPlayableUrl({
    id,
    moderation_state: "clear",
    video_url: externalVideo,
});
assert.equal(queueClearExternal.playableUrl, externalVideo);

const heldSongGuarded = resolveSongPlayableUrl({
    id,
    moderation_state: "removed",
    audio_url: "/api/audio?path=user/track.mp3&songId=" + id,
});
assert.equal(heldSongGuarded.playableUrl, "");

const heldExternalMissingState = resolveVideoPlayableUrl({
    id,
    video_url: externalVideo,
});
assert.equal(heldExternalMissingState.playableUrl, "", "catalog UUID without moderation_state must not queue external URL");

for (const state of ["takedown_pending", "removed", "corrupt_value", null, ""]) {
    const normalized = normalizeCanonicalVideo({
        id,
        moderation_state: state,
        video_url: externalVideo,
        videoUrl: externalVideo,
        playableUrl: externalVideo,
        storage_path: "owner/held.mp4",
        url: externalVideo,
    });
    assert.equal(normalized.playableUrl, "", `normalize must not keep a playable URL for ${String(state)}`);
    assert.equal(normalized.videoUrl, "", `normalize must not keep videoUrl for ${String(state)}`);
    assert.equal(normalized.storagePath, "");
}

const normalizedClearExternal = normalizeCanonicalVideo({
    id,
    moderation_state: "clear",
    video_url: externalVideo,
});
assert.equal(normalizedClearExternal.playableUrl, externalVideo);
assert.equal(normalizedClearExternal.videoUrl, externalVideo);

console.log("catalog-external-playback-moderation tests passed.");
