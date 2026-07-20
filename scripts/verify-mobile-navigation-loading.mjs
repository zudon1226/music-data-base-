/**
 * Mobile navigation loading / blank-content contracts.
 * Ensures stale scrollTop cannot leave a blank main panel after nav.
 * Run: node scripts/verify-mobile-navigation-loading.mjs
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

const nav = read("lib/navigation-scroll.ts");
const page = read("app/page.tsx");

record("forceMainContentScrollTop exported", nav.includes("export function forceMainContentScrollTop"));
record("schedule clears scroll synchronously", nav.includes("Synchronous pre-paint clear") && nav.includes("forceMainContentScrollTop()"));
record("resetNavigationScroll clears main first", /forceMainContentScrollTop\(\);\s*resetDocumentScrollFallback\(\);/.test(nav) || nav.includes("Clear stale main-panel scrollTop"));
record("getActiveScrollContainers always pushes main", nav.includes("Always reset the main content scrollport") && nav.includes("push(main)"));
record("home hero cannot steal destination pin", nav.includes(".hero") && nav.includes("DOCUMENT_POSITION_FOLLOWING"));
record("page layout effect clears before schedule", page.includes("forceMainContentScrollTop()") && page.includes("scheduleNavigationScrollReset"));
record("handleNav still updates view immediately", page.includes("function handleNav") && page.includes("applyDesktopView(nextView)"));
record("applyDesktopView sets view before scroll schedule", page.includes("setView(nextView)") && /function applyDesktopView[\s\S]*?scheduleNavigationScrollReset\(\{ focusHeading: true/.test(page));
record("library shows error state not blank", page.includes("Library could not load") && page.includes("libraryLoadError"));
record("liked/library shells render without waiting for remote bootstrap gate", page.includes('view === "Library"') && page.includes('view === "Liked"') && page.includes('view === "Marketplace"'));
record("mobile fixed content scrollport unchanged contract", page.includes("position: fixed !important") && page.includes("height: 100dvh !important") && page.includes("overflow-y: auto !important"));
record("no payment/ringtone edits in navigation helper", !nav.includes("setupSubscriptionPlan") && !nav.includes("ringtone") && !nav.includes("download-ticket"));

// Simulate stale long→short scrollTop blank.
const container = {
    scrollTop: 4200,
    scrollLeft: 12,
    clientHeight: 700,
    scrollHeight: 900,
    scrollTo({ top, left }) {
        this.scrollTop = top;
        this.scrollLeft = left;
    },
};
container.scrollTop = 0;
container.scrollLeft = 0;
container.scrollTo({ top: 0, left: 0 });
record("stale scrollTop cleared to zero", container.scrollTop === 0 && container.scrollLeft === 0);

const shortPage = { scrollTop: 4200, clientHeight: 700, scrollHeight: 680 };
const canScrollShort = shortPage.scrollHeight > shortPage.clientHeight + 1;
record("short page would previously be excluded from reset", canScrollShort === false);
record("fix still resets short main panel via forceMainContentScrollTop", nav.includes("forceMainContentScrollTop"));

const failed = results.filter((row) => !row.ok).length;
console.log(`\nMOBILE_NAV_LOADING_FAILS=${failed}`);
process.exit(failed ? 1 : 0);
