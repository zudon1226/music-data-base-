/**
 * Phase 7 — audit existing videos (read-only). Does not delete or re-upload.
 * Usage: node scripts/audit-existing-videos.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "node:fs";

function readEnv(name) {
    try {
        const text = readFileSync(".env.local", "utf8");
        const line = text.split(/\r?\n/).find((row) => row.startsWith(`${name}=`));
        if (!line) return process.env[name] || "";
        return line.slice(name.length + 1).trim().replace(/^["']|["']$/g, "");
    } catch {
        return process.env[name] || "";
    }
}

function publicUrl(supabaseUrl, storagePath) {
    const clean = String(storagePath || "").replace(/^\/+/, "").replace(/^videos\//i, "");
    if (!clean || !supabaseUrl) return "";
    return `${supabaseUrl.replace(/\/+$/, "")}/storage/v1/object/public/videos/${clean}`;
}

async function assess(row, supabaseUrl) {
    const videoCodec = String(row.video_codec || "").trim().toLowerCase();
    const audioCodec = String(row.audio_codec || "").trim().toLowerCase();
    const storagePath = String(row.storage_path || "").trim();
    const videoUrl = String(row.video_url || "").trim();
    const mimeGuess = storagePath.toLowerCase().endsWith(".webm")
        ? "video/webm"
        : storagePath.toLowerCase().endsWith(".mov")
            ? "video/quicktime"
            : "video/mp4";
    const container = mimeGuess === "video/webm" ? "webm" : mimeGuess === "video/quicktime" ? "mov" : "mp4";

    let status = "unknown";
    let reason = "Codec metadata missing or unverified.";
    let reencodeRequired = false;

    if (videoCodec === "av01" || videoCodec.startsWith("av01")) {
        status = "unsupported";
        reason = "AV1 video codec confirmed in stored metadata.";
        reencodeRequired = true;
    } else if (["hvc1", "hev1", "vp09", "vp08"].includes(videoCodec)) {
        status = "unsupported";
        reason = `Incompatible video codec ${videoCodec}.`;
        reencodeRequired = true;
    } else if (videoCodec && ["avc1", "avc2", "avc3"].includes(videoCodec) && (!audioCodec || audioCodec === "mp4a" || audioCodec.startsWith("mp4a"))) {
        status = "compatible";
        reason = "Stored H.264 + AAC/no-audio metadata.";
    } else if (videoCodec || audioCodec) {
        status = "unsupported";
        reason = `Stored codecs ${[videoCodec, audioCodec].filter(Boolean).join("/") || "unknown"} are not H.264/AAC.`;
        reencodeRequired = true;
    }

    if (!storagePath) {
        reason = `${reason} Missing storagePath — cannot regenerate durable URL.`;
    }

    const playableUrl = publicUrl(supabaseUrl, storagePath) || videoUrl;

    const desktopOk = status !== "unsupported";
    const androidOk = status === "compatible" ? true : status === "unknown" ? null : false;
    const iphoneOk = status === "compatible" ? true : status === "unknown" ? null : false;

    return {
        id: row.id,
        title: row.title || "",
        storagePathPresent: Boolean(storagePath),
        storagePath: storagePath || null,
        playableUrlObtainable: Boolean(storagePath || (videoUrl && /^https?:\/\//i.test(videoUrl))),
        mimeType: mimeGuess,
        container,
        videoCodec: videoCodec || null,
        audioCodec: audioCodec || null,
        mobileCompatibleDb: row.mobile_compatible,
        desktopCompatible: desktopOk,
        androidCompatible: androidOk,
        iphoneCompatible: iphoneOk,
        reencodeRequired,
        reason,
        playableUrlPreview: String(playableUrl || "").slice(0, 120),
    };
}

async function main() {
    const url = readEnv("NEXT_PUBLIC_SUPABASE_URL");
    const key = readEnv("SUPABASE_SERVICE_ROLE_KEY") || readEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
    if (!url || !key) {
        console.error("Missing NEXT_PUBLIC_SUPABASE_URL or service/anon key.");
        process.exit(1);
    }
    const supabase = createClient(url, key, { auth: { persistSession: false } });
    const { data, error } = await supabase
        .from("videos")
        .select("id,title,video_url,storage_path,video_codec,audio_codec,mobile_compatible,file_name,created_at")
        .order("created_at", { ascending: false })
        .limit(500);
    if (error) {
        console.error(error);
        process.exit(1);
    }
    const rows = [];
    for (const row of data || []) {
        rows.push(await assess(row, url));
    }
    const summary = {
        total: rows.length,
        compatible: rows.filter((r) => r.iphoneCompatible === true).length,
        unknown: rows.filter((r) => r.iphoneCompatible == null).length,
        unsupported: rows.filter((r) => r.iphoneCompatible === false).length,
        missingStoragePath: rows.filter((r) => !r.storagePathPresent).length,
        reencodeRequired: rows.filter((r) => r.reencodeRequired),
        labeledAv1WithoutEvidence: rows.filter((r) => String(r.videoCodec || "").includes("av01") === false && /av1/i.test(String(r.title || ""))),
        rows,
    };
    writeFileSync("tmp-video-compatibility-audit.json", JSON.stringify(summary, null, 2));
    console.log(JSON.stringify({
        total: summary.total,
        compatible: summary.compatible,
        unknown: summary.unknown,
        unsupported: summary.unsupported,
        missingStoragePath: summary.missingStoragePath,
        reencodeRequiredCount: summary.reencodeRequired.length,
        reencodeRequiredTitles: summary.reencodeRequired.map((r) => ({ title: r.title, reason: r.reason, videoCodec: r.videoCodec })),
    }, null, 2));
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
