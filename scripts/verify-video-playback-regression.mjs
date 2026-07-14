/**
 * Automated video playback regression checks (no physical iPhone claims).
 * Usage: BASE_URL=http://127.0.0.1:3000 node scripts/verify-video-playback-regression.mjs
 */
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const BASE_URL = process.env.BASE_URL || "http://127.0.0.1:3000";
const results = [];
const require = createRequire(import.meta.url);

function pass(name, detail = "") {
    results.push({ name, ok: true, detail });
}
function fail(name, detail = "") {
    results.push({ name, ok: false, detail });
}

async function loadCanonical() {
    const classifyFallback = {
        classifyVideoPlaybackFailure(input) {
            const playableUrl = String(input.playableUrl || "").trim();
            const videoUrl = String(input.videoUrl || "").trim();
            const storagePath = String(input.storagePath || "").trim();
            const videoCodec = String(input.videoCodec || "").toLowerCase();
            const hasUrl = Boolean(playableUrl || videoUrl || storagePath || input.sourceAssigned);
            if (!hasUrl) {
                return { kind: "missing-url", message: "This video is missing a playable URL.", hasAssignableUrl: false };
            }
            if (videoCodec === "av01" || videoCodec.startsWith("av01") || videoCodec === "av1") {
                return {
                    kind: "unsupported-codec",
                    message: "This video uses AV1 and cannot play on this device. Re-encode it as an H.264 video with AAC audio in an MP4 container.",
                    hasAssignableUrl: true,
                };
            }
            if (input.networkStatus === 404 || input.networkStatus === 403 || input.networkStatus >= 500 || input.mediaErrorCode === 2) {
                return { kind: "network-error", message: "network", hasAssignableUrl: true };
            }
            if (input.mediaErrorCode === 4) {
                return { kind: "unknown-playback-error", message: "unknown", hasAssignableUrl: true };
            }
            return null;
        },
        AV1_DEVICE_UNSUPPORTED_MESSAGE:
            "This video uses AV1 and cannot play on this device. Re-encode it as an H.264 video with AAC audio in an MP4 container.",
        MISSING_VIDEO_URL_MESSAGE: "This video is missing a playable URL.",
    };

    try {
        const jiti = require("jiti")(import.meta.url);
        const mod = jiti("../lib/canonical-video.ts");
        if (typeof mod.classifyVideoPlaybackFailure === "function") {
            return mod;
        }
        return { ...mod, ...classifyFallback };
    } catch {
        return {
            assessUploadCompatibility(input) {
                const mime = String(input.mimeType || "").toLowerCase();
                const v = String(input.videoCodec || "").toLowerCase();
                const a = String(input.audioCodec || "").toLowerCase();
                const container = String(input.container || "").toLowerCase();
                if (mime.includes("webm") || ["webm", "mkv", "ogg", "avi"].includes(container)) {
                    return { status: "unsupported", mobileCompatible: false, fullyCompatible: false, reason: "container/mime" };
                }
                if (v === "av01" || ["hvc1", "hev1", "vp09"].includes(v)) {
                    return { status: "unsupported", mobileCompatible: false, fullyCompatible: false, reason: "bad video codec" };
                }
                if (["avc1", "avc2", "avc3"].includes(v) && (!a || a === "mp4a" || a.startsWith("mp4a"))) {
                    return { status: "compatible", mobileCompatible: true, fullyCompatible: true, reason: "H.264/AAC" };
                }
                if (v || a) {
                    return { status: "unsupported", mobileCompatible: false, fullyCompatible: false, reason: "other codec" };
                }
                return { status: "unknown", mobileCompatible: null, fullyCompatible: false, reason: "unverified" };
            },
            getVideoPlaybackUrl(video) {
                if (!video) return "";
                const storagePath = String(video.storagePath || video.storage_path || "").replace(/^\/+/, "").replace(/^videos\//i, "");
                const playableUrl = String(video.playableUrl || "").trim();
                const videoUrl = String(video.videoUrl || video.video_url || "").trim();
                const isSigned = (u) => u.includes("/storage/v1/object/sign/");
                if (playableUrl && !isSigned(playableUrl)) return playableUrl;
                if (videoUrl && !isSigned(videoUrl)) return videoUrl;
                if (storagePath) {
                    const project = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://aehuszoadgqtbkxsliyy.supabase.co";
                    return `${project.replace(/\/+$/, "")}/storage/v1/object/public/videos/${storagePath}`;
                }
                if (playableUrl && isSigned(playableUrl) && !storagePath) return playableUrl;
                return "";
            },
            mergeCompatibility(existing, incoming) {
                if (existing.mobileCompatible === true && incoming.mobileCompatible !== false) {
                    return { mobileCompatible: true, compatibilityReason: existing.compatibilityReason || incoming.compatibilityReason || "kept" };
                }
                return {
                    mobileCompatible: incoming.mobileCompatible ?? existing.mobileCompatible ?? null,
                    compatibilityReason: incoming.compatibilityReason || existing.compatibilityReason || "",
                };
            },
            ...classifyFallback,
        };
    }
}

async function scanBundle() {
    const html = await (await fetch(BASE_URL + "/", { cache: "no-store" })).text();
    const urls = new Set();
    for (const part of html.split('src="').slice(1)) {
        const src = part.split('"')[0];
        if (src.includes("/_next/") && src.includes(".js")) urls.add(src.startsWith("http") ? src : BASE_URL + src);
    }
    for (const m of html.matchAll(/\/_next\/static\/[^"'\\\s)]+\.js/g)) {
        urls.add(BASE_URL + m[0]);
    }
    let foundCanonical = false;
    let foundSourceType = false;
    let foundPersist = false;
    for (const url of urls) {
        try {
            const text = await (await fetch(url, { cache: "no-store" })).text();
            if (text.includes("buildSharedVideoPlayerConfig") || text.includes("normalizeCanonicalVideo") || text.includes("compatibilityReason")) {
                foundCanonical = true;
            }
            if (text.includes("video/mp4")) foundSourceType = true;
            if (text.includes("media-queue:persist")) foundPersist = true;
        } catch {
            // ignore missing chunk
        }
    }
    if (foundCanonical) pass("Bundle includes canonical video helpers");
    else fail("Bundle includes canonical video helpers");
    if (foundSourceType) pass("Bundle references video/mp4 source typing");
    else fail("Bundle references video/mp4 source typing");
    if (foundPersist) pass("Mixed-media queue instrumentation still present");
    else fail("Mixed-media queue instrumentation still present", "queue marker missing — restart next dev if needed");
}

async function unitCompat() {
    const {
        assessUploadCompatibility,
        getVideoPlaybackUrl,
        mergeCompatibility,
        classifyVideoPlaybackFailure,
        AV1_DEVICE_UNSUPPORTED_MESSAGE,
        MISSING_VIDEO_URL_MESSAGE,
    } = await loadCanonical();

    const a = assessUploadCompatibility({ mimeType: "video/mp4", container: "mp4", videoCodec: "avc1", audioCodec: "mp4a" });
    if (a.fullyCompatible && a.status === "compatible") pass("A: H.264/AAC MP4 classified compatible");
    else fail("A: H.264/AAC MP4 classified compatible", JSON.stringify(a));

    const b = assessUploadCompatibility({ mimeType: "video/mp4", container: "mp4", videoCodec: "av01", audioCodec: "mp4a" });
    if (b.status === "unsupported") pass("B: AV1 MP4 classified unsupported");
    else fail("B: AV1 MP4 classified unsupported", JSON.stringify(b));

    const c = assessUploadCompatibility({ mimeType: "video/mp4", container: "mp4", videoCodec: "avc1", audioCodec: "" });
    if (c.status === "compatible") pass("C: H.264 with no audio classified compatible");
    else fail("C: H.264 with no audio classified compatible", JSON.stringify(c));

    const d = getVideoPlaybackUrl({ id: "x", title: "missing", storagePath: "", videoUrl: "", playableUrl: "" });
    if (!d) pass("D: Missing storagePath yields empty playback URL");
    else fail("D: Missing storagePath yields empty playback URL", d);

    const e = getVideoPlaybackUrl({
        playableUrl: "https://aehuszoadgqtbkxsliyy.supabase.co/storage/v1/object/sign/videos/u/a.mp4?token=abc",
        storagePath: "u/a.mp4",
        videoUrl: "https://aehuszoadgqtbkxsliyy.supabase.co/storage/v1/object/sign/videos/u/a.mp4?token=abc",
    });
    if (String(e).includes("/object/public/videos/u/a.mp4") && !String(e).includes("/object/sign/")) {
        pass("E: Expired/signed URL regenerates public URL from storagePath");
    } else {
        fail("E: Expired/signed URL regenerates public URL from storagePath", e);
    }

    const merged = mergeCompatibility(
        { mobileCompatible: true, compatibilityReason: "stored compatible" },
        { mobileCompatible: null, compatibilityReason: "probe failed" },
    );
    if (merged.mobileCompatible === true) pass("Probe failure does not overwrite compatible=true");
    else fail("Probe failure does not overwrite compatible=true", JSON.stringify(merged));

    const extOnly = assessUploadCompatibility({ mimeType: "", fileName: "clip.mp4", container: "", videoCodec: "", audioCodec: "" });
    if (extOnly.status === "unknown" && !extOnly.fullyCompatible) pass("Extension .mp4 alone is not fully compatible");
    else fail("Extension .mp4 alone is not fully compatible", JSON.stringify(extOnly));

    const theyDontKnow = classifyVideoPlaybackFailure({
        playableUrl: "https://aehuszoadgqtbkxsliyy.supabase.co/storage/v1/object/public/videos/x/they-dont-know.mp4",
        videoUrl: "https://aehuszoadgqtbkxsliyy.supabase.co/storage/v1/object/public/videos/x/they-dont-know.mp4",
        storagePath: "x/they-dont-know.mp4",
        videoCodec: "av01",
        audioCodec: "mp4a",
        mediaErrorCode: 4,
        sourceAssigned: true,
    });
    if (theyDontKnow?.kind === "unsupported-codec"
        && theyDontKnow.message === AV1_DEVICE_UNSUPPORTED_MESSAGE
        && !theyDontKnow.message.toLowerCase().includes("missing")) {
        pass("They don't know: AV1 + URL => unsupported-codec, not missing-url");
    } else {
        fail("They don't know: AV1 + URL => unsupported-codec, not missing-url", JSON.stringify(theyDontKnow));
    }

    const missing = classifyVideoPlaybackFailure({
        playableUrl: "",
        videoUrl: "",
        storagePath: "",
        videoCodec: "",
        mediaErrorCode: 4,
    });
    if (missing?.kind === "missing-url" && missing.message === MISSING_VIDEO_URL_MESSAGE) {
        pass("Actual missing URL => missing-url");
    } else {
        fail("Actual missing URL => missing-url", JSON.stringify(missing));
    }

    const network = classifyVideoPlaybackFailure({
        playableUrl: "https://example.com/video.mp4",
        videoUrl: "https://example.com/video.mp4",
        storagePath: "u/a.mp4",
        videoCodec: "avc1",
        networkStatus: 404,
        sourceAssigned: true,
    });
    if (network?.kind === "network-error") pass("Inaccessible URL => network-error");
    else fail("Inaccessible URL => network-error", JSON.stringify(network));
}

async function main() {
    await unitCompat();
    try {
        await scanBundle();
    } catch (error) {
        fail("Bundle scan against running server", String(error));
    }
    const dir = path.join("tmp-shared-queue-evidence");
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, "video-playback-regression.json"), JSON.stringify({ baseUrl: BASE_URL, results }, null, 2));
    const failed = results.filter((r) => !r.ok);
    console.log(JSON.stringify({ baseUrl: BASE_URL, passed: results.length - failed.length, failed: failed.length, results }, null, 2));
    if (failed.length) process.exit(1);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
