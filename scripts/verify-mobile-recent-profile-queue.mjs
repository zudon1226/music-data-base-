/**
 * Mobile Recently Played / Profile / Queue / Home hero layout contracts.
 * Run: node scripts/verify-mobile-recent-profile-queue.mjs
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

function sliceRule(source, selector, limit = 900) {
    const idx = source.lastIndexOf(selector);
    if (idx < 0) return "";
    return source.slice(idx, idx + limit);
}

const page = read("app/page.tsx");
const profile = read("components/user-profile-dashboard.tsx");
const pkg = read("package.json");
const heading = read("components/destination-page-heading.tsx");

const start = page.indexOf("@media (max-width: 768px)");
const end = page.indexOf("`}</style>", start);
const mobileBlock = start >= 0 ? page.slice(start, end > start ? end : undefined) : "";

const recentRow = sliceRule(mobileBlock, ".recent-row {");
const recentImg = sliceRule(mobileBlock, ".recent-row > img");
const recentCopy = sliceRule(mobileBlock, ".recent-copy {");
const recentTime = sliceRule(mobileBlock, ".recent-time {");
const recentActions = sliceRule(mobileBlock, ".recent-actions {");
const queuePageMatch = mobileBlock.match(/\.queue-page\s*\{[\s\S]*?display:\s*flex\s*!important;[\s\S]{0,700}?box-sizing:\s*border-box\s*!important;/);
const queuePage = queuePageMatch ? queuePageMatch[0] : "";
const queueEmptyMatch = mobileBlock.match(/\.queue-page \.empty-state\s*\{[\s\S]{0,400}?box-sizing:\s*border-box\s*!important;/);
const queueEmpty = queueEmptyMatch ? queueEmptyMatch[0] : "";
const hero = sliceRule(mobileBlock, ".hero {");
const heroLogo = sliceRule(mobileBlock, ".hero-logo {");
const heroButtons = sliceRule(mobileBlock, ".hero-buttons {");
const profileActionsMatch = mobileBlock.match(/\.profile-actions\s*\{[\s\S]{0,400}?repeat\(2,\s*minmax\(0,\s*1fr\)/);

record("mobile 768 breakpoint present", Boolean(mobileBlock));
record(
    "recent row natural height (no stretch)",
    recentRow.includes("justify-content: flex-start")
        && recentRow.includes("min-height: 0")
        && recentRow.includes("height: auto")
        && recentRow.includes("flex-grow: 0")
        && !recentRow.includes("justify-content: space-between")
        && !recentRow.includes("100vh")
        && !recentRow.includes("min-height: 100"),
);
record(
    "recent artwork compact <= 96px",
    /width:\s*80px/.test(recentImg) && /height:\s*80px/.test(recentImg),
);
record(
    "recent copy/time/actions do not grow",
    recentCopy.includes("flex-grow: 0")
        && recentTime.includes("flex-grow: 0")
        && recentActions.includes("flex-direction: column")
        && recentActions.includes("flex-grow: 0")
        && page.includes('className="recent-actions"'),
);
record(
    "recent action buttons 44px",
    mobileBlock.includes(".recent-actions > button")
        && /min-height:\s*44px/.test(sliceRule(mobileBlock, ".recent-actions > button")),
);
record(
    "queue empty state no artificial height",
    mobileBlock.includes("content:has(> .queue-page)")
        && mobileBlock.includes(".queue-page .empty-state")
        && /queue-page[\s\S]{0,500}flex-grow:\s*0/.test(mobileBlock)
        && /queue-page \.empty-state[\s\S]{0,300}min-height:\s*0/.test(mobileBlock)
        && /queue-page \.empty-state[\s\S]{0,300}flex-grow:\s*0/.test(mobileBlock)
        && !/\.queue-page\s*\{[^}]{0,200}100vh/.test(mobileBlock),
);
record(
    "queue/recent player clearance token",
    mobileBlock.includes("var(--mobile-player-reserve)")
        && mobileBlock.includes("env(safe-area-inset-bottom")
        && mobileBlock.includes("padding-bottom: 16px !important"),
);
record(
    "queue/recent/profile not display contents",
    !/\.content > \.queue-page[\s\S]{0,80}display:\s*contents/.test(mobileBlock)
        && !/\.content > \.recent-panel[\s\S]{0,80}display:\s*contents/.test(mobileBlock)
        && !/\.content > \.profile-page[\s\S]{0,80}display:\s*contents/.test(mobileBlock),
);
record(
    "home hero compact on mobile",
    hero.includes("min-height: 0")
        && heroLogo.includes("max-height: 72px")
        && heroButtons.includes("margin-top: 10px")
        && /font-size:\s*clamp\(22px/.test(mobileBlock),
);
record(
    "profile controls containment preserved",
    mobileBlock.includes("flex-direction: column !important;")
        && mobileBlock.includes(".profile-avatar-upload")
        && Boolean(profileActionsMatch)
        && profile.includes('className="profile-hero-main"'),
);
record(
    "destination heading markers preserved",
    page.includes("DestinationPageHeading") && heading.includes('data-nav-destination="heading"'),
);
record("package script verify:mobile-layout", pkg.includes("verify:mobile-layout"));

const failed = results.filter((row) => !row.ok).length;
console.log(`\nMOBILE_RECENT_PROFILE_QUEUE_FAILS=${failed}`);
process.exit(failed ? 1 : 0);
