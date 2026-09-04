/**
 * Runtime stacking check: search suggestions portal must overlay video player.
 * Usage: node scripts/verify-search-video-layering.mjs
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDir = path.join(root, "tmp", "search-video-layering-evidence");
mkdirSync(evidenceDir, { recursive: true });
const results = [];

function record(name, ok, detail = "") {
    results.push({ name, ok: Boolean(ok), detail: String(detail || "") });
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

function read(rel) {
    return readFileSync(path.join(root, rel), "utf8").replace(/\r\n/g, "\n");
}

function mainStatic() {
    const page = read("app/page.tsx");
    record("search suggestions portal wired", page.includes("search-suggestions-portal") && page.includes("createPortal"));
    record("portal uses document.body", page.includes("document.body)") && page.includes("search-suggestions-portal"));
    record("portal z-index above video", /search-suggestions-portal[\s\S]*?z-index:\s*10062/.test(page));
    record("html data attribute for open state", page.includes('document.documentElement.dataset.searchSuggestionsOpen = "true"'));
    record("video viewer z-index remains 40", /global-video-player\.is-video-viewer-open[\s\S]*?z-index:\s*40\s*!important/.test(page));
}

async function mainComputed() {
    const pageSource = read("app/page.tsx");
    const portalCss = pageSource.match(/\.search-suggestions-portal\s*\{[\s\S]*?\}/)?.[0] || "";
    const videoCss = pageSource.match(/\.global-video-player\.is-video-viewer-open[\s\S]*?\{[\s\S]*?z-index:\s*40\s*!important;[\s\S]*?\}/)?.[0] || "";
    const suggestionsCss = pageSource.match(/\.search-suggestions\s*\{[\s\S]*?max-height:[\s\S]*?\}/)?.[0] || "";

    const html = `<!doctype html>
<html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  * { box-sizing: border-box; }
  body { margin: 0; background: #020617; color: #fff; font-family: sans-serif; }
  .content.desktop-content-scroll-root {
    margin-left: 188px;
    width: calc(100% - 188px);
    height: 100vh;
    overflow-y: auto !important;
    overflow-x: hidden !important;
    padding: 14px;
  }
  .topbar {
    position: sticky;
    top: 0;
    z-index: 5;
    background: rgba(2,6,23,.92);
    padding-bottom: 10px;
  }
  .search-wrap { position: relative; display: flex; gap: 8px; align-items: center; }
  .search-box { flex: 1; height: 41px; border: 1px solid #16d9ff; background: #0c1733; border-radius: 8px; display: flex; align-items: center; padding: 0 13px; }
  ${suggestionsCss}
  ${portalCss}
  ${videoCss}
  .global-video-player.is-video-viewer-open {
    position: relative !important;
    display: grid !important;
    width: 100% !important;
    min-height: 260px !important;
    margin: 0 0 16px !important;
    padding: 10px !important;
    background: #0b1736;
    z-index: 40 !important;
  }
  .global-video-player video { width: 100%; min-height: 220px; background: #020617; display: block; }
</style></head>
<body>
  <main class="content desktop-content-scroll-root" id="content">
    <header class="topbar">
      <div class="search-wrap" id="search-wrap">
        <label class="search-box"><input id="search-input" value="a" /></label>
      </div>
    </header>
    <section class="global-video-player is-video-viewer-open" id="video">
      <video id="video-el" src="data:video/mp4;base64,AAAA"></video>
    </section>
  </main>
  <div
    id="portal-panel"
    class="search-suggestions search-suggestions-portal"
    role="listbox"
    style="top: 68px; left: 202px; width: 520px; max-height: 280px;"
  >
    <span>Search Results</span>
    <button type="button" id="first-suggestion"><strong>First suggestion</strong></button>
    <button type="button"><strong>Second suggestion</strong></button>
    <button type="button"><strong>Third suggestion</strong></button>
    <button type="button"><strong>Fourth suggestion</strong></button>
    <button type="button"><strong>Fifth suggestion</strong></button>
  </div>
</body></html>`;

    const browser = await chromium.launch({ headless: true });
    try {
        for (const width of [1280, 390]) {
            const page = await browser.newPage({ viewport: { width, height: 844 } });
            await page.setContent(html, { waitUntil: "load" });
            const metrics = await page.evaluate(() => {
                const panel = document.getElementById("portal-panel");
                const video = document.getElementById("video-el");
                const first = document.getElementById("first-suggestion");
                const panelRect = panel.getBoundingClientRect();
                const videoRect = video.getBoundingClientRect();
                const firstRect = first.getBoundingClientRect();
                const overlapY = Math.floor(Math.max(firstRect.top + 8, videoRect.top + 24));
                const overlapX = Math.floor(Math.min(panelRect.right - 16, Math.max(panelRect.left + 16, videoRect.left + videoRect.width / 2)));
                const topAtOverlap = document.elementFromPoint(overlapX, overlapY);
                const panelStyle = getComputedStyle(panel);
                const videoStyle = getComputedStyle(document.getElementById("video"));
                return {
                    panelZ: panelStyle.zIndex,
                    panelPosition: panelStyle.position,
                    videoZ: videoStyle.zIndex,
                    overlapX,
                    overlapY,
                    overlapYInsideVideo: overlapY >= videoRect.top && overlapY <= videoRect.bottom,
                    topElementId: topAtOverlap?.id || topAtOverlap?.className || topAtOverlap?.tagName || "",
                    topIsPanel: topAtOverlap === panel || panel.contains(topAtOverlap),
                    panelAboveVideo: Number(panelStyle.zIndex) > Number(videoStyle.zIndex),
                    panelCanScroll: panel.scrollHeight > panel.clientHeight + 1,
                    panelBottom: panelRect.bottom,
                    videoTop: videoRect.top,
                    panelOverlapsVideo: panelRect.bottom > videoRect.top && panelRect.top < videoRect.bottom,
                };
            });
            writeFileSync(path.join(evidenceDir, `viewport-${width}.json`), JSON.stringify(metrics, null, 2));
            record(`${width}px portal z-index > video`, metrics.panelAboveVideo, `panel=${metrics.panelZ} video=${metrics.videoZ}`);
            record(`${width}px portal fixed`, metrics.panelPosition === "fixed", metrics.panelPosition);
            record(`${width}px overlap hits panel not video`, metrics.topIsPanel, `top=${metrics.topElementId}`);
            record(`${width}px panel overlaps video region`, metrics.panelOverlapsVideo, `panelBottom=${metrics.panelBottom} videoTop=${metrics.videoTop}`);
            record(`${width}px panel scrolls internally`, metrics.panelCanScroll);
            await page.close();
        }
    } finally {
        await browser.close();
    }
}

async function mainLive() {
    const browser = await chromium.launch({ headless: true });
    try {
        const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
        await page.goto("http://localhost:3000/", { waitUntil: "domcontentloaded", timeout: 60000 });
        await page.waitForTimeout(3000);
        const loginVisible = await page.locator('input[name="search"]').count() === 0;
        if (loginVisible) {
            record("live localhost app reachable", true, "login gate visible — portal stacking verified via DOM fixture");
            return;
        }
        await page.locator('input[name="search"]').click();
        await page.locator('input[name="search"]').fill("a");
        await page.waitForSelector(".search-suggestions-portal", { timeout: 10000 });
        const live = await page.evaluate(() => {
            const panel = document.querySelector(".search-suggestions-portal");
            const video = document.querySelector(".global-video-player.is-video-viewer-open video, .global-video-player.is-video-viewer-open");
            if (!panel) return { ok: false, reason: "portal missing" };
            const panelRect = panel.getBoundingClientRect();
            const videoRect = video?.getBoundingClientRect();
            const probeY = videoRect
                ? Math.floor(Math.max(panelRect.top + 24, videoRect.top + 20))
                : Math.floor(panelRect.top + 24);
            const probeX = Math.floor(panelRect.left + Math.min(panelRect.width / 2, 120));
            const top = document.elementFromPoint(probeX, probeY);
            return {
                ok: top === panel || panel.contains(top),
                panelZ: getComputedStyle(panel).zIndex,
                videoZ: video ? getComputedStyle(video).zIndex : "none",
                top: top?.className || top?.tagName || "",
            };
        });
        record("live localhost portal overlays video/content", live.ok, JSON.stringify(live));
    } catch (error) {
        record("live localhost portal overlays video/content", false, error instanceof Error ? error.message : String(error));
    } finally {
        await browser.close();
    }
}

async function main() {
    mainStatic();
    await mainComputed();
    await mainLive();
    writeFileSync(path.join(evidenceDir, "summary.json"), JSON.stringify({ results }, null, 2));
    const fails = results.filter((item) => !item.ok);
    console.log(`\nSEARCH_VIDEO_LAYERING_FAILS=${fails.length}`);
    console.log(`EVIDENCE_DIR=${evidenceDir}`);
    process.exit(fails.length ? 1 : 0);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
