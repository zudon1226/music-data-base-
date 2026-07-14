/**
 * Video upload compatibility regression (no network upload).
 * Usage: node scripts/verify-video-upload-compatibility.mjs
 */
import { createRequire } from "node:module";
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const results = [];

function pass(name, detail = "") {
    results.push({ name, ok: true, detail });
}
function fail(name, detail = "") {
    results.push({ name, ok: false, detail });
}

function load() {
    try {
        const jiti = require("jiti")(import.meta.url);
        return jiti("../lib/video-upload-compatibility.ts", {
            alias: { "@": process.cwd() },
        });
    }
    catch (error) {
        throw new Error(`Unable to load video-upload-compatibility.ts: ${error}`);
    }
}

function buildFakeMp4Bytes({ videoTag, audioTag, withFtyp = true }) {
    const parts = [];
    if (withFtyp) {
        parts.push(Buffer.from("....ftypisom"));
    }
    parts.push(Buffer.from("padding-".repeat(64)));
    if (videoTag) parts.push(Buffer.from(videoTag));
    parts.push(Buffer.from("-gap-".repeat(32)));
    if (audioTag) parts.push(Buffer.from(audioTag));
    parts.push(Buffer.from("tail-".repeat(64)));
    return new Uint8Array(Buffer.concat(parts));
}

async function main() {
    const {
        inspectVideoBytesForUploadCompatibility,
        classifyVideoUploadForPublication,
        VIDEO_UPLOAD_INCOMPATIBLE_USER_MESSAGE,
        buildCompatibleVideoPublishMetadata,
        describeVideoUploadCompatibilityDebug,
    } = load();

    const h264 = inspectVideoBytesForUploadCompatibility(
        buildFakeMp4Bytes({ videoTag: "avc1", audioTag: "mp4a", withFtyp: true }),
        { mimeType: "video/mp4", fileName: "ok.mp4" },
    );
    if (h264.canPublish && h264.mobileCompatible && h264.compatibilityStatus === "compatible"
        && h264.videoCodec === "h264" && h264.audioCodec === "aac") {
        pass("H.264+AAC+MP4 can publish with canonical codecs");
    }
    else fail("H.264+AAC+MP4 can publish with canonical codecs", JSON.stringify(h264));

    const meta = buildCompatibleVideoPublishMetadata(h264);
    if (meta.video_codec === "h264" && meta.audio_codec === "aac" && meta.mobile_compatible === true
        && meta.mime_type === "video/mp4" && meta.container === "mp4" && meta.compatibility_status === "compatible") {
        pass("Compatible publish metadata canonical fields");
    }
    else fail("Compatible publish metadata canonical fields", JSON.stringify(meta));

    const av1 = inspectVideoBytesForUploadCompatibility(
        buildFakeMp4Bytes({ videoTag: "av01", audioTag: "mp4a", withFtyp: true }),
        { mimeType: "video/mp4", fileName: "bad.mp4" },
    );
    if (!av1.canPublish && av1.mobileCompatible === false && av1.publicationError === VIDEO_UPLOAD_INCOMPATIBLE_USER_MESSAGE
        && VIDEO_UPLOAD_INCOMPATIBLE_USER_MESSAGE.includes("unsupported internal codec")) {
        pass("AV1 MP4 rejected with exact user message");
    }
    else fail("AV1 MP4 rejected with exact user message", JSON.stringify(av1));

    if (typeof describeVideoUploadCompatibilityDebug === "function") {
        const debug = describeVideoUploadCompatibilityDebug(av1);
        if (debug.compatible === "No" && debug.videoCodec && debug.rejectionReason) {
            pass("Debug descriptor exposes codecs + rejection reason");
        }
        else fail("Debug descriptor exposes codecs + rejection reason", JSON.stringify(debug));
    }

    const unknown = inspectVideoBytesForUploadCompatibility(
        buildFakeMp4Bytes({ videoTag: "", audioTag: "", withFtyp: false }),
        { mimeType: "video/mp4", fileName: "mystery.mp4" },
    );
    if (!unknown.canPublish && unknown.mobileCompatible === false) {
        pass("Unverified .mp4 bytes cannot publish");
    }
    else fail("Unverified .mp4 bytes cannot publish", JSON.stringify(unknown));

    const noAudio = inspectVideoBytesForUploadCompatibility(
        buildFakeMp4Bytes({ videoTag: "avc1", audioTag: "", withFtyp: true }),
        { mimeType: "video/mp4", fileName: "silent.mp4" },
    );
    if (!noAudio.canPublish) {
        pass("H.264 without verified AAC cannot publish");
    }
    else fail("H.264 without verified AAC cannot publish", JSON.stringify(noAudio));

    const extOnly = classifyVideoUploadForPublication({
        fileName: "clip.mp4",
        mimeType: "video/mp4",
        videoCodecRaw: "",
        audioCodecRaw: "",
        container: "",
    });
    if (!extOnly.canPublish) {
        pass("Filename/MIME alone cannot publish");
    }
    else fail("Filename/MIME alone cannot publish", JSON.stringify(extOnly));

    // Existing AV1 playback classification remains separate.
    const jiti = require("jiti")(import.meta.url);
    const playback = jiti("../lib/canonical-video.ts", { alias: { "@": process.cwd() } });
    const classified = playback.classifyVideoPlaybackFailure({
        playableUrl: "https://example.supabase.co/storage/v1/object/public/videos/x/a.mp4",
        videoUrl: "https://example.supabase.co/storage/v1/object/public/videos/x/a.mp4",
        storagePath: "x/a.mp4",
        videoCodec: "av01",
        mediaErrorCode: 4,
        sourceAssigned: true,
    });
    if (classified?.kind === "unsupported-codec" && !String(classified.message).toLowerCase().includes("missing")) {
        pass("Existing AV1 playback still unsupported-codec not missing-url");
    }
    else fail("Existing AV1 playback still unsupported-codec not missing-url", JSON.stringify(classified));

    mkdirSync("tmp-shared-queue-evidence", { recursive: true });
    writeFileSync(
        path.join("tmp-shared-queue-evidence", "video-upload-compatibility.json"),
        JSON.stringify({ passed: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length, results }, null, 2),
    );
    console.log(JSON.stringify({ passed: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length, results }, null, 2));
    if (results.some((r) => !r.ok)) process.exit(1);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
