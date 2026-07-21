/**
 * Mobile Queue card control layout (2x2 Play/Remove/Up/Down).
 * Run: node scripts/verify-mobile-queue-card-controls.mjs
 * Or: npm run verify:queue-controls
 */
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDir = path.join(root, "tmp", "mobile-queue-controls-evidence");
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

record("queue-manage-actions wrapper present", pageSrc.includes('className="queue-manage-actions"'));
const actionsSlice = (() => {
    const open = pageSrc.indexOf('className="queue-manage-actions"');
    if (open < 0) return "";
    return pageSrc.slice(open, open + 1200);
})();
record(
    "mobile control order Play Remove Up Down",
    /Play[\s\S]{0,400}Remove[\s\S]{0,400}Up[\s\S]{0,400}Down/.test(actionsSlice),
);
record(
    "mobile actions use full-width 2x2 grid",
    /queue-manage-actions[\s\S]{0,260}grid-column:\s*1\s*\/\s*-1/.test(mobileBlock)
        && /queue-manage-actions[\s\S]{0,260}grid-template-columns:\s*minmax\(0,\s*1fr\)\s+minmax\(0,\s*1fr\)/.test(mobileBlock)
        && /queue-manage-actions\s*>\s*button[\s\S]{0,220}min-height:\s*44px/.test(mobileBlock)
        && /queue-manage-actions\s*>\s*button[\s\S]{0,220}width:\s*100%/.test(mobileBlock),
);
record(
    "mobile no longer pinches controls into 36px columns",
    !/queue-manage-row[\s\S]{0,180}grid-template-columns:\s*28px\s+44px\s+minmax\(0,\s*1fr\)\s+36px\s+36px/.test(mobileBlock)
        && !/queue-manage-row button[\s\S]{0,120}width:\s*36px/.test(mobileBlock),
);
record(
    "desktop keeps horizontal action row",
    /\.queue-manage-actions\s*\{[\s\S]{0,180}display:\s*flex/.test(pageSrc)
        && /\.queue-manage-row\s*\{[\s\S]{0,220}grid-template-columns:\s*36px\s+54px\s+minmax\(0,\s*1fr\)\s+auto/.test(pageSrc),
);
record(
    "disabled Up/Down preserved",
    pageSrc.includes("canMoveUp")
        && pageSrc.includes("canMoveDown")
        && /disabled=\{!canMoveUp\}/.test(pageSrc)
        && /disabled=\{!canMoveDown\}/.test(pageSrc),
);
record("package exposes verify:queue-controls", pkg.includes("verify:queue-controls"));

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
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<style>
:root { --mobile-sidebar-width: 64px; --mobile-player-height: 112px; }
*{box-sizing:border-box} body{margin:0;font-family:Arial,sans-serif;background:#020617;color:#fff}
.queue-manage-row{
  display:grid;
  grid-template-columns:36px 54px minmax(0,1fr) auto;
  gap:8px; align-items:center;
  border:1px solid rgba(0,212,255,.18); border-radius:8px; background:#10204a; padding:8px;
}
.queue-manage-actions{display:flex; gap:8px; justify-content:flex-end}
.queue-manage-row button{
  min-height:34px; border:0; border-radius:8px; background:#22d3ee; color:#020617;
  font-size:12px; font-weight:900; display:inline-flex; align-items:center; justify-content:center;
  gap:6px; padding:0 10px; white-space:nowrap;
}
.queue-manage-row button:disabled{opacity:.45}
.recent-copy{min-width:0}
.recent-copy h3{margin:0;font-size:14px}
.recent-copy p,.recent-copy small{margin:2px 0 0;font-size:12px;color:#9bdcf0}
img{width:54px;height:54px;border-radius:8px;object-fit:cover;background:#0b1736}
${css}
</style></head>
<body>
<article class="queue-manage-row" id="row">
  <span class="recent-number">1</span>
  <img alt=""/>
  <div class="recent-copy">
    <h3>Long Enough Song Title For Wrap Testing</h3>
    <p>Artist Name</p>
    <small>Song | 3:21</small>
  </div>
  <div class="queue-manage-actions">
    <button type="button" id="play">Play</button>
    <button type="button" id="remove">Remove</button>
    <button type="button" id="up" disabled>Up</button>
    <button type="button" id="down">Down</button>
  </div>
</article>
</body></html>`;

    mkdirSync(evidenceDir, { recursive: true });
    const fixturePath = path.join(evidenceDir, "queue-controls.html");
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
        { width: 768, height: 1024 },
    ];

    for (const vp of viewports) {
        const context = await browser.newContext({ viewport: vp, isMobile: vp.width <= 430, hasTouch: vp.width <= 430 });
        const page = await context.newPage();
        try {
            await page.goto(`file://${fixturePath.replace(/\\/g, "/")}`, { waitUntil: "load" });
            const m = await page.evaluate(() => {
                const labels = ["play", "remove", "up", "down"].map((id) => {
                    const el = document.getElementById(id);
                    const r = el.getBoundingClientRect();
                    const s = getComputedStyle(el);
                    return {
                        id,
                        text: el.textContent.trim(),
                        w: r.width,
                        h: r.height,
                        top: r.top,
                        left: r.left,
                        overflow: s.overflow,
                        disabled: el.disabled,
                    };
                });
                const row = document.getElementById("row").getBoundingClientRect();
                const title = document.querySelector(".recent-copy h3").getBoundingClientRect();
                return {
                    labels,
                    rowWidth: row.width,
                    titleWidth: title.width,
                    overflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
                };
            });

            const play = m.labels.find((x) => x.id === "play");
            const remove = m.labels.find((x) => x.id === "remove");
            const up = m.labels.find((x) => x.id === "up");
            const down = m.labels.find((x) => x.id === "down");
            const name = `${vp.width}x${vp.height}`;

            record(`${name} Play label full`, play.text === "Play" && play.w >= 70, `w=${play.w.toFixed(1)}`);
            record(`${name} Remove label full`, remove.text === "Remove" && remove.w >= 70, `w=${remove.w.toFixed(1)}`);
            record(`${name} Up/Down labels full`, up.text === "Up" && down.text === "Down" && up.w >= 70 && down.w >= 70, `up=${up.w.toFixed(1)} down=${down.w.toFixed(1)}`);
            record(`${name} 2x2 geometry`, Math.abs(play.top - remove.top) < 2 && Math.abs(up.top - down.top) < 2 && up.top > play.top + 20, `playTop=${play.top.toFixed(1)} upTop=${up.top.toFixed(1)}`);
            record(`${name} no overlap Play/Remove`, Math.abs(play.left - remove.left) > 40, `playL=${play.left.toFixed(1)} removeL=${remove.left.toFixed(1)}`);
            record(`${name} title has usable width`, m.titleWidth >= 120, `titleW=${m.titleWidth.toFixed(1)}`);
            record(`${name} Up disabled visible`, up.disabled === true);
            record(`${name} no horizontal overflow`, !m.overflowX);
        } catch (error) {
            record(`${vp.width}x${vp.height} run`, false, error instanceof Error ? error.message : String(error));
        } finally {
            await context.close();
        }
    }

    // Desktop unchanged: wide viewport should keep actions in one row.
    const desktop = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const dpage = await desktop.newPage();
    try {
        // Use only base styles (no mobile media) by temporarily stripping media for this check:
        // At 1366 the mobile block does not apply, so flex row should remain.
        await dpage.goto(`file://${fixturePath.replace(/\\/g, "/")}`, { waitUntil: "load" });
        const dm = await dpage.evaluate(() => {
            const play = document.getElementById("play").getBoundingClientRect();
            const down = document.getElementById("down").getBoundingClientRect();
            return { sameRow: Math.abs(play.top - down.top) < 4 };
        });
        record("1366x768 desktop actions stay one row", dm.sameRow, `sameRow=${dm.sameRow}`);
    } catch (error) {
        record("1366x768 desktop run", false, error instanceof Error ? error.message : String(error));
    } finally {
        await desktop.close();
    }

    await browser.close();
}

await assertComputed();
const failed = results.filter((row) => !row.ok).length;
console.log(`\nMOBILE_QUEUE_CARD_CONTROLS_FAILS=${failed}`);
console.log(`EVIDENCE_DIR=${evidenceDir}`);
process.exit(failed ? 1 : 0);
