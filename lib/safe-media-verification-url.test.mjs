import assert from "node:assert/strict";
import {
    isBlockedOutboundMediaProbeUrl,
    isPrivateOrLocalHostname,
    validateUploadedVideoBlob,
} from "./safe-media-verification-url.mjs";

assert.equal(isBlockedOutboundMediaProbeUrl("https://evil.example/video.mp4"), false);
assert.equal(isBlockedOutboundMediaProbeUrl("https://evil.example/redirect"), false);
assert.equal(isBlockedOutboundMediaProbeUrl("javascript:alert(1)"), true);
assert.equal(isBlockedOutboundMediaProbeUrl("http://127.0.0.1:3000/api/video-playback?path=x"), true);
assert.equal(isBlockedOutboundMediaProbeUrl("http://169.254.169.254/latest/meta-data"), true);
assert.equal(isBlockedOutboundMediaProbeUrl("http://192.168.0.5/file.mp4"), true);
assert.equal(isBlockedOutboundMediaProbeUrl("/api/video-playback?path=user/a.mp4"), true);
assert.equal(isBlockedOutboundMediaProbeUrl(""), true);

assert.equal(isPrivateOrLocalHostname("localhost"), true);
assert.equal(isPrivateOrLocalHostname("example.com"), false);

const blob = new Blob(["fixture-bytes"], { type: "video/mp4" });
assert.equal(validateUploadedVideoBlob(blob, "user/a.mp4").ok, true);

assert.throws(() => validateUploadedVideoBlob(new Blob([], { type: "video/mp4" }), "a.mp4"));

console.log("safe-media-verification-url tests passed.");
