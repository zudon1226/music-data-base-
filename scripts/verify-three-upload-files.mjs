/**
 * Byte-inspect Tyrant / 20 Matic / Big Business for upload publish gate.
 * Does not upload. Does not commit/deploy.
 */
import { createRequire } from "node:module";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const jiti = require("jiti")(import.meta.url);
const {
    inspectVideoBytesForUploadCompatibility,
    VIDEO_UPLOAD_INCOMPATIBLE_USER_MESSAGE,
} = jiti("../lib/video-upload-compatibility.ts", { alias: { "@": process.cwd() } });

const RESULTS = [];
const evidenceDir = path.join(process.cwd(), "tmp-upload-compat-evidence");
mkdirSync(evidenceDir, { recursive: true });

const EXPECTED_MESSAGE =
    "This MP4 file uses an unsupported internal codec. Files downloaded from the same platform may still use different codecs. Convert this video to H.264 video with AAC audio, then upload it again.";

function pass(name, detail = "") {
    RESULTS.push({ name, ok: true, detail });
    console.log(`PASS ${name}${detail ? ` — ${detail}` : ""}`);
}
function fail(name, detail = "") {
    RESULTS.push({ name, ok: false, detail });
    console.log(`FAIL ${name}${detail ? ` — ${detail}` : ""}`);
}

async function sampleFromFile(filePath) {
    const buf = readFileSync(filePath);
    const sampleSize = Math.min(256 * 1024, buf.length);
    const parts = [buf.subarray(0, sampleSize)];
    if (buf.length > sampleSize) {
        parts.push(buf.subarray(buf.length - sampleSize));
    }
    const merged = Buffer.concat(parts.map((p) => Buffer.from(p)));
    return new Uint8Array(merged);
}

async function sampleFromUrl(url) {
    const headRes = await fetch(url, {
        headers: { Range: `bytes=0-${256 * 1024 - 1}` },
    });
    const headBuf = Buffer.from(await headRes.arrayBuffer());
    let length = Number(String(headRes.headers.get("content-range") || "").split("/")[1] || headBuf.length);
    if (!Number.isFinite(length) || length <= 0) length = headBuf.length;
    const parts = [headBuf];
    if (length > headBuf.length) {
        const start = Math.max(0, length - 256 * 1024);
        const tailRes = await fetch(url, { headers: { Range: `bytes=${start}-${length - 1}` } });
        parts.push(Buffer.from(await tailRes.arrayBuffer()));
    }
    return new Uint8Array(Buffer.concat(parts));
}

async function inspectNamed(name, bytes, expectPublish) {
    const inspection = inspectVideoBytesForUploadCompatibility(bytes, {
        mimeType: "video/mp4",
        fileName: `${name}.mp4`,
    });
    const summary = {
        name,
        container: inspection.container || "unknown",
        videoCodec: inspection.videoCodecRaw || inspection.videoCodec || "unknown",
        audioCodec: inspection.audioCodecRaw || inspection.audioCodec || "unknown",
        compatible: inspection.canPublish ? "Yes" : "No",
        rejectionReason: inspection.compatibilityReason || "",
        publicationError: inspection.publicationError || "",
        canPublish: inspection.canPublish,
        codecTags: inspection.codecTags,
    };
    console.log(JSON.stringify(summary, null, 2));
    writeFileSync(path.join(evidenceDir, `${name.replace(/\s+/g, "-").toLowerCase()}.json`), JSON.stringify(summary, null, 2));

    if (expectPublish) {
        if (inspection.canPublish && inspection.compatibilityStatus === "compatible") {
            pass(`${name} accepted for publish`, `video=${summary.videoCodec} audio=${summary.audioCodec} container=${summary.container}`);
        }
        else {
            fail(`${name} accepted for publish`, JSON.stringify(summary));
        }
    }
    else {
        const messageOk = inspection.publicationError === EXPECTED_MESSAGE
            && EXPECTED_MESSAGE === VIDEO_UPLOAD_INCOMPATIBLE_USER_MESSAGE;
        if (!inspection.canPublish && messageOk && summary.rejectionReason) {
            pass(`${name} rejected with codecs shown`, `video=${summary.videoCodec} audio=${summary.audioCodec} reason=${summary.rejectionReason}`);
        }
        else {
            fail(`${name} rejected with codecs shown`, JSON.stringify({ summary, messageOk, expected: EXPECTED_MESSAGE }));
        }
    }
    return summary;
}

async function main() {
    if (VIDEO_UPLOAD_INCOMPATIBLE_USER_MESSAGE !== EXPECTED_MESSAGE) {
        fail("Exact rejection message constant", VIDEO_UPLOAD_INCOMPATIBLE_USER_MESSAGE);
    }
    else {
        pass("Exact rejection message constant");
    }

    const tyrantUrl =
        "https://aehuszoadgqtbkxsliyy.supabase.co/storage/v1/object/public/videos/33564e29-6f65-4efd-8a27-6b58bc45a455/1783979557936-tyrant.mp4";
    const maticPath = "C:\\Users\\tioni\\Downloads\\20 Matic.mp4";
    const bigBusinessPath = "C:\\Users\\tioni\\Downloads\\Big Business.mp4";

    const tyrantBytes = await sampleFromUrl(tyrantUrl);
    await inspectNamed("Tyrant.mp4", tyrantBytes, false);

    if (!existsSync(maticPath)) {
        fail("20 Matic.mp4 rejected with codecs shown", "local file missing");
    }
    else {
        await inspectNamed("20 Matic.mp4", await sampleFromFile(maticPath), false);
    }

    if (!existsSync(bigBusinessPath)) {
        fail("Big Business.mp4 accepted for publish", "local file missing");
    }
    else {
        await inspectNamed("Big Business.mp4", await sampleFromFile(bigBusinessPath), true);
    }

    writeFileSync(path.join(evidenceDir, "results.json"), JSON.stringify({ results: RESULTS }, null, 2));
    if (RESULTS.some((r) => !r.ok)) process.exit(1);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
