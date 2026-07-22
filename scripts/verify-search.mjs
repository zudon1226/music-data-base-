/**
 * Baseline search behavior lock (desktop + shared wiring).
 * Usage: npm run verify:search
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const results = [];

function record(name, ok, detail = "") {
    results.push({ name, ok: Boolean(ok), detail: String(detail || "") });
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

function read(rel) {
    const full = path.join(root, rel);
    if (!existsSync(full)) return "";
    return readFileSync(full, "utf8").replace(/\r\n/g, "\n");
}

const page = read("app/page.tsx");
const pkg = read("package.json");

record("search input wiring present", page.includes('name="search"') && page.includes("setSearchInput") && page.includes("setSearchFocused(true)"));
record("debounced search commit preserved", /setTimeout\(\(\)\s*=>\s*\{\s*setSearch\(searchInput\.trim\(\)\)/.test(page) || page.includes("setSearch(searchInput.trim())"));
record("popular + live suggestions wiring", page.includes("popularSearches") && page.includes("searchSuggestions") && page.includes('role="listbox"'));
record("suggestion selection helper preserved", page.includes("function selectSearchSuggestion") && page.includes('suggestion.id.startsWith("popular-")'));
record("desktop search input font remains 14px", /\.search-box input\s*\{[\s\S]*?font-size:\s*14px/.test(page.split("@media (max-width: 820px)")[0] || ""));
record("escape closes suggestions where supported", page.includes('event.key === "Escape"'));
record("package exposes verify:search", pkg.includes('"verify:search"'));

const fails = results.filter((item) => !item.ok);
console.log(`\nSEARCH_FAILS=${fails.length}`);
process.exit(fails.length ? 1 : 0);
