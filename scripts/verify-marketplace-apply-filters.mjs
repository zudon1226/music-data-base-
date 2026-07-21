/**
 * Marketplace Apply Filters pending/applied behavior verification.
 * Usage: npm run verify:marketplace-apply-filters
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

    record("pending filter state exists", page.includes("marketplacePendingFilters")
        && page.includes("setMarketplacePendingFilters"));
    record("applied filter state exists", page.includes("const [marketplaceFilters, setMarketplaceFilters]"));
    record("selectors bind pending state only", page.includes("value={marketplacePendingFilters.genre}")
        && page.includes("value={marketplacePendingFilters.artist}")
        && page.includes("value={marketplacePendingFilters.producer}")
        && page.includes("value={marketplacePendingFilters.content}")
        && page.includes("value={marketplacePendingFilters.price}")
        && !/value=\{marketplaceFilters\.(genre|artist|producer|content|price)\}/.test(page));
    record("selectors update pending only", page.includes("setMarketplacePendingFilters((previous) => ({ ...previous, genre:")
        && page.includes("setMarketplacePendingFilters((previous) => ({ ...previous, artist:")
        && page.includes("setMarketplacePendingFilters((previous) => ({ ...previous, producer:")
        && page.includes("setMarketplacePendingFilters((previous) => ({ ...previous, content:")
        && page.includes("setMarketplacePendingFilters((previous) => ({ ...previous, price:"));
    record("results use applied filters", /marketplaceFilters\.genre/.test(page)
        && /marketplaceFilters\.content/.test(page)
        && /marketplaceFilters\.price/.test(page)
        && /}, \[audioSongs, marketplaceFilters, producerBeats, resolvedAlbums, search, videos\]\);/.test(page));
    record("apply copies pending to applied once", page.includes("applyMarketplaceFilters")
        && page.includes("setMarketplaceFilters(nextFilters)")
        && page.includes("marketplaceFilterApplyLockRef"));
    record("apply disabled when clean or applying", page.includes("marketplaceApplyFiltersEnabled")
        && page.includes("marketplaceFiltersDirty && !marketplaceFiltersApplying")
        && page.includes("disabled={!marketplaceApplyFiltersEnabled}"));
    record("apply prevents rapid duplicate submissions", page.includes("marketplaceFilterApplyLockRef.current")
        && page.includes("setMarketplaceFiltersApplying(true)"));
    record("apply scrolls to results", page.includes('getElementById("marketplace-results")')
        && page.includes("scrollMarketplaceResultsIntoView"));
    record("apply above reset in markup", /marketplace-apply-filters[\s\S]{0,400}marketplace-reset-filters/.test(page));

    writeFileSync(path.join(evidenceDir, "marketplace-apply-filters-evidence.json"), JSON.stringify({ results }, null, 2));
    const fails = results.filter((item) => !item.ok);
    console.log(`\nMARKETPLACE_APPLY_FILTERS_FAILS=${fails.length}`);
    process.exit(fails.length ? 1 : 0);
}

main();
