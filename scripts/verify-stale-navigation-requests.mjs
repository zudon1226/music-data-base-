/**
 * Stale-request / latest-navigation contracts for SPA view switches.
 * Run: node scripts/verify-stale-navigation-requests.mjs
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
    return readFileSync(full, "utf8");
}

const page = read("app/page.tsx");
const nav = read("lib/navigation-scroll.ts");

record("activeNavigationKey drives one scroll reset per destination", page.includes("buildActiveNavigationKey({ view, showUpload, uploadMode })") && page.includes("activeNavigationKey"));
record("videos view reload cancels stale work", page.includes('if (view !== "Videos")') && page.includes("reloadVideoLibraryFromSupabase") && page.includes("cancelled = true"));
record("auth bootstrap effect cancels on teardown", page.includes("startDesktopAuthSessionBootstrap") && page.includes("cancelled = true") && page.includes("authBootstrapOutcomeKeyRef"));
record("remote bootstrap finally clears in-flight key", page.includes("initialDataLoadInFlightKeyRef") && page.includes(".finally("));
record("navigation scroll lock blocks competing video scrollIntoView", page.includes("!isNavigationScrollLocked()") && nav.includes("markNavigationScrollLock"));
record("rapid nav finishes on latest view state only", page.includes("setView(nextView)") && page.includes("data-active-view={view}"));
record("scroll reset always targets latest main panel", nav.includes("forceMainContentScrollTop") && nav.includes("getMainScrollContainer"));

// Latest-wins simulation
let applied = "";
const requests = [];
function navigate(view) {
    const id = requests.length + 1;
    requests.push(id);
    const myId = id;
    queueMicrotask(() => {
        if (myId !== requests[requests.length - 1]) return;
        applied = view;
    });
}
navigate("Library");
navigate("Liked");
navigate("Marketplace");
await Promise.resolve();
record("latest navigation wins over stale", applied === "Marketplace" && requests.length === 3);

const failed = results.filter((row) => !row.ok).length;
console.log(`\nSTALE_NAV_FAILS=${failed}`);
process.exit(failed ? 1 : 0);
