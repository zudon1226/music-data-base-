/**
 * Asserts the six mobile top-action controls fit inside the content column.
 * Model: contentWidth = viewport - sidebar(64) - content padding(20)
 * Row: width 100%, six flex:1 1 0 cells, gap 4px, right pad 2px — no fixed 44px widths.
 * Run: node scripts/verify-mobile-topbar-fit.mjs
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
const pkg = read("package.json");

const accountMarker = "Mobile portrait/landscape";
const accountStart = page.indexOf(accountMarker);
const accountCss = accountStart >= 0 ? page.slice(accountStart, accountStart + 2800) : "";

const SIDEBAR_PX = 64;
const CONTENT_PAD_PX = 20; // .content padding 0 10px
const GAP_PX = 4;
const RIGHT_PAD_PX = 2;
const CONTROL_COUNT = 6;
const GAP_TOTAL = GAP_PX * (CONTROL_COUNT - 1);

const viewports = [320, 360, 375, 390, 430, 768];
const previousRow = CONTROL_COUNT * 44 + 5 * 8; // old fixed 44px + 8px gaps

record(
    "mobile action row is full-width boxed flex",
    accountCss.includes("width: 100%")
        && accountCss.includes("max-width: 100%")
        && accountCss.includes("min-width: 0")
        && accountCss.includes("box-sizing: border-box")
        && accountCss.includes("flex-wrap: nowrap")
        && accountCss.includes("overflow-x: hidden"),
);
record(
    "six equal shrinkable flex cells",
    accountCss.includes("flex: 1 1 0")
        && accountCss.includes("gap: 4px")
        && accountCss.includes("padding: 0 2px 0 0")
        && accountCss.includes("min-width: 0 !important")
        && !accountCss.includes("width: 44px")
        && !accountCss.includes("min-width: 44px"),
);
record(
    "control order markup unchanged",
    page.includes('className="topbar-account-actions"')
        && page.includes("<NotificationCenterPanel")
        && page.includes('className="upload-btn"')
        && page.includes('className="dashboard-btn"')
        && page.includes("producer-dashboard-btn")
        && page.includes('className="profile-btn"')
        && page.includes('className="logout-btn"')
        && page.indexOf("<NotificationCenterPanel") < page.indexOf('className="upload-btn"')
        && page.indexOf('className="profile-btn"') < page.indexOf('className="logout-btn"'),
);
record(
    "desktop account actions keep fixed auto sizing",
    /topbar-account-actions > \.notification-wrap,[\s\S]{0,220}flex:\s*0 0 auto;/.test(page)
        && /topbar-account-actions \{[\s\S]{0,180}gap:\s*8px;/.test(page.split("@media (max-width: 820px)")[0] || ""),
);
record(
    "badge absolute and does not set flex basis",
    /notification-button > span:not\(\.sr-only\)[\s\S]{0,80}position:\s*absolute/.test(accountCss)
        && !/notification-button > span:not\(\.sr-only\)[\s\S]{0,80}flex:/.test(accountCss),
);
record(
    "previous 44px row overflowed common portrait widths",
    previousRow > (375 - SIDEBAR_PX - CONTENT_PAD_PX)
        && previousRow > (360 - SIDEBAR_PX - CONTENT_PAD_PX)
        && previousRow > (320 - SIDEBAR_PX - CONTENT_PAD_PX),
    `previousRow=${previousRow}px vs 375avail=${375 - SIDEBAR_PX - CONTENT_PAD_PX}px`,
);

for (const vw of viewports) {
    const available = vw - SIDEBAR_PX - CONTENT_PAD_PX;
    const usable = available - RIGHT_PAD_PX - GAP_TOTAL;
    const cell = usable / CONTROL_COUNT;
    const fittedRow = CONTROL_COUNT * cell + GAP_TOTAL + RIGHT_PAD_PX;
    record(
        `${vw}px fits six controls (cell≈${cell.toFixed(1)}px)`,
        available > 0 && cell >= 28 && Math.abs(fittedRow - available) < 0.5,
        `available=${available}px previousRow=${previousRow}px cell=${cell.toFixed(1)}px`,
    );
}

// Landscape phone widths use desktop shell (≥821) — ensure desktop rules still present.
record(
    "landscape wide shells keep desktop topbar grid",
    /grid-template-columns:\s*minmax\(0,\s*1\.15fr\)\s+minmax\(0,\s*0\.7fr\)\s+auto/.test(page),
);

record(
    "package exposes verify:mobile-topbar-fit",
    pkg.includes("verify:mobile-topbar-fit")
        || existsSync(path.join(root, "scripts/verify-mobile-topbar-fit.mjs")),
);

const failed = results.filter((row) => !row.ok).length;
console.log(`\nMOBILE_TOPBAR_FIT_FAILS=${failed}`);
process.exit(failed ? 1 : 0);
