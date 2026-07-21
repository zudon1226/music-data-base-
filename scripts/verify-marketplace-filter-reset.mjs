/**
 * Marketplace Reset Filters behavior verification.
 * Usage: npm run verify:marketplace-filter-reset
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

    record("default marketplace filters constant", page.includes("DEFAULT_MARKETPLACE_FILTERS")
        && /genre:\s*"All Genres"/.test(page)
        && /artist:\s*"All Artists"/.test(page)
        && /producer:\s*"All Producers"/.test(page)
        && /content:\s*"All"/.test(page)
        && /price:\s*"All Prices"/.test(page));
    record("reset clears pending and applied", page.includes("resetMarketplaceFilters")
        && /setMarketplacePendingFilters\(DEFAULT_MARKETPLACE_FILTERS\)/.test(page)
        && /setMarketplaceFilters\(DEFAULT_MARKETPLACE_FILTERS\)/.test(page));
    record("reset does not require apply", /resetMarketplaceFilters[\s\S]{0,500}setMarketplaceFilters\(DEFAULT_MARKETPLACE_FILTERS\)/.test(page)
        && !/resetMarketplaceFilters[\s\S]{0,300}applyMarketplaceFilters\(/.test(page));
    record("reset button wired", page.includes('className="marketplace-reset-filters"')
        && page.includes("onClick={resetMarketplaceFilters}"));
    record("reset refreshes results scroll target", /resetMarketplaceFilters[\s\S]{0,400}scrollMarketplaceResultsIntoView/.test(page));

    writeFileSync(path.join(evidenceDir, "marketplace-filter-reset-evidence.json"), JSON.stringify({ results }, null, 2));
    const fails = results.filter((item) => !item.ok);
    console.log(`\nMARKETPLACE_FILTER_RESET_FAILS=${fails.length}`);
    process.exit(fails.length ? 1 : 0);
}

main();
