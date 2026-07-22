/**
 * Mobile search focus-zoom lock: editable input >= 16px, no viewport meta zoom locks.
 * Usage: npm run verify:mobile-search-no-focus-zoom
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDir = path.join(root, "tmp", "mobile-search-no-focus-zoom-evidence");
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
    const layout = read("app/layout.tsx") || read("app/layout.js");
    const globals = read("app/globals.css");
    const pkg = read("package.json");
    const mobileCss = page.includes("@media (max-width: 820px)")
        ? page.slice(page.indexOf("@media (max-width: 820px)"))
        : "";
    const desktopCss = page.split("@media (max-width: 820px)")[0] || "";

    record(
        "mobile search input font-size is at least 16px",
        /\.search-box input\s*\{[\s\S]*?font-size:\s*16px/.test(mobileCss),
    );
    record(
        "desktop search input font-size remains 14px",
        /\.search-box input\s*\{[\s\S]*?font-size:\s*14px/.test(desktopCss),
    );
    record(
        "no maximum-scale=1 / user-scalable=no viewport lock",
        !/maximum-scale\s*=\s*1/i.test(page + layout + globals)
            && !/user-scalable\s*=\s*no/i.test(page + layout + globals),
    );
    record(
        "no gesture-blocking zoom javascript",
        !/gesturestart|gesturechange|preventDefault\(\).*zoom|touchmove.*preventDefault/.test(page),
    );
    record("package exposes verify:mobile-search-no-focus-zoom", pkg.includes("verify:mobile-search-no-focus-zoom"));
}

async function mainComputed() {
    const browser = await chromium.launch({ headless: true });
    const html = `<!doctype html>
<html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  :root { --mobile-sidebar-width: 64px; }
  body { margin: 0; background: #020617; }
  .content { margin-left: var(--mobile-sidebar-width); width: calc(100% - var(--mobile-sidebar-width)); padding: 0 10px; }
  .search-box { height: 34px; display: flex; align-items: center; border: 1px solid #16d9ff; background: #0c1733; padding: 0 13px; border-radius: 8px; }
  .search-box input { width: 100%; height: 100%; border: 0; background: transparent; color: #fff; font-size: 16px; outline: none; }
</style></head>
<body><main class="content"><label class="search-box"><input name="search" value="" /></label></main></body></html>`;
    try {
        for (const width of [320, 375, 390, 430]) {
            const page = await browser.newPage({
                viewport: { width, height: 844 },
                deviceScaleFactor: 2,
                isMobile: true,
                hasTouch: true,
            });
            await page.setContent(html, { waitUntil: "load" });
            const before = await page.evaluate(() => {
                const input = document.querySelector('input[name="search"]');
                const style = getComputedStyle(input);
                return {
                    fontSize: style.fontSize,
                    scale: visualViewport ? visualViewport.scale : window.devicePixelRatio,
                    scrollX: window.scrollX,
                };
            });
            await page.focus('input[name="search"]');
            await page.waitForTimeout(80);
            const after = await page.evaluate(() => {
                const input = document.querySelector('input[name="search"]');
                const style = getComputedStyle(input);
                return {
                    fontSize: style.fontSize,
                    scale: visualViewport ? visualViewport.scale : 1,
                    scrollX: window.scrollX,
                };
            });
            writeFileSync(path.join(evidenceDir, `viewport-${width}.json`), JSON.stringify({ before, after }, null, 2));
            const fontPx = Number.parseFloat(after.fontSize);
            record(`${width}px input font-size >= 16`, fontPx >= 16, `before=${before.fontSize} after=${after.fontSize}`);
            record(`${width}px focus does not change visualViewport scale`, Math.abs((after.scale || 1) - (before.scale || 1)) < 0.001, `before=${before.scale} after=${after.scale}`);
            record(`${width}px focus does not shift horizontal scroll`, Math.abs((after.scrollX || 0) - (before.scrollX || 0)) < 1, `scrollX=${after.scrollX}`);
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
    console.log(`\nMOBILE_SEARCH_NO_FOCUS_ZOOM_FAILS=${fails.length}`);
    console.log(`EVIDENCE_DIR=${evidenceDir}`);
    process.exit(fails.length ? 1 : 0);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
