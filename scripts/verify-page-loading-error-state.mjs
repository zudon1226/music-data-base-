/**
 * Page loading / error-state visibility contracts for destination views.
 * Run: node scripts/verify-page-loading-error-state.mjs
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
const heading = read("components/destination-page-heading.tsx");

record("destination heading always mounts for active view title", heading.includes("data-page-heading") && page.includes("DestinationPageHeading"));
record("library error state visible", page.includes("Library could not load") && page.includes("error-state"));
record("library empty state visible", page.includes("No songs, videos, or albums yet"));
record("liked page has empty/content branches", page.includes('view === "Liked"') && page.includes("liked-page"));
record("marketplace page shell renders immediately", page.includes('view === "Marketplace"') && page.includes("marketplace-page") && page.includes("Music Marketplace"));
record("home hero renders without remote wait", page.includes('view === "Home"') && page.includes('className="hero"'));
record("notifications show loading text", page.includes("notificationsLoading") && page.includes('t("common.loading")'));
record("video library error state path exists", page.includes("videoLibraryError") || page.includes("setVideoLibraryError"));
record("blank stale scroll cannot persist after nav", page.includes("forceMainContentScrollTop()") && read("lib/navigation-scroll.ts").includes("forceMainContentScrollTop"));

const failed = results.filter((row) => !row.ok).length;
console.log(`\nPAGE_LOADING_ERROR_STATE_FAILS=${failed}`);
process.exit(failed ? 1 : 0);
