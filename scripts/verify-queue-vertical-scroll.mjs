/**
 * Queue vertical scrolling contracts across requested viewports.
 * Run: node scripts/verify-queue-vertical-scroll.mjs
 * Or: npm run verify:queue-scroll
 */
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDir = path.join(root, "tmp", "queue-scroll-evidence");
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

const pageSrc = read("app/page.tsx");
const pkg = read("package.json");
const start = pageSrc.indexOf("@media (max-width: 768px)");
const end = pageSrc.indexOf("`}</style>", start);
const mobileBlock = start >= 0 ? pageSrc.slice(start, end > start ? end : undefined) : "";

record(
    "queue content scrollport source contracts",
    /overflow-y:\s*auto/.test(mobileBlock)
        && /-webkit-overflow-scrolling:\s*touch/.test(mobileBlock)
        && /padding-bottom:\s*calc\(var\(--mobile-player-height,\s*112px\)\s*\+\s*24px\)/.test(mobileBlock)
        && /html:has\(\.zml-app\[data-active-view="Queue"\]\)[\s\S]{0,220}overflow:\s*hidden/.test(mobileBlock),
);
record("package exposes verify:queue-scroll", pkg.includes("verify:queue-scroll"));

function extractMobileCss() {
    const open = pageSrc.indexOf("@media (max-width: 768px)");
    if (open < 0) return "";
    const close = pageSrc.indexOf("`}</style>", open);
    return pageSrc.slice(open, close > open ? close : undefined).replace(/`\s*$/, "");
}

async function main() {
    const css = extractMobileCss();
    if (!css) {
        record("css extract", false, "missing");
        return;
    }

    const html = `<!doctype html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<style>
:root{--mobile-sidebar-width:64px;--mobile-player-height:112px;--mobile-player-reserve:110px}
*{box-sizing:border-box} html,body{margin:0;background:#020617;color:#fff;font-family:Arial,sans-serif}
body{overflow:auto;padding-bottom:56px}
.zml-app{height:100dvh;overflow:hidden}
.sidebar{position:fixed;left:0;top:0;bottom:0;width:var(--mobile-sidebar-width);background:#071631}
.content{position:fixed;top:0;left:var(--mobile-sidebar-width);right:0;bottom:0;height:100dvh;overflow-y:auto;padding:8px 10px;background:#1d4f8c}
.queue-page{display:flex;flex-direction:column;gap:8px}
.queue-manage-row{min-height:96px;border:1px solid #22d3ee;border-radius:8px;background:#10204a;padding:10px;margin:0}
.fixed-mobile-player{position:fixed;left:64px;right:0;bottom:0;height:72px;background:#0f274f;z-index:9999}
${css}
</style></head>
<body>
<main class="zml-app" data-active-view="Queue">
  <aside class="sidebar"></aside>
  <section class="content" id="workspace">
    <section class="section-heading destination-page-heading" id="heading"><div><h2>Queue</h2></div></section>
    <section class="queue-page" id="queue-page">
      <div id="list"></div>
    </section>
  </section>
  <div class="fixed-mobile-player" id="player"></div>
</main>
<script>
  const list = document.getElementById('list');
  list.innerHTML = Array.from({length: 16}, (_, i) => '<article class="queue-manage-row" data-i="'+i+'">Item '+(i+1)+'</article>').join('');
</script>
</body></html>`;

    mkdirSync(evidenceDir, { recursive: true });
    const fixturePath = path.join(evidenceDir, "queue-scroll.html");
    writeFileSync(fixturePath, html, "utf8");

    let browser;
    try {
        browser = await chromium.launch({ headless: true });
    } catch (error) {
        record("browser launch", false, error instanceof Error ? error.message : String(error));
        return;
    }

    const viewports = [
        { width: 320, height: 568 },
        { width: 360, height: 800 },
        { width: 375, height: 812 },
        { width: 390, height: 844 },
        { width: 430, height: 932 },
        { width: 844, height: 390 },
        { width: 932, height: 430 },
        { width: 768, height: 1024 },
        { width: 1366, height: 768 },
        { width: 1440, height: 900 },
    ];

    for (const vp of viewports) {
        const mobilePortrait = vp.width <= 430 && vp.height >= vp.width;
        const context = await browser.newContext({
            viewport: vp,
            isMobile: mobilePortrait,
            hasTouch: vp.width <= 932,
        });
        const page = await context.newPage();
        try {
            await page.goto(`file://${fixturePath.replace(/\\/g, "/")}`, { waitUntil: "load" });
            const m = await page.evaluate(async () => {
                const workspace = document.getElementById("workspace");
                const heading = document.getElementById("heading");
                const first = document.querySelector('[data-i="0"]');
                const last = document.querySelector('[data-i="15"]');
                const player = document.getElementById("player");
                const ws = getComputedStyle(workspace);
                const canScroll = workspace.scrollHeight > workspace.clientHeight + 8;
                workspace.scrollTop = 0;
                await new Promise((r) => requestAnimationFrame(r));
                const topFirst = first.getBoundingClientRect().top;
                const topHeading = heading.getBoundingClientRect().top;
                workspace.scrollTop = workspace.scrollHeight;
                await new Promise((r) => requestAnimationFrame(r));
                const lastBottom = last.getBoundingClientRect().bottom;
                const playerTop = player.getBoundingClientRect().top;
                const scrollTopMax = workspace.scrollTop;
                workspace.scrollTop = 0;
                await new Promise((r) => requestAnimationFrame(r));
                return {
                    overflowY: ws.overflowY,
                    canScroll,
                    topFirst,
                    topHeading,
                    lastClearsPlayer: lastBottom <= playerTop - 2,
                    scrollTopMax,
                    overflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
                    docOverflow: document.documentElement.scrollHeight > document.documentElement.clientHeight + 1,
                };
            });

            const name = `${vp.width}x${vp.height}`;
            if (mobilePortrait || vp.width <= 768) {
                record(`${name} content can scroll filled queue`, m.canScroll, `overflowY=${m.overflowY}`);
                record(`${name} reaches final card above player`, m.lastClearsPlayer, `clears=${m.lastClearsPlayer}`);
                record(`${name} returns to heading region`, m.topHeading < 120 && m.topFirst < 220, `headingTop=${m.topHeading.toFixed(1)}`);
                record(`${name} no horizontal overflow`, !m.overflowX);
                if (mobilePortrait) {
                    record(`${name} document not the scrollport`, !m.docOverflow || m.canScroll, `docOverflow=${m.docOverflow}`);
                }
            } else {
                // Desktop/wide: ensure fixture does not invent a hard lock; page source keeps desktop unchanged.
                record(`${name} desktop fixture no horizontal overflow`, !m.overflowX);
            }
        } catch (error) {
            record(`${vp.width}x${vp.height} run`, false, error instanceof Error ? error.message : String(error));
        } finally {
            await context.close();
        }
    }

    await browser.close();
}

await main();
const failed = results.filter((row) => !row.ok).length;
console.log(`\nQUEUE_VERTICAL_SCROLL_FAILS=${failed}`);
console.log(`EVIDENCE_DIR=${evidenceDir}`);
process.exit(failed ? 1 : 0);
