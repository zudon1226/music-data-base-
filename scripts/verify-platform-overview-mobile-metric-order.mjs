/**
 * Focused mobile Platform Overview metric-order verification.
 * Ensures Videos → Ringtones → Playlists and one full-width card per mobile row.
 * Usage: node scripts/verify-platform-overview-mobile-metric-order.mjs
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
    return readFileSync(path.join(root, rel), "utf8").replace(/\r\n/g, "\n");
}

function main() {
    const ui = read("components/platform-control-center.tsx");
    const page = read("app/page.tsx");

    const expected = [
        "Total users",
        "Approved users",
        "Pending users",
        "Rejected users",
        "Artists",
        "Producers",
        "Songs",
        "Videos",
        "Ringtones",
        "Playlists",
        "Albums",
        "Music plays",
        "Video views",
        "Likes",
        "Followers",
    ];

    const cardBlockMatch = ui.match(/\[\s*\["Total users"[\s\S]*?\["Followers",\s*overview\?\.totalFollowers\],\s*\]/);
    const cardBlock = cardBlockMatch?.[0] || "";
    record("overview card array present", Boolean(cardBlock));

    let lastIdx = -1;
    let orderOk = true;
    for (const label of expected) {
        const idx = cardBlock.indexOf(`["${label}"`);
        if (idx < 0 || idx <= lastIdx) {
            orderOk = false;
            record(`metric order includes ${label}`, false, `idx=${idx} last=${lastIdx}`);
            break;
        }
        lastIdx = idx;
    }
    if (orderOk) record("full mobile metric order Videos→Ringtones→Playlists", true, expected.join(" → "));

    const videosIdx = cardBlock.indexOf('["Videos"');
    const ringtonesIdx = cardBlock.indexOf('["Ringtones"');
    const playlistsIdx = cardBlock.indexOf('["Playlists"');
    record(
        "Videos → Ringtones → Playlists adjacency",
        videosIdx >= 0 && ringtonesIdx > videosIdx && playlistsIdx > ringtonesIdx,
        `v=${videosIdx} r=${ringtonesIdx} p=${playlistsIdx}`,
    );

    record(
        "exactly one Ringtones metric entry",
        (cardBlock.match(/\["Ringtones"/g) || []).length === 1,
    );

    record(
        "mobile ≤820 forces single-column overview grid",
        page.includes("Platform Overview: one full-width metric card per row")
            && /\.control-overview-grid\s*\{[^}]*grid-template-columns:\s*1fr/s.test(page),
        "grid-template-columns: 1fr",
    );

    record(
        "mobile overview cards are full width",
        /\.control-overview-card\s*\{[^}]*width:\s*100%/s.test(page)
            && page.includes("Platform Overview: one full-width metric card per row"),
    );

    record(
        "desktop overview grid unchanged (auto-fit minmax)",
        /\.control-overview-grid\s*\{[^}]*grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(140px,\s*1fr\)\)/s.test(page),
    );

    record(
        "no duplicate ringtone overview fetch",
        !/fetch\([^)]*ringtone/.test(ui) && ui.includes("/api/launch/platform-control-center"),
    );

    writeFileSync(
        path.join(evidenceDir, "platform-overview-mobile-metric-order-evidence.json"),
        JSON.stringify({ results, checkedAt: new Date().toISOString() }, null, 2),
    );
    const fails = results.filter((item) => !item.ok);
    console.log(`\nPLATFORM_OVERVIEW_MOBILE_METRIC_ORDER_FAILS=${fails.length}`);
    process.exit(fails.length ? 1 : 0);
}

main();
