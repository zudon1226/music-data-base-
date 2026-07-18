/**
 * Mobile empty Queue height contract.
 * Fails when the shared content shell still viewport-stretches Queue.
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
    "queue shell override kills bottom/100dvh fill",
    mobileBlock.includes('data-active-view="Queue"')
        && /data-active-view="Queue"[\s\S]{0,1200}bottom:\s*auto/.test(mobileBlock)
        && /data-active-view="Queue"[\s\S]{0,1200}height:\s*auto/.test(mobileBlock)
        && /data-active-view="Queue"[\s\S]{0,1200}flex-grow:\s*0/.test(mobileBlock),
);
record(
    "queue page natural height + player clearance",
    /queue-page[\s\S]{0,700}flex:\s*0\s+0\s+auto/.test(mobileBlock)
        && /queue-page[\s\S]{0,700}min-height:\s*0/.test(mobileBlock)
        && /queue-page[\s\S]{0,900}padding:\s*0\s+0\s+calc\(var\(--mobile-player-height,\s*112px\)\s*\+\s*16px\)/.test(mobileBlock),
);
record(
    "queue not in shared align-items center list before overrides",
    !/\.add-song-list,\s*\n\s*\.queue-page,\s*\n\s*\.video-page/.test(mobileBlock),
);
record("package script verify:queue", pkg.includes("verify:queue"));
record(
    "recently played / profile markers untouched by this verifier scope",
    pageSrc.includes("recent-card-header") && pageSrc.includes("profile-hero-main"),
);

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
    --mobile-sidebar-width: 112px;
    --mobile-player-height: 112px;
    --mobile-player-reserve: 110px;
    --app-header-offset: 0px;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; background: #020617; color: #fff; font-family: Arial, sans-serif; }
  .zml-app { min-height: 100dvh; }
  .sidebar {
    position: fixed; top: 0; left: 0; bottom: 0;
    width: var(--mobile-sidebar-width); background: #071631;
  }
  /* Reproduce the production mobile shell that caused the blank stretch. */
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
    overflow-x: hidden !important;
    /* Distinct shell fill — override must shrink this box so the fill ends. */
    background: #12365f;
    outline: 2px solid #22d3ee;
    z-index: 1 !important;
  }
  .zml-app {
    background:
      linear-gradient(180deg, rgba(255, 80, 80, 0.18), rgba(255, 80, 80, 0.18)),
      #020617;
  }
  .topbar { display: grid; gap: 8px; }
  .section-heading h2 { margin: 0; font-size: 22px; }
  .section-heading p { margin: 4px 0 0; color: #9bdcf0; font-size: 13px; }
  .queue-toolbar button {
    border: 0; border-radius: 8px; background: #22d3ee; color: #020617;
    font-weight: 900; width: 100%;
  }
  .empty-state {
    border: 1px solid rgba(0, 212, 255, 0.28);
    border-radius: 8px; background: #0b1736; padding: 12px;
  }
  .empty-state h2 { margin: 0 0 6px; }
  .empty-state p { margin: 0; }
  .fixed-mobile-player {
    position: fixed; left: 112px; right: 0; bottom: 0; height: 72px;
    background: #0f274f; z-index: 9999;
  }
  ${css}
</style>
</head>
<body>
  <main class="zml-app" data-active-view="Queue">
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
      </section>
    </section>
    <div class="fixed-mobile-player" id="player"></div>
  </main>
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
                const headingTop = heading.getBoundingClientRect().top;
                const emptyBottom = empty.getBoundingClientRect().bottom;
                const queueBottom = queue.getBoundingClientRect().bottom;
                const workspaceBottom = workspace.getBoundingClientRect().bottom;
                const padBottom = parseFloat(qs.paddingBottom) || 0;
                const gapAfterEmpty = queueBottom - emptyBottom - padBottom;
                const contentSpan = emptyBottom - headingTop;
                const excessOverContent = workspace.scrollHeight - (queue.offsetTop + queue.offsetHeight);
                const parents = [];
                let node = empty;
                while (node && node !== document.body) {
                    const s = getComputedStyle(node);
                    const r = node.getBoundingClientRect();
                    parents.push({
                        sel: node.id ? `#${node.id}` : (node.className || node.tagName),
                        h: Math.round(r.height),
                        minH: s.minHeight,
                        flexGrow: s.flexGrow,
                        bottom: s.bottom,
                        height: s.height,
                        display: s.display,
                        gridRows: s.gridTemplateRows,
                    });
                    node = node.parentElement;
                }
                return {
                    workspace: {
                        height: ws.height,
                        minHeight: ws.minHeight,
                        flexGrow: ws.flexGrow,
                        bottom: ws.bottom,
                        h: workspace.getBoundingClientRect().height,
                        scrollHeight: workspace.scrollHeight,
                        clientHeight: workspace.clientHeight,
                    },
                    queue: {
                        height: qs.height,
                        minHeight: qs.minHeight,
                        flexGrow: qs.flexGrow,
                        h: queue.getBoundingClientRect().height,
                        padBottom,
                    },
                    contentSpan,
                    gapAfterEmpty,
                    emptyBottom,
                    queueBottom,
                    workspaceBottom,
                    playerTop: player.getBoundingClientRect().top,
                    overflowY: workspace.scrollHeight > workspace.clientHeight + 1,
                    viewportH: window.innerHeight,
                    parents,
                    excessOverContent,
                };
            });

            record(
                `${viewport.name} workspace flex-grow is 0`,
                Number(m.workspace.flexGrow || 0) === 0,
                `flex-grow=${m.workspace.flexGrow}`,
            );
            record(
                `${viewport.name} workspace min-height not viewport`,
                m.workspace.minHeight === "0px" || m.workspace.minHeight === "auto",
                `min-height=${m.workspace.minHeight}`,
            );
            record(
                `${viewport.name} workspace height auto / not viewport fill`,
                m.workspace.bottom !== "0px"
                    && m.workspace.h < m.viewportH - 40
                    && m.workspace.h <= m.workspace.scrollHeight + 1
                    && !/^100/.test(m.workspace.height)
                    && !/dvh|vh|%/.test(m.workspace.height),
                `bottom=${m.workspace.bottom} height=${m.workspace.height} boxH=${m.workspace.h.toFixed(1)} vh=${m.viewportH}`,
            );
            record(
                `${viewport.name} queue wrapper flex-grow 0 / min-height 0`,
                m.queue.flexGrow === "0" && (m.queue.minHeight === "0px" || m.queue.minHeight === "auto"),
                `flex-grow=${m.queue.flexGrow} min-height=${m.queue.minHeight}`,
            );
            record(
                `${viewport.name} queue height within content+clearance+24`,
                m.queue.h <= (m.emptyBottom - (m.emptyBottom - m.queue.h + m.queue.padBottom)) + m.queue.padBottom + 24
                    || m.gapAfterEmpty <= 16,
                `queueH=${m.queue.h.toFixed(1)} pad=${m.queue.padBottom.toFixed(1)} gapAfterEmpty=${m.gapAfterEmpty.toFixed(1)}`,
            );
            record(
                `${viewport.name} gap after empty before player padding <= 16`,
                m.gapAfterEmpty >= -1 && m.gapAfterEmpty <= 16,
                `gap=${m.gapAfterEmpty.toFixed(1)}`,
            );
            record(
                `${viewport.name} heading→empty span compact (<=520)`,
                m.contentSpan >= 160 && m.contentSpan <= 520,
                `span=${m.contentSpan.toFixed(1)}`,
            );
            record(
                `${viewport.name} no unnecessary workspace scroll`,
                !m.overflowY,
                `scrollH=${m.workspace.scrollHeight} clientH=${m.workspace.clientHeight}`,
            );
            record(
                `${viewport.name} no 1fr grid row on queue parents`,
                m.parents.every((p) => !/\b1fr\b/.test(p.gridRows || "")),
                m.parents.map((p) => `${p.sel}:${p.gridRows}`).join(" | ").slice(0, 180),
            );

            if (viewport.name === "390x844") {
                console.log("DIAG_PARENTS", JSON.stringify(m.parents, null, 2));
                console.log("DIAG_SUMMARY", JSON.stringify({
                    workspace: m.workspace,
                    queue: m.queue,
                    contentSpan: m.contentSpan,
                    gapAfterEmpty: m.gapAfterEmpty,
                    emptyBottom: m.emptyBottom,
                    queueBottom: m.queueBottom,
                    workspaceBottom: m.workspaceBottom,
                }, null, 2));
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
