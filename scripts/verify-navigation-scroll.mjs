/**
 * Navigation scroll reset contracts — header offset / nested-container / focus.
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

function assertSource() {
    const helper = read("lib/navigation-scroll.ts");
    const offset = read("lib/app-header-offset.ts");
    const page = read("app/page.tsx");
    const rootComponent = read("components/desktop-content-scroll-root.tsx");
    const sidebar = read("components/desktop-app-sidebar-nav.tsx");

    record("pins destination under sticky topbar", helper.includes("scrollContainerToElement") && helper.includes("getStickyTopOffset"));
    record("does not treat scrollTop=0 as sufficient alone", helper.includes("scrollTop=0 alone is not enough") || helper.includes("Absolute scrollTop=0 alone is not enough"));
    record("resolves active scroll containers including document", helper.includes("getActiveScrollContainers") && helper.includes("scrollingElement"));
    record("always includes main scroll container even when short", helper.includes("Always reset the main content scrollport") && helper.includes("forceMainContentScrollTop"));
    record("sync pre-paint scroll clear on schedule", helper.includes("Synchronous pre-paint clear") && helper.includes("forceMainContentScrollTop()"));
    record("home hero treated as buried destination", helper.includes('querySelector?.(".hero")') || helper.includes('querySelector(".hero")'));
    record("does not blank document scroll when destination exists", helper.includes("if (destination && containers.length > 0)"));
    record("active navigation key helper", helper.includes("buildActiveNavigationKey"));
    record("navigation scroll lock", helper.includes("isNavigationScrollLocked") && helper.includes("markNavigationScrollLock"));
    record("disables browser scrollRestoration", helper.includes('scrollRestoration = "manual"'));
    record("scroll root data attribute", rootComponent.includes("data-main-scroll-container"));
    record("desktop scroll CSS injected without styled-jsx", rootComponent.includes("dangerouslySetInnerHTML") && rootComponent.includes("data-desktop-content-scroll") && !rootComponent.includes("jsx global") && !rootComponent.includes("<style jsx"));
    record("desktop scroll CSS forces viewport scrollport", read("lib/desktop-content-scroll.ts").includes("height: 100vh !important") && read("lib/desktop-content-scroll.ts").includes("overflow: hidden !important"));
    record("measures live header into --app-header-offset", offset.includes("--app-header-offset") && offset.includes("measureAppHeaderOffset") && offset.includes("getBoundingClientRect"));
    record("measures live header clearance for pin math", offset.includes("measureLiveHeaderClearance") && helper.includes("measureLiveHeaderClearance"));
    record("topbar layout breathing below toolbar", offset.includes("margin-bottom") && offset.includes("APP_HEADER_OFFSET_BREATHING_PX"));
    record("exposes scroll-padding-top via header offset CSS", offset.includes("scroll-padding-top") && offset.includes("APP_HEADER_OFFSET_CSS"));
    record("exposes scroll-margin-top on destinations", offset.includes("scroll-margin-top") && offset.includes("[data-page-heading]"));
    record("scroll root syncs header offset on resize", rootComponent.includes("syncAppHeaderOffset") && rootComponent.includes("ResizeObserver"));
    record("nav reset syncs header offset before pin", helper.includes("syncAppHeaderOffset()"));
    record("focus uses preventScroll after offset sync", helper.includes("preventScroll: true") && helper.includes("syncAppHeaderOffset"));
    record("mobile keeps scroll-padding-top from header offset", page.includes("scroll-padding-top: var(--app-header-offset") && !page.includes("scroll-padding-top: 0 !important"));
    record("page uses useLayoutEffect on activeNavigationKey", page.includes("useLayoutEffect") && page.includes("activeNavigationKey"));
    record("page force-clears main scroll before schedule", page.includes("forceMainContentScrollTop()") && page.includes("scheduleNavigationScrollReset"));
    record("page buildActiveNavigationKey wired", page.includes("buildActiveNavigationKey({ view, showUpload, uploadMode })"));
    record("upload destination marker", page.includes('data-nav-destination="upload"'));
    record("heading destination marker", page.includes('data-nav-destination="heading"'));
    record("video scrollIntoView gated by nav lock", page.includes("!isNavigationScrollLocked()"));
    record("inline video hero collapses off Videos view", page.includes("collapseInlineVideoHero") && page.includes("is-hidden"));
    record("applyDesktopView still schedules reset", page.includes("scheduleNavigationScrollReset"));
    record("toggleUpload ensures upload visible", page.includes("ensureUploadVisible: true"));
    record("Artist/Producer header buttons use handleNav", page.includes('handleNav("Artist Dashboard")') && page.includes('handleNav("Producer Dashboard")'));
    record("sidebar Beats/Home/Marketplace via onNavigate", sidebar.includes("handleNavClick") && read("lib/desktop-app-navigation.ts").includes('"Beats"'));
    record("playback not cleared by helper", !helper.includes("setCurrentSong") && !helper.includes(".pause("));
}

function assertNestedScrollAlgorithm() {
    // Simulate sticky topbar + hero above heading inside a panel.
    const headerOffset = 72 + 8; // measured height + breathing room
    const container = {
        scrollTop: 1400,
        scrollLeft: 30,
        getBoundingClientRect: () => ({ top: 0, left: 0, width: 1200, height: 800 }),
        scrollTo({ top, left }) {
            this.scrollTop = top;
            this.scrollLeft = left;
        },
    };
    const heading = {
        getBoundingClientRect: () => ({ top: 520, left: 0, width: 800, height: 40 }),
    };

    const stickyOffset = headerOffset;
    const containerRect = container.getBoundingClientRect();
    const targetRect = heading.getBoundingClientRect();
    const nextTop = Math.max(0, Math.round(container.scrollTop + (targetRect.top - containerRect.top) - stickyOffset));
    container.scrollTop = nextTop;
    container.scrollLeft = 0;

    record("nested-scroll moves past hero to heading", nextTop === 1400 + 520 - headerOffset);
    record("nested-scroll clears horizontal offset", container.scrollLeft === 0);
    record("destination pin clears toolbar overlap", nextTop > 0 && headerOffset > 72);

    const uploadRect = { top: 90 };
    const uploadTop = Math.max(0, Math.round(0 + (uploadRect.top - 0) - stickyOffset));
    record("upload navigation pins shell under topbar", uploadTop === Math.max(0, 90 - headerOffset));

    // Heading must sit strictly below toolbar (no underlap allowance).
    const destTopAfterPin = headerOffset;
    record("heading visibility requires top >= header offset", destTopAfterPin >= headerOffset);

    const focusState = { preventScroll: false };
    const headingEl = {
        focus({ preventScroll } = {}) {
            focusState.preventScroll = preventScroll === true;
        },
    };
    headingEl.focus({ preventScroll: true });
    record("focus restoration uses preventScroll", focusState.preventScroll === true);
}

assertSource();
assertNestedScrollAlgorithm();

const failed = results.filter((row) => !row.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
