/**
 * Mobile Marketplace filter action layout verification.
 * Usage: npm run verify:mobile-marketplace-filter-actions
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
    const page = read("app/page.tsx");
    const mobileMarker = page.indexOf(".marketplace-filters button.marketplace-apply-filters,\n            .marketplace-filters button.marketplace-reset-filters");
    const mobileSlice = mobileMarker >= 0 ? page.slice(Math.max(0, mobileMarker - 400), mobileMarker + 500) : "";

    record("filter actions container stacks Apply then Reset", /marketplace-apply-filters[\s\S]{0,350}marketplace-reset-filters/.test(page)
        && /marketplace-filter-actions[\s\S]{0,80}display:\s*grid/.test(page));
    record("filter actions are full width", /\.marketplace-filter-actions\s*\{[^}]*width:\s*100%/s.test(page)
        && /\.marketplace-filter-actions\s*\{[^}]*grid-column:\s*1\s*\/\s*-1/s.test(page));
    record("mobile marketplace filters single column", /\.marketplace-filters,\s*\n\s*\.marketplace-advanced-grid,[\s\S]{0,180}grid-template-columns:\s*1fr/.test(page));
    record("mobile apply/reset full width touch targets", mobileSlice.includes("marketplace-apply-filters")
        && mobileSlice.includes("marketplace-reset-filters")
        && /min-height:\s*44px/.test(mobileSlice)
        && /width:\s*100%/.test(mobileSlice));
    record("marketplace page keeps bottom padding for player", /\.marketplace-page\s*\{[^}]*padding-bottom:\s*130px/s.test(page));
    record("results scroll margin respects player reserve", page.includes("#marketplace-results")
        && /scroll-margin-bottom:\s*var\(--mobile-player-reserve/.test(page));
    record("desktop five-column selector grid preserved", /\.marketplace-filters\s*\{[^}]*grid-template-columns:\s*repeat\(5,\s*minmax\(130px,\s*1fr\)\)/s.test(page));

    writeFileSync(path.join(evidenceDir, "mobile-marketplace-filter-actions-evidence.json"), JSON.stringify({ results }, null, 2));
    const fails = results.filter((item) => !item.ok);
    console.log(`\nMOBILE_MARKETPLACE_FILTER_ACTIONS_FAILS=${fails.length}`);
    process.exit(fails.length ? 1 : 0);
}

main();
