/**
 * Mobile topbar account-action row layout contract.
 * Run: node scripts/verify-mobile-topbar-actions.mjs
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
const shell = read("lib/ui/app-ui-shell.ts");
const panel = read("components/notification-center-panel.tsx");
const pkg = read("package.json");

const mobileAccountBlock = (() => {
    const start = page.indexOf("/* Visible account actions only");
    const alt = page.indexOf("Mobile portrait/landscape (≤820): six equal flex cells");
    const from = start >= 0 ? start : alt;
    if (from < 0) return "";
    const end = page.indexOf(".upload-shell {", from);
    return end > from ? page.slice(from, end) : page.slice(from, from + 3500);
})();

record("account actions wrapper markup", page.includes('className="topbar-account-actions"'));
record(
    "desktop topbar is 3-track grid",
    /grid-template-columns:\s*minmax\(0,\s*1\.15fr\)\s+minmax\(0,\s*0\.7fr\)\s+auto/.test(page),
);
record("no fixed 6-column topbar action grid", !page.includes("grid-template-columns: repeat(6, minmax(0, 1fr))"));
record(
    "mobile flex contract stays one row",
    mobileAccountBlock.includes("display: flex")
        && mobileAccountBlock.includes("flex-direction: row")
        && mobileAccountBlock.includes("flex-wrap: nowrap")
        && mobileAccountBlock.includes("width: 100%")
        && mobileAccountBlock.includes("max-width: 100%")
        && mobileAccountBlock.includes("min-width: 0")
        && mobileAccountBlock.includes("box-sizing: border-box"),
);
record(
    "mobile equal flex cells shrink",
    mobileAccountBlock.includes("flex: 1 1 0")
        && mobileAccountBlock.includes("min-width: 0 !important")
        && !/topbar-account-actions > \.notification-wrap[\s\S]{0,400}flex:\s*0 0 auto/.test(mobileAccountBlock)
        && !/width:\s*44px/.test(mobileAccountBlock),
);
record(
    "mobile no horizontal overflow scroll on action row",
    mobileAccountBlock.includes("overflow-x: hidden")
        && !mobileAccountBlock.includes("overflow-x: auto"),
);
record(
    "mobile no absolute/transform offsets on action children",
    page.includes("topbar-account-actions > .notification-wrap")
        && mobileAccountBlock.includes("transform: none")
        && !/transform:\s*translate/.test(mobileAccountBlock),
);
record(
    "badge remains absolute on bell only",
    panel.includes('className="notification-button"')
        && /notification-button > span:not\(\.sr-only\)[\s\S]{0,120}position:\s*absolute/.test(page),
);
record(
    "topbar bell opens notification dropdown popover",
    panel.includes('data-notification-entry="topbar"')
        && panel.includes("onToggle")
        && panel.includes("notification-center")
        && panel.includes('data-notification-panel="dropdown"')
        && page.includes("showNotificationCenter")
        && !page.includes('onOpen={() => handleNav("Notifications")}'),
);
record(
    "role gates keep null renders",
    page.includes("shouldShowUploadControl(desktopNavAccess)")
        && page.includes("shouldShowArtistDashboardControl(desktopNavAccess)")
        && page.includes("shouldShowProducerDashboardControl(desktopNavAccess)"),
);
record(
    "shell touch targets scoped to account actions",
    shell.includes(".topbar .topbar-account-actions .notification-button")
        && shell.includes("min-height: var(--ui-touch-min)"),
);
record("package has verify:mobile-topbar script", pkg.includes("verify:mobile-topbar"));

const failed = results.filter((row) => !row.ok).length;
console.log(`\nMOBILE_TOPBAR_ACTIONS_FAILS=${failed}`);
process.exit(failed ? 1 : 0);
