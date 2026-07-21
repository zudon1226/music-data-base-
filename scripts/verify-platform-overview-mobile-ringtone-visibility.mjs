/**
 * Focused mobile Platform Overview Ringtones card visibility verification.
 * Usage: node scripts/verify-platform-overview-mobile-ringtone-visibility.mjs
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
    const service = read("lib/platform-control-center-service.ts");
    const mobileMarker = page.indexOf("Platform Overview: one full-width metric card per row");
    const mobileSlice = mobileMarker >= 0 ? page.slice(mobileMarker, mobileMarker + 900) : "";

    record(
        "Ringtones card rendered in shared overview map",
        ui.includes('["Ringtones", overview?.totalRingtones]')
            && ui.includes('className="control-overview-card"')
            && ui.includes("data-overview-metric={String(label)}"),
    );

    record(
        "no mobile/desktop split metric arrays",
        !/matchMedia|innerWidth|isMobile|useMediaQuery/.test(ui),
    );

    record(
        "mobile does not display:none overview cards",
        !/\.control-overview-card[^{]*\{[^}]*display:\s*none/s.test(mobileSlice)
            && !/\.control-overview-grid[^{]*\{[^}]*display:\s*none/s.test(mobileSlice),
    );

    record(
        "mobile does not nth-child-hide overview cards",
        !/\.control-overview-card:nth-child/.test(page)
            && !/\.control-overview-grid\s*>\s*.*:nth-child/.test(page),
    );

    record(
        "mobile single-column keeps Ringtones in vertical flow",
        mobileMarker >= 0 && /\.control-overview-grid\s*\{[^}]*grid-template-columns:\s*1fr/s.test(mobileSlice),
    );

    record(
        "content scroll + player reserve still applied on mobile",
        page.includes("scroll-padding-bottom: var(--mobile-player-reserve)")
            && page.includes(".content article")
            && page.includes("scroll-margin-bottom: var(--mobile-player-reserve)"),
    );

    record(
        "counting/service untouched for this visibility fix",
        /countRows\(\s*supabase,\s*"ringtone_products"/.test(service)
            && /totalRingtones:\s*ringtonesResult\.count/.test(service),
    );

    record(
        "no marketplace/purchase/download route edits in this UI file",
        !ui.includes("ringtone_purchases")
            && !ui.includes("download-ticket")
            && !ui.includes("/api/ringtones/marketplace"),
    );

    writeFileSync(
        path.join(evidenceDir, "platform-overview-mobile-ringtone-visibility-evidence.json"),
        JSON.stringify({ results, checkedAt: new Date().toISOString() }, null, 2),
    );
    const fails = results.filter((item) => !item.ok);
    console.log(`\nPLATFORM_OVERVIEW_MOBILE_RINGTONE_VISIBILITY_FAILS=${fails.length}`);
    process.exit(fails.length ? 1 : 0);
}

main();
