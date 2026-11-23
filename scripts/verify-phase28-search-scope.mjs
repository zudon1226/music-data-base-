/**
 * Phase 28 — Library vs catalog search scope wiring (Roll Call regression scenario).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const page = readFileSync(path.join(root, "app/page.tsx"), "utf8").replace(/\r\n/g, "\n");

const checks = [
    ["librarySearchScope state", page.includes("librarySearchScope")],
    ["library-only pool guard", /usesLibrarySearchScope\(view, search, librarySearchScope\)/.test(page)],
    ["search scope banner", page.includes("search-scope-bar")],
    ["toggle catalog search", page.includes("Search all songs instead")],
    ["toggle library search", page.includes("Search my library only")],
    ["Roll Call scenario comment", page.includes("Searching your saved library only")],
    ["catalog scope copy", page.includes("Searching the public Music Data Base catalog")],
    ["play API client", page.includes("recordQualifiedSongPlay")],
    ["upload publication radio", page.includes("songPublicationMode")],
];

let fails = 0;
for (const [name, ok] of checks) {
    console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
    if (!ok) fails += 1;
}

if (fails) process.exit(1);
console.log("\nverify-phase28-search-scope.mjs PASS");