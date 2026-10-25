import assert from "node:assert/strict";
import {
    bindCatalogObjectPath,
    buildGuardedAudioPlaybackUrl,
    buildGuardedVideoPlaybackUrl,
    coerceSongPlaybackCandidate,
    isGuardedMediaPlaybackUrl,
    isPublicSupabaseMediaObjectUrl,
    resolveGuardedAudioPlaybackUrlFromRecord,
    resolveGuardedVideoPlaybackUrlFromRecord,
} from "./guarded-playback-url.mjs";

const id = "11111111-1111-4111-8111-111111111111";
const legacySongPublic = "https://proj.supabase.co/storage/v1/object/public/songs/user/legacy.mp3";
const legacyVideoPublic = "https://proj.supabase.co/storage/v1/object/public/videos/user/legacy.mp4";

assert.match(
    buildGuardedAudioPlaybackUrl({ id, storagePath: "user/a.mp3" }),
    /^\/api\/audio\?/,
);
assert.match(
    buildGuardedVideoPlaybackUrl({ id, storagePath: "user/v.mp4" }),
    /^\/api\/video-playback\?/,
);
assert.equal(isGuardedMediaPlaybackUrl("/api/audio?path=x"), true);
assert.equal(isPublicSupabaseMediaObjectUrl(legacySongPublic), true);

assert.match(
    resolveGuardedAudioPlaybackUrlFromRecord({
        id,
        audio_url: legacySongPublic,
    }),
    /^\/api\/audio\?path=user%2Flegacy\.mp3&songId=/,
);
assert.equal(
    coerceSongPlaybackCandidate({ id }, legacySongPublic).startsWith("/api/audio?"),
    true,
);
assert.equal(coerceSongPlaybackCandidate({ id }, "https://cdn.example.com/track.mp3"), "");
assert.deepEqual(bindCatalogObjectPath("user/a.mp3", ""), { ok: true, storagePath: "user/a.mp3" });
assert.deepEqual(bindCatalogObjectPath("user/a.mp3", "user/a.mp3"), { ok: true, storagePath: "user/a.mp3" });
assert.deepEqual(bindCatalogObjectPath("user/a.mp3", "user/other.mp3"), { ok: false, code: "PATH_MISMATCH" });
assert.deepEqual(bindCatalogObjectPath("", "user/other.mp3"), { ok: false, code: "MISSING_PATH" });
assert.deepEqual(bindCatalogObjectPath("https://cdn.example.com/a.mp3", ""), { ok: false, code: "MISSING_PATH" });

assert.match(
    resolveGuardedVideoPlaybackUrlFromRecord({
        id,
        video_url: legacyVideoPublic,
    }),
    /^\/api\/video-playback\?/,
);

console.log("guarded-playback-url tests passed.");
