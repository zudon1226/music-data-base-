import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const jiti = require("jiti")(import.meta.url);
const {
    buildHtmlMediaElementDiagnostics,
    describeHtmlMediaErrorCode,
    HTML_MEDIA_ERROR_NAMES,
} = jiti("./canonical-video.ts");

const fakeMedia = {
    currentSrc: "https://example.supabase.co/storage/v1/object/public/videos/a.mp4",
    src: "",
    readyState: 0,
    networkState: 3,
    error: { code: 4, message: "MEDIA_ELEMENT_ERROR: Format error" },
    canPlayType: (mime) => (mime === "video/mp4" ? "maybe" : ""),
};

const diag = buildHtmlMediaElementDiagnostics(
    fakeMedia,
    {
        selectedVideoId: "vid-1",
        title: "Test clip",
        finalVideoUrl: fakeMedia.currentSrc,
        sourceMimeType: "video/mp4",
        classification: "network-error",
    },
    { ok: false, status: 404, contentType: "application/json", error: "" },
);

assert.equal(describeHtmlMediaErrorCode(4), HTML_MEDIA_ERROR_NAMES[4]);
assert.equal(diag.mediaErrorCode, 4);
assert.equal(diag.httpStatus, 404);
assert.equal(diag.httpContentType, "application/json");
assert.equal(diag.currentSrc, fakeMedia.currentSrc);
assert.match(diag.readyStateLabel, /HAVE/);
assert.match(diag.networkStateLabel, /NETWORK/);

console.log("canonical-video-diagnostics.test.mjs: ok");