/**
 * Mobile Recently Played / Profile / Queue layout contracts.
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

function sliceRule(source, selector, limit = 800) {
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
const recentChildren = sliceRule(mobileBlock, ".recent-row > *");
const recentCopy = sliceRule(mobileBlock, ".recent-copy {");
const recentImg = sliceRule(mobileBlock, ".recent-row > img");
const recentTime = sliceRule(mobileBlock, ".recent-time {");
const recentBtn = sliceRule(mobileBlock, ".recent-row > button");
const queuePage = sliceRule(mobileBlock, ".queue-page {");
const queueEmpty = sliceRule(mobileBlock, ".queue-page .empty-state");
const profilePage = sliceRule(mobileBlock, ".profile-page {");
const profileHero = sliceRule(mobileBlock, ".profile-hero {", 1200);
const profileUpload = sliceRule(mobileBlock, ".profile-avatar-upload {");
const profileActionsMatch = mobileBlock.match(/\.profile-actions\s*\{[^}]*display:\s*grid[\s\S]{0,400}?repeat\(2,\s*minmax\(0,\s*1fr\)/);
const profileH2 = sliceRule(mobileBlock, ".profile-hero h2 {");
const profileEmail = sliceRule(mobileBlock, ".profile-email,");

record("mobile 768 breakpoint present", Boolean(mobileBlock));
record(
    "recent row content-sized (no space-between)",
    recentRow.includes("justify-content: flex-start")
        && recentRow.includes("min-height: 0")
        && recentRow.includes("height: auto")
        && !recentRow.includes("justify-content: space-between"),
);
record(
    "recent artwork 120-140px",
    recentImg.includes("width: 128px") && recentImg.includes("height: 128px"),
);
record(
    "recent children flex none",
    recentChildren.includes("flex: 0 0 auto") && recentCopy.includes("flex: 0 0 auto"),
);
record(
    "recent time above actions via order",
    recentTime.includes("order: 4") && recentBtn.includes("order: 5"),
);
record(
    "recent actions 44px touch",
    recentBtn.includes("min-height: 44px"),
);
record(
    "queue empty state no stretch",
    queuePage.includes("min-height: 0")
        && queuePage.includes("height: auto")
        && queuePage.includes("flex-grow: 0")
        && queueEmpty.includes("flex-grow: 0")
        && !queuePage.includes("padding-bottom: 150px")
        && !sliceRule(mobileBlock, ".recent-panel {").includes("padding-bottom: 150px")
        && !profilePage.includes("padding-bottom: 150px"),
);
record(
    "queue/recent/profile not unwrapped with display contents",
    !/\.content > \.queue-page[\s\S]{0,80}display:\s*contents/.test(mobileBlock)
        && !/\.content > \.recent-panel[\s\S]{0,80}display:\s*contents/.test(mobileBlock)
        && !/\.content > \.profile-page[\s\S]{0,80}display:\s*contents/.test(mobileBlock)
        && mobileBlock.includes("Keep Profile / Queue / Recently Played as real boxes"),
);
record(
    "profile hero single column mobile",
    mobileBlock.includes(".profile-hero {\n              display: flex !important;\n              flex-direction: column !important;")
        || (mobileBlock.includes("flex-direction: column !important;")
            && mobileBlock.includes(".profile-avatar-image")
            && mobileBlock.includes("width: 120px !important;")
            && mobileBlock.includes(".profile-avatar-upload")
            && mobileBlock.includes("min-height: 44px !important;")
            && Boolean(profileActionsMatch)),
);
record(
    "profile text wraps with clamp",
    profileH2.includes("clamp(")
        && profileH2.includes("overflow-wrap: anywhere")
        && profileEmail.includes("overflow-wrap: anywhere")
        && profile.includes('className="profile-hero-main"')
        && profile.includes('className="profile-email"'),
);
record(
    "destination heading markers preserved",
    page.includes("DestinationPageHeading") && heading.includes('data-nav-destination="heading"'),
);
record("package script verify:mobile-layout", pkg.includes("verify:mobile-layout"));

const failed = results.filter((row) => !row.ok).length;
console.log(`\nMOBILE_RECENT_PROFILE_QUEUE_FAILS=${failed}`);
process.exit(failed ? 1 : 0);
