/**
 * Mobile Queue height / scrollport contract.
 * Empty Queue must not force document scroll; filled Queue must scroll inside .content.
 * Run: node scripts/verify-mobile-queue-height.mjs
 */
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDir = path.join(root, "tmp", "mobile-queue-evidence");
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

record("mobile 768 breakpoint present", Boolean(mobileBlock));
record(
    "queue locks document scroll on html/body",
    /html:has\(\.zml-app\[data-active-view="Queue"\]\)/.test(mobileBlock)
        && /body:has\(\.zml-app\[data-active-view="Queue"\]\)[\s\S]{0,300}overflow:\s*hidden/.test(mobileBlock),
);
record(
    "queue content is the vertical scrollport",
    /data-active-view="Queue"[\s\S]{0,2400}overflow-y:\s*auto/.test(mobileBlock)
        && /data-active-view="Queue"[\s\S]{0,2400}height:\s*100dvh/.test(mobileBlock)
        && /data-active-view="Queue"[\s\S]{0,2400}-webkit-overflow-scrolling:\s*touch/.test(mobileBlock)
        && /data-active-view="Queue"[\s\S]{0,2400}bottom:\s*0/.test(mobileBlock),
);
record(
    "queue page natural height + player clearance",
    /queue-page[\s\S]{0,700}flex:\s*0\s+0\s+auto/.test(mobileBlock)
        && /queue-page[\s\S]{0,900}padding-bottom:\s*calc\(var\(--mobile-player-height,\s*112px\)\s*\+\s*24px\)/.test(mobileBlock),
);
record("package script verify:queue", pkg.includes("verify:queue"));

function extractMobileCss() {
    const open = pageSrc.indexOf("@media (max-width: 768px)");
    if (open < 0) return "";
    const close = pageSrc.indexOf("`}</style>", open);
    return pageSrc.slice(open, close > open ? close : undefined).replace(/`\s*$/, "");
}

async function assertComputed() {
    const css = extractMobileCss();
    if (!css) {
        record("computed CSS extract", false, "missing mobile block");
        return;
    }

    const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<style>
  :root {
    --mobile-sidebar-width: 64px;
    --mobile-player-height: 112px;
    --mobile-player-reserve: 110px;
    --app-header-offset: 0px;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; background: #020617; color: #fff; font-family: Arial, sans-serif; }
  body { min-height: 100%; padding-bottom: calc(env(safe-area-inset-bottom) + 56px); overflow: auto; }
  .mdb-app-shell { display: block; }
  .zml-app { min-height: 100dvh; height: 100dvh; background: #12365f; overflow: hidden; outline: 2px solid #fbbf24; }
  .sidebar {
    position: fixed; top: 0; left: 0; bottom: 0;
    width: var(--mobile-sidebar-width); background: #071631;
  }
  .content {
    position: fixed !important;
    top: 0 !important;
    left: var(--mobile-sidebar-width) !important;
    right: 0 !important;
    bottom: 0 !important;
    width: auto !important;
    height: 100dvh !important;
    margin-left: 0 !important;
    padding: 8px 10px var(--mobile-player-reserve) !important;
    overflow-y: auto !important;
    background: #1d4f8c;
    outline: 2px solid #22d3ee;
    z-index: 1 !important;
  }
  .topbar { display: grid; gap: 8px; }
  .section-heading h2 { margin: 0; font-size: 22px; }
  .section-heading p { margin: 4px 0 0; color: #9bdcf0; font-size: 13px; }
  .queue-toolbar button {
    border: 0; border-radius: 8px; background: #22d3ee; color: #020617;
    font-weight: 900; width: 100%; min-height: 44px;
  }
  .empty-state {
    border: 1px solid rgba(0, 212, 255, 0.28);
    border-radius: 8px; background: #0b1736; padding: 12px;
  }
  .queue-manage-row {
    border: 1px solid rgba(0, 212, 255, 0.18);
    border-radius: 8px; background: #10204a; padding: 8px; margin-bottom: 8px;
    min-height: 120px;
  }
  .fixed-mobile-player {
    position: fixed; left: 64px; right: 0; bottom: 0; height: 72px;
    background: #0f274f; z-index: 9999;
  }
  ${css}
</style>
</head>
<body>
  <div class="mdb-app-shell mdb-ltr-shell">
    <main class="zml-app" data-active-view="Queue" id="app">
      <aside class="sidebar"></aside>
      <section class="content desktop-content-scroll-root" data-main-scroll-container id="workspace">
        <div class="topbar"><div>Top actions</div></div>
        <section class="section-heading destination-page-heading" id="queue-heading">
          <div>
            <h2>Queue</h2>
            <p>Songs and videos lined up for the player.</p>
          </div>
        </section>
        <section class="queue-page" id="queue-page">
          <div class="queue-toolbar">
            <button type="button">Clear Queue</button>
            <button type="button">Save Queue as Playlist</button>
          </div>
          <div class="empty-state" id="queue-empty">
            <h2>No media queued</h2>
            <p>Add songs or videos to the queue from any card.</p>
          </div>
          <div id="filled-list" style="display:none"></div>
        </section>
      </section>
      <div class="fixed-mobile-player" id="player"></div>
    </main>
  </div>
</body>
</html>`;

    mkdirSync(evidenceDir, { recursive: true });
    const fixturePath = path.join(evidenceDir, "queue-fixture.html");
    writeFileSync(fixturePath, html, "utf8");

    let browser;
    try {
        browser = await chromium.launch({ headless: true });
    } catch (error) {
        record("browser launch", false, error instanceof Error ? error.message : String(error));
        return;
    }

    for (const viewport of [
        { width: 390, height: 844, name: "390x844" },
        { width: 430, height: 932, name: "430x932" },
    ]) {
        const context = await browser.newContext({
            viewport,
            deviceScaleFactor: 2,
            isMobile: true,
            hasTouch: true,
        });
        const page = await context.newPage();
        try {
            await page.goto(`file://${fixturePath.replace(/\\/g, "/")}`, { waitUntil: "load" });
            const m = await page.evaluate(() => {
                const workspace = document.getElementById("workspace");
                const queue = document.getElementById("queue-page");
                const empty = document.getElementById("queue-empty");
                const heading = document.getElementById("queue-heading");
                const player = document.getElementById("player");
                const ws = getComputedStyle(workspace);
                const qs = getComputedStyle(queue);
                const bs = getComputedStyle(document.body);
                const hs = getComputedStyle(document.documentElement);
                const padBottom = parseFloat(qs.paddingBottom) || 0;
                const emptyBottom = empty.getBoundingClientRect().bottom;
                const headingTop = heading.getBoundingClientRect().top;
                return {
                    workspace: {
                        overflowY: ws.overflowY,
                        height: ws.height,
                        bottom: ws.bottom,
                        h: workspace.getBoundingClientRect().height,
                        scrollHeight: workspace.scrollHeight,
                        clientHeight: workspace.clientHeight,
                        webkitOverflow: ws.webkitOverflowScrolling || "",
                    },
                    body: {
                        overflow: bs.overflow,
                        paddingBottom: bs.paddingBottom,
                    },
                    html: {
                        overflow: hs.overflow,
                    },
                    queue: {
                        padBottom,
                        flexGrow: qs.flexGrow,
                        minHeight: qs.minHeight,
                    },
                    contentSpan: emptyBottom - headingTop,
                    playerTop: player.getBoundingClientRect().top,
                    docOverflow: document.documentElement.scrollHeight > document.documentElement.clientHeight + 1,
                    viewportH: window.innerHeight,
                };
            });

            record(
                `${viewport.name} content overflow-y auto`,
                m.workspace.overflowY === "auto" || m.workspace.overflowY === "scroll",
                `overflowY=${m.workspace.overflowY}`,
            );
            record(
                `${viewport.name} content fills viewport height`,
                m.workspace.bottom === "0px"
                    && (m.workspace.height.includes("dvh") || Math.abs(m.workspace.h - m.viewportH) <= 2),
                `bottom=${m.workspace.bottom} height=${m.workspace.height} boxH=${m.workspace.h.toFixed(1)} vh=${m.viewportH}`,
            );
            record(
                `${viewport.name} html/body overflow hidden`,
                m.html.overflow === "hidden" && m.body.overflow === "hidden",
                `html=${m.html.overflow} body=${m.body.overflow}`,
            );
            record(
                `${viewport.name} no document scroll`,
                !m.docOverflow,
                `docOverflow=${m.docOverflow}`,
            );
            record(
                `${viewport.name} queue player padding >= 120`,
                m.queue.padBottom >= 120,
                `pad=${m.queue.padBottom.toFixed(1)}`,
            );
            record(
                `${viewport.name} empty content span compact`,
                m.contentSpan >= 120 && m.contentSpan <= 560,
                `span=${m.contentSpan.toFixed(1)}`,
            );

            // Filled queue must be able to scroll inside workspace.
            await page.evaluate(() => {
                document.getElementById("queue-empty").style.display = "none";
                const list = document.getElementById("filled-list");
                list.style.display = "block";
                list.innerHTML = Array.from({ length: 12 }, (_, i) => (
                    `<article class="queue-manage-row">Queue item ${i + 1}</article>`
                )).join("");
            });
            const filled = await page.evaluate(async () => {
                const workspace = document.getElementById("workspace");
                const first = document.querySelector("#filled-list .queue-manage-row");
                const last = document.querySelector("#filled-list .queue-manage-row:last-child");
                const canScroll = workspace.scrollHeight > workspace.clientHeight + 8;
                workspace.scrollTop = workspace.scrollHeight;
                await new Promise((r) => requestAnimationFrame(r));
                const lastRect = last.getBoundingClientRect();
                const playerTop = document.getElementById("player").getBoundingClientRect().top;
                const lastClearsPlayer = lastRect.bottom <= playerTop - 4;
                workspace.scrollTop = 0;
                await new Promise((r) => requestAnimationFrame(r));
                const firstTop = first.getBoundingClientRect().top;
                return {
                    canScroll,
                    lastClearsPlayer,
                    firstTop,
                    scrollHeight: workspace.scrollHeight,
                    clientHeight: workspace.clientHeight,
                };
            });
            record(
                `${viewport.name} filled queue scrolls in content`,
                filled.canScroll,
                `scrollH=${filled.scrollHeight} clientH=${filled.clientHeight}`,
            );
            record(
                `${viewport.name} final card can clear player`,
                filled.lastClearsPlayer,
                `lastClearsPlayer=${filled.lastClearsPlayer}`,
            );
            record(
                `${viewport.name} scroll returns toward top`,
                filled.firstTop < 220,
                `firstTop=${filled.firstTop.toFixed(1)}`,
            );

            if (viewport.name === "390x844") {
                await page.screenshot({
                    path: path.join(evidenceDir, "empty-queue-390.png"),
                    fullPage: false,
                });
            }
        } catch (error) {
            record(`${viewport.name} computed run`, false, error instanceof Error ? error.message : String(error));
        } finally {
            await context.close();
        }
    }

    await browser.close();
}

await assertComputed();

const failed = results.filter((row) => !row.ok).length;
console.log(`\nMOBILE_QUEUE_HEIGHT_FAILS=${failed}`);
console.log(`EVIDENCE_DIR=${evidenceDir}`);
process.exit(failed ? 1 : 0);
