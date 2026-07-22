/**
 * Focused Platform Overview ringtone-count verification.
 * Static source checks — no schema/migration changes, no purchase/download inflation.
 * Usage: node scripts/verify-platform-overview-ringtone-count.mjs
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
    const marketplace = read("app/api/ringtones/marketplace/route.ts");
    const constants = read("lib/ringtone-constants.ts");

    record(
        "overview type exposes totalRingtones",
        /totalVideos:\s*number;\s*totalRingtones:\s*number;\s*totalPlaylists:\s*number;/.test(types),
        "PlatformOverviewStats field order",
    );

    record(
        "service imports PUBLIC_RINGTONE_STATUSES",
        service.includes('from "@/lib/ringtone-constants"') && service.includes("PUBLIC_RINGTONE_STATUSES"),
    );

    record(
        "service counts ringtone_products table",
        /countRows\(\s*supabase,\s*"ringtone_products"/.test(service),
        "authoritative product table",
    );

    record(
        "service uses published marketplace visibility",
        service.includes('["status", "in", [...PUBLIC_RINGTONE_STATUSES]]')
            && service.includes('["published_at", "not_is", null]'),
        "status + published_at not null",
    );

    record(
        "marketplace uses same visibility filters",
        marketplace.includes("PUBLIC_RINGTONE_STATUSES")
            && marketplace.includes('.not("published_at", "is", null)'),
        "marketplace route alignment",
    );

    record(
        "PUBLIC_RINGTONE_STATUSES is published-only",
        /PUBLIC_RINGTONE_STATUSES[^=]*=\["published"\]/.test(constants.replace(/\s+/g, "")),
    );

    record(
        "service does not count purchase rows for overview",
        !/totalRingtones[\s\S]{0,200}ringtone_purchases/.test(service)
            && !/countRows\(\s*supabase,\s*"ringtone_purchases"/.test(service),
    );

    record(
        "product totalRingtones does not use ringtone_downloads",
        /totalRingtones:\s*ringtonesResult\.count/.test(service)
            && !/totalRingtones:\s*ringtoneDownloads/.test(service)
            && !/ringtonesResult[\s\S]{0,120}ringtone_downloads/.test(service)
            && !/totalRingtones[\s\S]{0,200}download_ticket/.test(service),
    );

    record(
        "overview maps totalRingtones from product count",
        /totalRingtones:\s*ringtonesResult\.count/.test(service),
    );

    const cardBlockMatch = ui.match(/\[\s*\["Total users"[\s\S]*?\["Followers",\s*overview\?\.totalFollowers\],\s*\]/);
    const cardBlock = cardBlockMatch?.[0] || "";
    record("overview card array present", Boolean(cardBlock), cardBlock ? `${cardBlock.length} chars` : "missing");

    const songsIdx = cardBlock.indexOf('["Songs"');
    const videosIdx = cardBlock.indexOf('["Videos"');
    const ringtonesIdx = cardBlock.indexOf('["Ringtones"');
    const playlistsIdx = cardBlock.indexOf('["Playlists"');
    const albumsIdx = cardBlock.indexOf('["Albums"');
    record(
        "Ringtones card between Videos and Playlists",
        songsIdx >= 0
            && videosIdx > songsIdx
            && ringtonesIdx > videosIdx
            && playlistsIdx > ringtonesIdx
            && albumsIdx > playlistsIdx
            && cardBlock.includes('["Ringtones", overview?.totalRingtones]'),
        `order indices songs=${songsIdx} videos=${videosIdx} ringtones=${ringtonesIdx} playlists=${playlistsIdx} albums=${albumsIdx}`,
    );

    record(
        "existing content totals still present",
        cardBlock.includes('["Songs", overview?.totalSongs]')
            && cardBlock.includes('["Videos", overview?.totalVideos]')
            && cardBlock.includes('["Playlists", overview?.totalPlaylists]')
            && cardBlock.includes('["Albums", overview?.totalAlbums]')
            && cardBlock.includes('["Music plays", overview?.totalMusicPlays]')
            && cardBlock.includes('["Followers", overview?.totalFollowers]'),
    );

    record(
        "UI still uses shared control-overview-card class",
        ui.includes('className="control-overview-card"') && ui.includes("control-overview-grid"),
    );

    record(
        "loadSnapshot path unchanged (single PCC fetch)",
        ui.includes("/api/launch/platform-control-center")
            && !/fetch\([^)]*ringtone/.test(ui),
    );

    writeFileSync(
        path.join(evidenceDir, "platform-overview-ringtone-count-evidence.json"),
        JSON.stringify({ results, checkedAt: new Date().toISOString() }, null, 2),
    );
    const fails = results.filter((item) => !item.ok);
    console.log(`\nPLATFORM_OVERVIEW_RINGTONE_COUNT_FAILS=${fails.length}`);
    process.exit(fails.length ? 1 : 0);
}

main();
