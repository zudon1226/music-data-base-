/**
 * Marketplace destination structural verification.
 * Usage: npm run verify:marketplace
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
    const marketplaceSlice = page.includes('view === "Marketplace"')
        ? page.slice(page.indexOf('view === "Marketplace"'), page.indexOf('view === "Marketplace"') + 40000)
        : "";

    record("marketplace view present", page.includes('view === "Marketplace"'));
    record("marketplace filter panel present", page.includes('className="marketplace-filters"'));
    record("genre artist producer format price selectors", marketplaceSlice.includes(">Genre<")
        && marketplaceSlice.includes(">Artist<")
        && marketplaceSlice.includes(">Producer<")
        && marketplaceSlice.includes(">Format<")
        && marketplaceSlice.includes(">Price<"));
    record("apply filters button present", marketplaceSlice.includes("Apply Filters")
        && marketplaceSlice.includes("marketplace-apply-filters"));
    record("reset filters button present", marketplaceSlice.includes("Reset Filters")
        && marketplaceSlice.includes("marketplace-reset-filters"));
    record("release grids preserved", marketplaceSlice.includes("marketplace-release-grid")
        && marketplaceSlice.includes("Featured Releases")
        && marketplaceSlice.includes("New Releases"));
    record("desktop filter grid uses five selector columns", /\.marketplace-filters\s*\{[^}]*grid-template-columns:\s*repeat\(5,\s*minmax\(130px,\s*1fr\)\)/s.test(page));
    record("marketplace page padding preserved", /\.marketplace-page\s*\{[^}]*padding-bottom:\s*130px/s.test(page));

    writeFileSync(path.join(evidenceDir, "marketplace-evidence.json"), JSON.stringify({ results }, null, 2));
    const fails = results.filter((item) => !item.ok);
    console.log(`\nMARKETPLACE_FAILS=${fails.length}`);
    process.exit(fails.length ? 1 : 0);
}

main();
