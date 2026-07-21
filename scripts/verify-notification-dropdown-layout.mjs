/**
 * Notification dropdown visual layout contracts.
 * Ensures full title, equal action row, wider panel, no header ellipsis.
 * Run: node scripts/verify-notification-dropdown-layout.mjs
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
const panel = read("components/notification-center-panel.tsx");

record(
    "panel width token is 400px",
    page.includes("--notification-dropdown-width: 400px")
        && page.includes("width: min(var(--notification-dropdown-width), calc(100vw - var(--notification-dropdown-gutter)))"),
);
record(
    "desktop panel stays viewport-bounded",
    page.includes("max-width: calc(100vw - var(--notification-dropdown-gutter))")
        && page.includes("--notification-dropdown-gutter: 28px"),
);
record(
    "dropdown remains anchored under bell",
    panel.includes('data-notification-entry="topbar"')
        && page.includes("top: calc(100% + 8px);")
        && /\.notification-center \{[\s\S]{0,320}right:\s*0;/.test(page),
);
record(
    "heading uses non-truncated class",
    panel.includes('className="notification-head-heading"')
        && page.includes(".notification-head-heading")
        && page.includes("text-overflow: clip")
        && page.includes("overflow: visible"),
);
record(
    "unread count sits under heading",
    panel.includes('className="notification-head-unread"')
        && page.includes(".notification-head {")
        && page.includes("flex-direction: column"),
);
record(
    "action row is equal two-column grid",
    page.includes(".notification-head-actions {")
        && page.includes("grid-template-columns: 1fr 1fr")
        && page.includes("white-space: nowrap"),
);
record(
    "action buttons share equal height",
    page.includes("min-height: 40px")
        && page.includes("height: 40px")
        && panel.includes('data-notification-action="mark-all-read"')
        && panel.includes('data-notification-action="clear-read"'),
);
record(
    "list ellipsis scoped to notification cards only",
    page.includes(".notification-center .notification-item-main strong")
        && !/\.notification-center strong,\s*\n\s*\.notification-center span/.test(page),
);
record(
    "body remains internally scrollable",
    page.includes(".notification-center-body")
        && /overflow-y:\s*auto/.test(page),
);
record(
    "view-all stays full width",
    panel.includes('data-notification-action="view-all"')
        && page.includes(".notification-view-all")
        && /notification-view-all[\s\S]{0,120}width:\s*100%/.test(page),
);
record(
    "mobile uses min(viewport, panel) with sidebar gutter",
    page.includes("--notification-dropdown-gutter: calc(var(--mobile-sidebar-width, 64px) + 24px)")
        && page.includes("overflow-x: hidden !important"),
);
record(
    "mobile heading escapes ellipsis overrides",
    page.includes(".notification-head-heading,")
        && page.includes("max-width: none !important")
        && page.includes("text-overflow: clip !important"),
);
record(
    "behavior wiring unchanged (toggle/escape/view-all)",
    panel.includes("onToggle")
        && panel.includes('event.key === "Escape"')
        && panel.includes("pointerdown")
        && panel.includes("onViewAll")
        && panel.includes("onMarkAllRead")
        && panel.includes("onClearRead"),
);

const failed = results.filter((row) => !row.ok).length;
console.log(`\nNOTIFICATION_DROPDOWN_LAYOUT_FAILS=${failed}`);
process.exit(failed ? 1 : 0);
