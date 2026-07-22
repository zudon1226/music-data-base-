/**
 * Platform Overview download-counter verification (static source checks).
 * Usage: node scripts/verify-platform-overview-download-counters.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDir = path.join(root, "tmp");
mkdirSync(evidenceDir, { recursive: true });
const results = [];

function record(name, ok, detail = "") {
    results.push({ name, ok, detail });
    console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}

function read(rel) {
    return readFileSync(path.join(root, rel), "utf8");
}

function main() {
    const types = read("lib/platform-control-center.ts");
    const service = read("lib/platform-control-center-service.ts");
    const ui = read("components/platform-control-center.tsx");
    const mediaAuth = read("lib/media-download-auth.ts");
    const songDownload = read("app/api/songs/[id]/download/route.ts");
    const videoDownload = read("app/api/videos/[id]/download/route.ts");
    const ringtoneDownload = read("app/api/ringtones/[id]/download/route.ts");
    const ringtoneTicket = read("app/api/ringtones/download/[ticket]/route.ts");
    const api = read("app/api/launch/platform-control-center/route.ts");

    record(
        "overview type exposes four download fields",
        /musicDownloads:\s*number;\s*videoDownloads:\s*number;\s*ringtoneDownloads:\s*number;\s*albumDownloads:\s*number;/.test(types),
    );

    record(
        "service sums delivered media_downloads for music/video/album",
        service.includes('sumDeliveredMediaDownloadCounts(supabase, "music")')
            && service.includes('sumDeliveredMediaDownloadCounts(supabase, "video")')
            && service.includes('sumDeliveredMediaDownloadCounts(supabase, "album")')
            && service.includes('.eq("delivery_status", "delivered")')
            && service.includes("download_count"),
    );

    record(
        "service counts ringtone_downloads rows for ringtoneDownloads",
        /countRows\(\s*supabase,\s*"ringtone_downloads"/.test(service)
            && /ringtoneDownloads:\s*ringtoneDownloadsResult\.count/.test(service),
    );

    record(
        "download query failures throw (no silent zero)",
        service.includes("Platform download metrics unavailable"),
    );

    record(
        "overview maps four download totals",
        /musicDownloads:\s*musicDownloadsResult\.total/.test(service)
            && /videoDownloads:\s*videoDownloadsResult\.total/.test(service)
            && /ringtoneDownloads:\s*ringtoneDownloadsResult\.count/.test(service)
            && /albumDownloads:\s*albumDownloadsResult\.total/.test(service),
    );

    record(
        "music/video download routes record delivered media_downloads events",
        songDownload.includes("recordMediaDownloadEvent")
            && videoDownload.includes("recordMediaDownloadEvent")
            && mediaAuth.includes('input.deliveryStatus || "delivered"')
            && mediaAuth.includes("download_count"),
    );

    record(
        "ringtone downloads insert ringtone_downloads rows",
        ringtoneDownload.includes('.from("ringtone_downloads")')
            && ringtoneDownload.includes(".insert({"),
        "direct download route",
    );

    record(
        "ringtone ticket consume inserts ringtone_downloads",
        ringtoneTicket.includes('.from("ringtone_downloads")')
            && ringtoneTicket.includes(".insert({"),
    );

    record(
        "PCC API still uses buildPlatformControlCenterSnapshot",
        api.includes("buildPlatformControlCenterSnapshot")
            && api.includes("requirePlatformOwnerUserId"),
    );

    const cardBlockMatch = ui.match(/\[\s*\["Total users"[\s\S]*?\["Followers",\s*overview\?\.totalFollowers\],\s*\]/);
    const cardBlock = cardBlockMatch?.[0] || "";
    record("overview card array present", Boolean(cardBlock));

    const musicDl = cardBlock.indexOf('["Music Downloads"');
    const videoDl = cardBlock.indexOf('["Video Downloads"');
    const ringtoneDl = cardBlock.indexOf('["Ringtone Downloads"');
    const albumDl = cardBlock.indexOf('["Album Downloads"');
    const musicPlays = cardBlock.indexOf('["Music plays"');
    record(
        "download cards between Albums and Music plays",
        musicDl > 0
            && videoDl > musicDl
            && ringtoneDl > videoDl
            && albumDl > ringtoneDl
            && musicPlays > albumDl
            && cardBlock.includes('["Music Downloads", overview?.musicDownloads]')
            && cardBlock.includes('["Video Downloads", overview?.videoDownloads]')
            && cardBlock.includes('["Ringtone Downloads", overview?.ringtoneDownloads]')
            && cardBlock.includes('["Album Downloads", overview?.albumDownloads]'),
        `m=${musicDl} v=${videoDl} r=${ringtoneDl} a=${albumDl} plays=${musicPlays}`,
    );

    record(
        "UI shows loading/error instead of silent zero without overview",
        ui.includes('loading ? t("common.loading")')
            && ui.includes('error ? "—"'),
    );

    record(
        "download counters do not use plays/views/likes/purchases",
        !/musicDownloads[\s\S]{0,80}plays/.test(service)
            && !/videoDownloads[\s\S]{0,80}views/.test(service)
            && !/ringtoneDownloads[\s\S]{0,120}ringtone_purchases/.test(service)
            && !/albumDownloads[\s\S]{0,120}album_purchases/.test(service),
    );

    writeFileSync(
        path.join(evidenceDir, "platform-overview-download-counters-evidence.json"),
        JSON.stringify({ results, checkedAt: new Date().toISOString() }, null, 2),
    );
    const fails = results.filter((item) => !item.ok);
    console.log(`\nPLATFORM_OVERVIEW_DOWNLOAD_COUNTERS_FAILS=${fails.length}`);
    process.exit(fails.length ? 1 : 0);
}

main();
