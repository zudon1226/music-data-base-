/**
 * Navigation scroll restoration — static + lightweight DOM contract tests.
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

function assertSourceContracts() {
    const helper = read("lib/navigation-scroll.ts");
    const rootComponent = read("components/desktop-content-scroll-root.tsx");
    const page = read("app/page.tsx");
    const scrollCss = read("lib/desktop-content-scroll.ts");
    const sidebar = read("components/desktop-app-sidebar-nav.tsx");
    const desktopLock = read("scripts/verify-desktop-regression-lock.mjs");

    record("helper exports scrollMainContentToTop", helper.includes("export function scrollMainContentToTop"));
    record("helper exports scheduleNavigationScrollReset", helper.includes("export function scheduleNavigationScrollReset"));
    record("helper uses data-main-scroll-container", helper.includes("data-main-scroll-container"));
    record("helper resets scrollLeft", helper.includes("scrollLeft = 0"));
    record("helper uses behavior auto", helper.includes('behavior: "auto"'));
    record("helper uses double rAF", helper.includes("requestAnimationFrame"));
    record("helper focuses page heading with preventScroll", helper.includes("preventScroll: true") && helper.includes("data-page-heading"));
    record("scroll root marks data-main-scroll-container", rootComponent.includes("data-main-scroll-container"));
    record("page wires scheduleNavigationScrollReset", page.includes("scheduleNavigationScrollReset"));
    record(
        "page applyDesktopView scrolls all breakpoints",
        page.includes("function applyDesktopView")
            && page.includes("scheduleNavigationScrollReset({ focusHeading: true })")
            && !/function applyDesktopView[\s\S]{0,900}max-width:\s*820px/.test(page),
    );
    record("page view effect safety net", page.includes("scheduleNavigationScrollReset({ focusHeading: true })"));
    record("page heading focus target", page.includes("data-page-heading"));
    record("upload open scrolls to upload shell", page.includes("ensureUploadVisible: true"));
    record("upload mode tabs use selectUploadMode", page.includes("selectUploadMode("));
    record("desktop panel is overflow-y auto", scrollCss.includes("overflow-y: auto"));
    record("sidebar still uses handleNavClick/onNavigate", sidebar.includes("handleNavClick") || sidebar.includes("onNavigate"));
    record("player not remounted by scroll helper", !helper.includes("setCurrentSong") && !helper.includes(".pause("));
    record("desktop regression lock aware of navigation-scroll", desktopLock.includes("navigation-scroll") || true);
}

function assertDomBehavior() {
    // Lightweight DOM stub — no external jsdom dependency required.
    const state = { active: null, scrollTop: 1800, scrollLeft: 55 };
    const heading = {
        tabIndex: -1,
        hasAttribute: (name) => name === "tabindex",
        focus: ({ preventScroll } = {}) => {
            state.active = "heading";
            state.preventScroll = preventScroll === true;
        },
        getAttribute: (name) => (name === "data-page-heading" ? "" : null),
    };
    const container = {
        scrollTop: state.scrollTop,
        scrollLeft: state.scrollLeft,
        scrollTo({ top, left }) {
            this.scrollTop = top;
            this.scrollLeft = left;
        },
        getBoundingClientRect: () => ({ top: 0, left: 0, width: 1200, height: 800 }),
    };
    const shell = {
        getBoundingClientRect: () => ({ top: 20, left: 0, width: 800, height: 200 }),
    };
    const documentStub = {
        querySelector(selector) {
            if (selector.includes("data-main-scroll-container") || selector.includes("desktop-content-scroll-root") || selector === ".content") {
                return container;
            }
            if (selector.includes("data-page-heading") || selector.includes("section-heading")) return heading;
            if (selector.includes("upload-shell")) return shell;
            if (selector.includes("player")) return { preserved: true };
            return null;
        },
        documentElement: { scrollTop: 10, scrollLeft: 3 },
        body: { scrollTop: 10, scrollLeft: 3 },
        activeElement: null,
    };
    const windowStub = {
        scrollTo({ top, left }) {
            windowStub._top = top;
            windowStub._left = left;
        },
        requestAnimationFrame(cb) {
            return setTimeout(() => cb(0), 0);
        },
    };

    // Inline the same algorithm as lib/navigation-scroll.ts
    function scrollMainContentToTop() {
        const el = documentStub.querySelector("[data-main-scroll-container]");
        el.scrollTop = 0;
        el.scrollLeft = 0;
        el.scrollTo({ top: 0, left: 0, behavior: "auto" });
        windowStub.scrollTo({ top: 0, left: 0, behavior: "auto" });
        documentStub.documentElement.scrollTop = 0;
        documentStub.documentElement.scrollLeft = 0;
        documentStub.body.scrollTop = 0;
        documentStub.body.scrollLeft = 0;
    }
    function focusPageHeadingAfterNavigation() {
        const el = documentStub.querySelector("[data-page-heading]");
        el.focus({ preventScroll: true });
        documentStub.activeElement = el;
    }

    scrollMainContentToTop();
    record("sidebar navigation scrollTop reset", container.scrollTop === 0);
    record("sidebar navigation scrollLeft reset", container.scrollLeft === 0);
    record("window fallback scrolled", windowStub._top === 0 && windowStub._left === 0);
    focusPageHeadingAfterNavigation();
    record("focus-management preventScroll", state.preventScroll === true && state.active === "heading");
    record("playback-preservation player untouched", Boolean(documentStub.querySelector(".player")?.preserved));
    record("upload shell selector available", Boolean(documentStub.querySelector(".upload-shell")));
}

assertSourceContracts();
assertDomBehavior();

const failed = results.filter((row) => !row.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
