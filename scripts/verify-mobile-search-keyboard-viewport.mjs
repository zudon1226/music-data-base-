/**
 * Mobile search keyboard/visual-viewport handling for suggestion max-height.
 * Usage: npm run verify:mobile-search-keyboard-viewport
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDir = path.join(root, "tmp", "mobile-search-keyboard-viewport-evidence");
mkdirSync(evidenceDir, { recursive: true });
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

function main() {
    const page = read("app/page.tsx");
    const pkg = read("package.json");

    record(
        "visualViewport listener updates suggestion max-height token",
        page.includes("visualViewport")
            && page.includes("--search-suggestions-vv-max")
            && page.includes("searchFocused"),
    );
    record(
        "token cleared when search blurs/unfocuses",
        page.includes('removeProperty("--search-suggestions-vv-max")'),
    );
    record(
        "mobile CSS consumes vv max-height token",
        /max-height:\s*min\(var\(--search-suggestions-vv-max,\s*42dvh\),\s*280px\)/.test(page),
    );
    record(
        "no forced scrollIntoView on search focus",
        !/search[\s\S]{0,200}scrollIntoView/.test(page)
            && !/onFocus=\{[^}]*scrollIntoView/.test(page),
    );
    record(
        "search query not reset by viewport listeners",
        !/visualViewport[\s\S]{0,400}setSearchInput\(\s*""\s*\)/.test(page)
            && !/visualViewport[\s\S]{0,400}setSearch\(\s*""\s*\)/.test(page),
    );
    record(
        "no maximum-scale/user-scalable locks introduced",
        !/maximum-scale\s*=\s*1/i.test(page) && !/user-scalable\s*=\s*no/i.test(page),
    );
    record("package exposes verify:mobile-search-keyboard-viewport", pkg.includes("verify:mobile-search-keyboard-viewport"));

    writeFileSync(path.join(evidenceDir, "summary.json"), JSON.stringify({ results }, null, 2));
    const fails = results.filter((item) => !item.ok);
    console.log(`\nMOBILE_SEARCH_KEYBOARD_VIEWPORT_FAILS=${fails.length}`);
    console.log(`EVIDENCE_DIR=${evidenceDir}`);
    process.exit(fails.length ? 1 : 0);
}

main();
