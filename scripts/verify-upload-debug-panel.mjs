/**
 * Verify debug panel view model for Tyrant / 20 Matic / Big Business.
 * Presentation-only: uses buildVideoUploadDebugPanelView (Summary / Fix).
 */
import { createRequire } from "node:module";
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const jiti = require("jiti")(import.meta.url);
const compat = jiti("../lib/video-upload-compatibility.ts", { alias: { "@": process.cwd() } });
const panel = jiti("../lib/video-upload-debug-panel.ts", { alias: { "@": process.cwd() } });

const results = [];
function pass(name, detail = "") {
    results.push({ name, ok: true, detail });
    console.log(`PASS ${name}${detail ? ` — ${detail}` : ""}`);
}
function fail(name, detail = "") {
    results.push({ name, ok: false, detail });
    console.log(`FAIL ${name}${detail ? ` — ${detail}` : ""}`);
}

async function sampleFromFile(filePath) {
    const buf = readFileSync(filePath);
    const sampleSize = Math.min(256 * 1024, buf.length);
    const parts = [buf.subarray(0, sampleSize)];
    if (buf.length > sampleSize) parts.push(buf.subarray(buf.length - sampleSize));
    return new Uint8Array(Buffer.concat(parts.map((p) => Buffer.from(p))));
}

async function checkFile(label, bytes, fileName, expectCompatible) {
    const inspection = compat.inspectVideoBytesForUploadCompatibility(bytes, {
        mimeType: "video/mp4",
        fileName,
    });
    const videoCodecRaw = inspection.videoCodecRaw
        || (inspection.videoCodec === "av1" ? "av01" : inspection.videoCodec === "h264" ? "avc1" : inspection.videoCodec)
        || "";
    const audioCodecRaw = inspection.audioCodecRaw
        || (inspection.audioCodec === "aac" ? "mp4a" : inspection.audioCodec)
        || "";

    const view = panel.buildVideoUploadDebugPanelView({
        fileName,
        fileSizeLabel: `${bytes.byteLength} sample bytes`,
        container: inspection.container,
        videoCodecRaw,
        audioCodecRaw,
        canPublish: inspection.canPublish,
        inspected: true,
        compatibilityReason: inspection.compatibilityReason,
    });

    console.log(JSON.stringify({
        label,
        compatibleYesNo: view.compatibleYesNo,
        statusTone: view.statusTone,
        container: view.container,
        videoCodec: view.videoCodec,
        audioCodec: view.audioCodec,
        humanReason: view.humanReason,
        recommendedFix: view.recommendedFix,
        raw: {
            video: inspection.videoCodecRaw,
            audio: inspection.audioCodecRaw,
            canonicalVideo: inspection.videoCodec,
            canonicalAudio: inspection.audioCodec,
            canPublish: inspection.canPublish,
        },
    }, null, 2));

    if (expectCompatible) {
        const ok = view.compatibleYesNo === "YES"
            && view.statusTone === "ok"
            && /H\.264|avc1/i.test(view.videoCodec)
            && /AAC|mp4a/i.test(view.audioCodec)
            && /H\.264 \(avc1\) video with AAC audio/i.test(view.humanReason)
            && /No conversion needed/i.test(view.recommendedFix);
        if (ok) pass(label, `${view.compatibleYesNo} | ${view.videoCodec} / ${view.audioCodec}`);
        else fail(label, JSON.stringify(view));
        return;
    }

    const ok = view.compatibleYesNo === "NO"
        && view.statusTone === "warn"
        && /AV1|VP9|HEVC|could not be confirmed|unsupported/i.test(view.humanReason)
        && /Only H\.264 \(avc1\) video with AAC audio is supported/i.test(view.humanReason)
        && /Re-encode this video as MP4 using H\.264 video and AAC audio/i.test(view.recommendedFix);
    if (ok) pass(label, view.humanReason.replace(/\n/g, " | "));
    else fail(label, JSON.stringify(view));
}

async function main() {
    const maticPath = "C:\\Users\\tioni\\Downloads\\20 Matic.mp4";
    const bigPath = "C:\\Users\\tioni\\Downloads\\Big Business.mp4";

    const tyrantBytes = (() => {
        const parts = [
            Buffer.from("....ftypisom"),
            Buffer.from("padding-".repeat(64)),
            Buffer.from("av01"),
            Buffer.from("-gap-".repeat(32)),
            Buffer.from("mp4a"),
            Buffer.from("tail-".repeat(64)),
        ];
        return new Uint8Array(Buffer.concat(parts));
    })();
    await checkFile("Tyrant.mp4 panel", tyrantBytes, "Tyrant.mp4", false);

    if (!existsSync(maticPath)) fail("20 Matic.mp4 panel", "file missing");
    else await checkFile("20 Matic.mp4 panel", await sampleFromFile(maticPath), "20 Matic.mp4", false);
    if (!existsSync(bigPath)) fail("Big Business.mp4 panel", "file missing");
    else await checkFile("Big Business.mp4 panel", await sampleFromFile(bigPath), "Big Business.mp4", true);

    mkdirSync("tmp-upload-compat-evidence", { recursive: true });
    writeFileSync(path.join("tmp-upload-compat-evidence", "debug-panel-results.json"), JSON.stringify({ results }, null, 2));
    if (results.some((r) => !r.ok)) process.exit(1);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
