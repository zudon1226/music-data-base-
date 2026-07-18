/**
 * UI polish contracts — heading spacing, touch targets, shell tokens, a11y markers.
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

const shell = read("lib/ui/app-ui-shell.ts");
const heading = read("components/destination-page-heading.tsx");
const scrollRoot = read("components/desktop-content-scroll-root.tsx");
const page = read("app/page.tsx");
const headerOffset = read("lib/app-header-offset.ts");
const navScroll = read("lib/navigation-scroll.ts");
const i18nStyles = read("lib/i18n/i18n-styles.ts");
const pkg = read("package.json");

record("ui shell tokens file exists", shell.includes("APP_UI_SHELL_CSS") && shell.includes("--ui-touch-min"));
record("page heading title token", shell.includes("--ui-title-size") && shell.includes("destination-page-heading"));
record("button touch target 44px", shell.includes("--ui-touch-min: 44px") && shell.includes("min-height: var(--ui-touch-min)"));
record("focus-visible ring", shell.includes(":focus-visible") && shell.includes("--ui-focus-ring"));
record("card padding tokens", shell.includes("--ui-card-pad") && shell.includes("dashboard-panel"));
record("bottom player content clearance", shell.includes("padding-bottom: var(--ui-space-4)"));
record(
    "global player height clearance token",
    page.includes("--global-player-height")
        && page.includes("var(--mobile-player-reserve)")
        && page.includes("player-collapse-toggle"),
);
record("horizontal overflow clip on shell", shell.includes("overflow-x: clip"));
record("rails keep horizontal scroll", shell.includes("horizontal-rail-track") && shell.includes("overflow-x: auto"));
record("mobile removes topbar translateY hack", shell.includes("transform: none !important"));
record("destination heading component markers", heading.includes('data-nav-destination="heading"') && heading.includes("data-page-heading"));
record("scroll root injects ui shell css", scrollRoot.includes("APP_UI_SHELL_CSS") && scrollRoot.includes("data-app-ui-shell"));
record("page uses DestinationPageHeading", page.includes("DestinationPageHeading") && page.includes("<DestinationPageHeading"));
record("duplicate sales hero is not h2", page.includes('className="destination-hero-lead"') && !/sales-hero[\s\S]{0,200}<h2>Shopping cart/.test(page));
record("duplicate marketplace hero is not h2", !/marketplace-hero[\s\S]{0,200}<h2>Discover releases/.test(page));
record("video scroll-margin uses header offset", page.includes("scroll-margin-top: var(--app-header-offset") && !page.includes("scroll-margin-top: 132px"));
record("nav scroll system preserved", navScroll.includes("scheduleNavigationScrollReset") && headerOffset.includes("--app-header-offset"));
record("RTL/LTR shell preserved", i18nStyles.includes("mdb-rtl-shell") || i18nStyles.includes("direction: ltr"));
record("playback helpers not cleared by ui shell", !shell.includes(".pause(") && !shell.includes("setCurrentSong"));
record("package has verify:ui script", pkg.includes("verify:ui"));
record("aria-current used in sidebar nav", read("components/desktop-app-sidebar-nav.tsx").includes("aria-current") || page.includes("aria-current"));

const failed = results.filter((row) => !row.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
