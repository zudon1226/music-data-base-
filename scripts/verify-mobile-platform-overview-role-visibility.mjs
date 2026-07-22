/**
 * Mobile Platform Overview role-counter visibility.
 * Usage: node scripts/verify-mobile-platform-overview-role-visibility.mjs
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
    const mobileMarker = page.indexOf("Platform Overview: one full-width metric card per row");
    const mobileSlice = mobileMarker >= 0 ? page.slice(mobileMarker, mobileMarker + 900) : "";

    for (const label of ["Listeners", "Artists", "Producers", "Ringtones"]) {
        record(
            `${label} card in shared overview map`,
            ui.includes(`["${label}"`),
        );
    }

    record(
        "no mobile/desktop split metric arrays",
        !/matchMedia|innerWidth|isMobile|useMediaQuery/.test(ui),
    );

    record(
        "mobile does not hide overview cards",
        !/\.control-overview-card[^{]*\{[^}]*display:\s*none/s.test(mobileSlice)
            && !/\.control-overview-card:nth-child/.test(page),
    );

    record(
        "mobile single-column overview grid",
        mobileMarker >= 0 && /\.control-overview-grid\s*\{[^}]*grid-template-columns:\s*1fr/s.test(mobileSlice),
    );

    record(
        "player reserve keeps final metrics reachable",
        page.includes("scroll-padding-bottom: var(--mobile-player-reserve)")
            && page.includes("scroll-margin-bottom: var(--mobile-player-reserve)"),
    );

    writeFileSync(
        path.join(evidenceDir, "mobile-platform-overview-role-visibility-evidence.json"),
        JSON.stringify({ results, checkedAt: new Date().toISOString() }, null, 2),
    );
    const fails = results.filter((item) => !item.ok);
    console.log(`\nMOBILE_PLATFORM_OVERVIEW_ROLE_VISIBILITY_FAILS=${fails.length}`);
    process.exit(fails.length ? 1 : 0);
}

main();
