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

record("account actions wrapper markup", page.includes('className="topbar-account-actions"'));
record(
    "desktop topbar is 3-track grid",
    /grid-template-columns:\s*minmax\(0,\s*1\.15fr\)\s+minmax\(0,\s*0\.7fr\)\s+auto/.test(page),
);
record("no fixed 6-column topbar action grid", !page.includes("grid-template-columns: repeat(6, minmax(0, 1fr))"));
record(
    "mobile flex contract",
    page.includes("display: flex")
        && /topbar-account-actions[\s\S]{0,240}flex-direction:\s*row/.test(page)
        && /topbar-account-actions[\s\S]{0,320}align-items:\s*center/.test(page)
        && /topbar-account-actions[\s\S]{0,400}justify-content:\s*flex-start/.test(page)
        && /topbar-account-actions[\s\S]{0,480}gap:\s*8px/.test(page)
        && /topbar-account-actions[\s\S]{0,560}flex-wrap:\s*nowrap/.test(page),
);
record(
    "mobile 44px icon buttons",
    /topbar-account-actions[\s\S]{0,1200}min-width:\s*44px/.test(page)
        && /topbar-account-actions[\s\S]{0,1200}min-height:\s*44px/.test(page)
        && /topbar-account-actions[\s\S]{0,1200}height:\s*44px/.test(page),
);
record(
    "mobile no absolute/transform offsets on action children",
    page.includes("topbar-account-actions > .notification-wrap")
        && /topbar-account-actions[\s\S]{0,900}transform:\s*none/.test(page)
        && !/topbar-account-actions[\s\S]{0,900}transform:\s*translate/.test(page),
);
record(
    "badge remains absolute on bell only",
    panel.includes('className="notification-button"')
        && /notification-button > span:not\(\.sr-only\)[\s\S]{0,120}position:\s*absolute/.test(page),
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
