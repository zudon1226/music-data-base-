/**
 * Mobile Profile / Queue / Recently Played layout contracts only.
 * Home hero must remain untouched by this verification scope.
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

const page = read("app/page.tsx");
const profile = read("components/user-profile-dashboard.tsx");
const pkg = read("package.json");
const heading = read("components/destination-page-heading.tsx");

const start = page.indexOf("@media (max-width: 768px)");
const end = page.indexOf("`}</style>", start);
const mobileBlock = start >= 0 ? page.slice(start, end > start ? end : undefined) : "";

const homeHeroMarker = "/* Home hero — compact at narrow widths so Recommended clears the player. */";
const homeHeroStillPresent = mobileBlock.includes(homeHeroMarker);

record("mobile 768 breakpoint present", Boolean(mobileBlock));
record(
    "home hero block left in place (out of scope for this fix)",
    homeHeroStillPresent,
    "Home CSS must not be deleted by Profile/Queue/RP edits",
);

record(
    "recent row natural height",
    /recent-row[\s\S]{0,400}justify-content:\s*flex-start/.test(mobileBlock)
        && /recent-row[\s\S]{0,400}min-height:\s*0/.test(mobileBlock)
        && /recent-row[\s\S]{0,400}height:\s*auto/.test(mobileBlock)
        && /recent-row[\s\S]{0,400}flex-grow:\s*0/.test(mobileBlock)
        && !/recent-row[\s\S]{0,400}justify-content:\s*space-between/.test(mobileBlock),
);
record(
    "recent artwork 112-140px",
    /recent-row > img[\s\S]{0,200}width:\s*120px/.test(mobileBlock)
        && /recent-row > img[\s\S]{0,200}height:\s*120px/.test(mobileBlock),
);
record(
    "recent actions compact column 44px",
    page.includes('className="recent-actions"')
        && /recent-actions[\s\S]{0,240}flex-direction:\s*column/.test(mobileBlock)
        && /recent-actions > button[\s\S]{0,200}min-height:\s*44px/.test(mobileBlock),
);

record(
    "queue natural height no vh stretch",
    mobileBlock.includes("content:has(> .queue-page)")
        && /queue-page[\s\S]{0,500}flex-grow:\s*0/.test(mobileBlock)
        && /queue-page \.empty-state[\s\S]{0,300}min-height:\s*0/.test(mobileBlock)
        && /queue-toolbar[\s\S]{0,200}grid-template-columns:\s*1fr/.test(mobileBlock)
        && !/\.queue-page\s*\{[^}]{0,240}100vh/.test(mobileBlock),
);
record(
    "queue player clearance token",
    mobileBlock.includes("var(--mobile-player-reserve)")
        && mobileBlock.includes("env(safe-area-inset-bottom"),
);

record(
    "profile compact card 96-112 avatar",
    /profile-avatar-image[\s\S]{0,200}width:\s*104px/.test(mobileBlock)
        || /profile-avatar,[\s\S]{0,120}width:\s*104px/.test(mobileBlock),
);
record(
    "profile change-photo 44px + edit/logout row",
    mobileBlock.includes(".profile-avatar-upload")
        && mobileBlock.includes("height: 44px !important")
        && mobileBlock.includes("repeat(2, minmax(0, 1fr))")
        && profile.includes('className="profile-hero-main"'),
);
record(
    "profile hero compact padding/gaps",
    mobileBlock.includes("padding: 12px !important")
        && mobileBlock.includes("gap: 8px !important")
        && mobileBlock.includes("clamp(18px, 5.5vw, 26px)")
        && mobileBlock.includes("width: 104px !important"),
);

record(
    "three pages not unwrapped with display contents",
    !/\.content > \.queue-page[\s\S]{0,80}display:\s*contents/.test(mobileBlock)
        && !/\.content > \.recent-panel[\s\S]{0,80}display:\s*contents/.test(mobileBlock)
        && !/\.content > \.profile-page[\s\S]{0,80}display:\s*contents/.test(mobileBlock),
);
record(
    "destination heading markers preserved",
    page.includes("DestinationPageHeading") && heading.includes('data-nav-destination="heading"'),
);
record("package script verify:mobile-layout", pkg.includes("verify:mobile-layout"));

const failed = results.filter((row) => !row.ok).length;
console.log(`\nMOBILE_PROFILE_QUEUE_RECENT_FAILS=${failed}`);
process.exit(failed ? 1 : 0);
