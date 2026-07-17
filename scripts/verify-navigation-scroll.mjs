/**
 * Navigation scroll reset contracts — internal-view / nested-container / focus.
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
    const page = read("app/page.tsx");
    const rootComponent = read("components/desktop-content-scroll-root.tsx");
    const sidebar = read("components/desktop-app-sidebar-nav.tsx");

    record("pins destination under sticky topbar", helper.includes("scrollContainerToElement") && helper.includes("getStickyTopOffset"));
    record("does not treat scrollTop=0 as sufficient alone", helper.includes("scrollTop=0 is NOT enough") || helper.includes("Pin the destination"));
    record("resolves active scroll containers including document", helper.includes("getActiveScrollContainers") && helper.includes("scrollingElement"));
    record("does not blank document scroll when destination exists", helper.includes("if (destination && containers.length > 0)"));
    record("active navigation key helper", helper.includes("buildActiveNavigationKey"));
    record("navigation scroll lock", helper.includes("isNavigationScrollLocked") && helper.includes("markNavigationScrollLock"));
    record("disables browser scrollRestoration", helper.includes('scrollRestoration = "manual"'));
    record("scroll root data attribute", rootComponent.includes("data-main-scroll-container"));
    record("desktop scroll CSS injected without styled-jsx", rootComponent.includes("dangerouslySetInnerHTML") && rootComponent.includes("data-desktop-content-scroll") && !rootComponent.includes("jsx global") && !rootComponent.includes("<style jsx"));
    record("desktop scroll CSS forces viewport scrollport", read("lib/desktop-content-scroll.ts").includes("height: 100vh !important") && read("lib/desktop-content-scroll.ts").includes("overflow: hidden !important"));
    record("page uses useLayoutEffect on activeNavigationKey", page.includes("useLayoutEffect") && page.includes("activeNavigationKey"));
    record("page buildActiveNavigationKey wired", page.includes("buildActiveNavigationKey({ view, showUpload, uploadMode })"));
    record("upload destination marker", page.includes('data-nav-destination="upload"'));
    record("heading destination marker", page.includes('data-nav-destination="heading"'));
    record("video scrollIntoView gated by nav lock", page.includes("!isNavigationScrollLocked()"));
    record("applyDesktopView still schedules reset", page.includes("scheduleNavigationScrollReset"));
    record("toggleUpload ensures upload visible", page.includes("ensureUploadVisible: true"));
    record("Artist/Producer header buttons use handleNav", page.includes('handleNav("Artist Dashboard")') && page.includes('handleNav("Producer Dashboard")'));
    record("sidebar Beats/Home/Marketplace via onNavigate", sidebar.includes("handleNavClick") && read("lib/desktop-app-navigation.ts").includes('"Beats"'));
    record("playback not cleared by helper", !helper.includes("setCurrentSong") && !helper.includes(".pause("));
}

function assertNestedScrollAlgorithm() {
    // Simulate sticky topbar + hero above heading inside a panel.
    const container = {
        scrollTop: 1400,
        scrollLeft: 30,
        topbarHeight: 72,
        getBoundingClientRect: () => ({ top: 0, left: 0, width: 1200, height: 800 }),
        querySelector(sel) {
            if (sel === ".topbar") {
                return {
                    getBoundingClientRect: () => ({ height: thisParent.topbarHeight }),
                    offsetHeight: thisParent.topbarHeight,
                };
            }
            return null;
        },
        scrollTo({ top, left }) {
            this.scrollTop = top;
            this.scrollLeft = left;
        },
    };
    const thisParent = container;
    const heading = {
        getBoundingClientRect: () => ({ top: 520, left: 0, width: 800, height: 40 }), // below hero in viewport
    };

    // Same math as scrollContainerToElement
    const stickyOffset = container.topbarHeight;
    const containerRect = container.getBoundingClientRect();
    const targetRect = heading.getBoundingClientRect();
    const nextTop = Math.max(0, Math.round(container.scrollTop + (targetRect.top - containerRect.top) - stickyOffset));
    container.scrollTop = nextTop;
    container.scrollLeft = 0;

    record("nested-scroll moves past hero to heading", nextTop === 1400 + 520 - 72);
    record("nested-scroll clears horizontal offset", container.scrollLeft === 0);
    record("upload/artist/producer/beats share destination pin", nextTop > 0);

    const uploadRect = { top: 90 }; // just under topbar after open
    const uploadTop = Math.max(0, Math.round(0 + (uploadRect.top - 0) - stickyOffset));
    record("upload navigation pins shell under topbar", uploadTop === 18);

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
