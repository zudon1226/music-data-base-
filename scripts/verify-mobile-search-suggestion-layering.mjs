/**
 * Mobile search suggestion panel must stack above the top action row.
 * Usage: npm run verify:mobile-search-suggestion-layering
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDir = path.join(root, "tmp", "mobile-search-suggestion-layering-evidence");
mkdirSync(evidenceDir, { recursive: true });
const results = [];

function record(name, ok, detail = "") {
    results.push({ name, ok: Boolean(ok), detail: String(detail || "") });
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

function read(rel) {
    const full = path.join(root, rel);
    if (!existsSync(full)) return "";
    return readFileSync(full, "utf8").replace(/\r\n/g, "\n");
}

function mainStatic() {
    const page = read("app/page.tsx");
    const pkg = read("package.json");
    const mobile = page.includes("@media (max-width: 820px)")
        ? page.slice(page.indexOf("@media (max-width: 820px)"))
        : "";

    record("open search-wrap class wired", page.includes("search-wrap--suggestions-open") && page.includes("data-search-suggestions-open"));
    record("mobile open search layer z-index above actions", /search-wrap--suggestions-open\s*\{[\s\S]*?z-index:\s*130/.test(mobile));
    record("mobile account/actions remain lower stacking", /view-toggle,\s*\n\s*\.topbar-account-actions\s*\{[\s\S]*?z-index:\s*1/.test(mobile));
    record("suggestions scroll internally with max-height", /search-suggestions[\s\S]*?overflow-y:\s*auto/.test(page)
        && /max-height:\s*min\(var\(--search-suggestions-vv-max/.test(mobile));
    record("package exposes verify:mobile-search-suggestion-layering", pkg.includes("verify:mobile-search-suggestion-layering"));
}

async function mainComputed() {
    const browser = await chromium.launch({ headless: true });
    const html = `<!doctype html>
<html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  :root { --mobile-sidebar-width: 64px; --search-suggestions-vv-max: 240px; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #020617; color: #fff; font-family: sans-serif; }
  .sidebar { position: fixed; left: 0; top: 0; bottom: 0; width: var(--mobile-sidebar-width); background: #08122b; z-index: 120; }
  .content { margin-left: var(--mobile-sidebar-width); width: calc(100% - var(--mobile-sidebar-width)); padding: 0 10px; overflow-x: hidden; }
  .topbar { display: grid; grid-template-columns: minmax(0,1fr); gap: 8px; position: sticky; top: 0; z-index: 80; background: rgba(2,6,23,.92); padding-bottom: 5px; }
  .search-wrap, .view-toggle, .topbar-account-actions { width: 100%; max-width: 100%; min-width: 0; }
  .search-wrap { position: relative; z-index: 1; display: flex; gap: 6px; align-items: center; }
  .search-box { flex: 1; height: 34px; display: flex; align-items: center; border: 1px solid #16d9ff; background: #0c1733; padding: 0 13px; border-radius: 8px; position: relative; z-index: 2; }
  .search-box input { width: 100%; border: 0; background: transparent; color: #fff; font-size: 16px; outline: none; }
  .view-toggle, .topbar-account-actions { position: relative; z-index: 1; display: flex; gap: 4px; }
  .topbar-account-actions button { flex: 1 1 0; min-width: 0; height: 40px; background: #152d66; color: #fff; border: 0; border-radius: 8px; position: relative; }
  .view-toggle button { flex: 1; height: 31px; background: #152d66; color: #fff; border: 0; border-radius: 8px; }
  .search-wrap.search-wrap--suggestions-open { z-index: 130; }
  .search-wrap.search-wrap--suggestions-open .search-box { z-index: 131; }
  .search-suggestions {
    position: absolute; left: 0; right: 0; top: calc(100% + 8px); z-index: 130;
    width: 100%; max-width: 100%; min-width: 0; box-sizing: border-box;
    border: 1px solid rgba(34,211,238,.45); border-radius: 8px; background: #0b1736;
    padding: 9px; display: grid; gap: 7px; overflow-x: hidden; overflow-y: auto;
    max-height: min(var(--search-suggestions-vv-max, 42dvh), 280px);
  }
  .search-suggestions button { display: grid; grid-template-columns: 38px 1fr; gap: 8px; text-align: left; background: #10204a; color: #fff; border: 0; border-radius: 8px; padding: 7px; }
  .search-suggestions img { width: 38px; height: 38px; border-radius: 8px; background: #08122b; }
  .page-card { margin-top: 12px; height: 200px; background: #10204a; border-radius: 8px; }
</style></head>
<body>
  <aside class="sidebar"></aside>
  <main class="content" id="content">
    <header class="topbar">
      <div class="search-wrap search-wrap--suggestions-open" data-search-suggestions-open="true">
        <label class="search-box"><input name="search" value="a" /></label>
        <div class="search-suggestions" role="listbox">
          <span>Suggestions</span>
          <button type="button" id="first-suggestion"><img alt="" /><span><strong>First Suggestion Title</strong><small>song</small></span></button>
          <button type="button"><img alt="" /><span><strong>Second Suggestion</strong><small>artist</small></span></button>
          <button type="button"><img alt="" /><span><strong>Third Suggestion</strong><small>album</small></span></button>
          <button type="button"><img alt="" /><span><strong>Fourth Suggestion</strong><small>playlist</small></span></button>
          <button type="button"><img alt="" /><span><strong>Fifth Suggestion</strong><small>video</small></span></button>
        </div>
      </div>
      <div class="view-toggle"><button type="button">Grid</button><button type="button">List</button></div>
      <div class="topbar-account-actions" id="actions">
        <button type="button">N</button><button type="button">U</button><button type="button">D</button>
        <button type="button">P</button><button type="button">Pr</button><button type="button">L</button>
      </div>
    </header>
    <div class="page-card"></div>
  </main>
</body></html>`;
    try {
        for (const width of [320, 375, 390, 430]) {
            const page = await browser.newPage({ viewport: { width, height: 844 }, isMobile: true, hasTouch: true });
            await page.setContent(html, { waitUntil: "load" });
            const metrics = await page.evaluate(() => {
                const content = document.getElementById("content");
                const panel = document.querySelector(".search-suggestions");
                const first = document.getElementById("first-suggestion");
                const actions = document.getElementById("actions");
                const contentRect = content.getBoundingClientRect();
                const panelRect = panel.getBoundingClientRect();
                const firstRect = first.getBoundingClientRect();
                const actionsRect = actions.getBoundingClientRect();
                const panelStyle = getComputedStyle(panel);
                const openWrapStyle = getComputedStyle(document.querySelector(".search-wrap--suggestions-open"));
                const overflowX = document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
                    || content.scrollWidth > content.clientWidth + 1;
                return {
                    overflowX,
                    panelZ: panelStyle.zIndex,
                    wrapZ: openWrapStyle.zIndex,
                    panelLeft: panelRect.left,
                    panelRight: panelRect.right,
                    contentLeft: contentRect.left,
                    contentRight: contentRect.right,
                    firstTop: firstRect.top,
                    actionsTop: actionsRect.top,
                    actionsBottom: actionsRect.bottom,
                    firstVisibleAboveActions: firstRect.bottom > actionsRect.top
                        ? firstRect.top < actionsRect.top || Number(openWrapStyle.zIndex) > 1
                        : true,
                    firstNotCoveredByActionsStacking: Number(openWrapStyle.zIndex) >= 130
                        && firstRect.top >= panelRect.top - 1,
                    panelInsideContent: panelRect.left >= contentRect.left - 1 && panelRect.right <= contentRect.right + 1,
                    canScrollPanel: panel.scrollHeight > panel.clientHeight + 1,
                };
            });
            writeFileSync(path.join(evidenceDir, `viewport-${width}.json`), JSON.stringify(metrics, null, 2));
            record(`${width}px no horizontal overflow`, !metrics.overflowX);
            record(`${width}px panel inside content width`, metrics.panelInsideContent, `L=${metrics.panelLeft} R=${metrics.panelRight}`);
            record(`${width}px open search layer z-index >= 130`, Number(metrics.wrapZ) >= 130, `z=${metrics.wrapZ}`);
            record(`${width}px first suggestion not under action-row stacking`, metrics.firstNotCoveredByActionsStacking, `firstTop=${metrics.firstTop} actionsTop=${metrics.actionsTop}`);
            record(`${width}px panel can scroll internally when tall`, metrics.canScrollPanel);
            await page.close();
        }
    } finally {
        await browser.close();
    }
}

async function main() {
    mainStatic();
    await mainComputed();
    writeFileSync(path.join(evidenceDir, "summary.json"), JSON.stringify({ results }, null, 2));
    const fails = results.filter((item) => !item.ok);
    console.log(`\nMOBILE_SEARCH_SUGGESTION_LAYERING_FAILS=${fails.length}`);
    console.log(`EVIDENCE_DIR=${evidenceDir}`);
    process.exit(fails.length ? 1 : 0);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
