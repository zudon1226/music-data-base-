/**
 * Queue Up/Down boundary-control contracts.
 * Run: node scripts/verify-queue-boundary-controls.mjs
 * Or: npm run verify:queue-boundaries
 */
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDir = path.join(root, "tmp", "queue-boundary-evidence");
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

record(
    "source uses canMoveUp / canMoveDown boundary helpers",
    pageSrc.includes("canMoveUp")
        && pageSrc.includes("canMoveDown")
        && /disabled=\{!canMoveUp\}/.test(pageSrc)
        && /disabled=\{!canMoveDown\}/.test(pageSrc)
        && /aria-disabled=\{!canMoveUp\}/.test(pageSrc)
        && /aria-disabled=\{!canMoveDown\}/.test(pageSrc),
);

record(
    "disabled queue controls get intentional disabled styling",
    /queue-manage-actions\s*>\s*button:disabled[\s\S]{0,180}opacity:\s*0\.42/.test(pageSrc)
        && /queue-manage-actions\s*>\s*button:disabled[\s\S]{0,220}cursor:\s*not-allowed/.test(pageSrc)
        && /queue-manage-actions\s*>\s*button:disabled[\s\S]{0,260}pointer-events:\s*none/.test(pageSrc)
        && /button:disabled:active[\s\S]{0,120}transform:\s*none/.test(pageSrc),
);

record("package exposes verify:queue-boundaries", pkg.includes("verify:queue-boundaries"));

function extractCss() {
    const open = pageSrc.indexOf(".queue-toolbar button:disabled");
    const mobile = pageSrc.indexOf("@media (max-width: 768px)");
    const styleEnd = pageSrc.indexOf("`}</style>", mobile > 0 ? mobile : 0);
    return pageSrc.slice(Math.max(0, open - 200), styleEnd > open ? styleEnd : open + 4000);
}

async function assertComputed() {
    mkdirSync(evidenceDir, { recursive: true });
    const css = extractCss();
    const html = `<!doctype html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<style>
body{margin:0;background:#020617;color:#fff;font-family:Arial,sans-serif;padding:12px}
.queue-manage-row{display:grid;gap:8px;margin-bottom:10px;padding:8px;background:#10204a;border-radius:8px}
.queue-manage-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.queue-manage-actions > button{
  min-height:44px;border:0;border-radius:8px;background:#22d3ee;color:#020617;font-weight:900
}
${css}
</style></head>
<body>
<article class="queue-manage-row" data-role="first">
  <div class="queue-manage-actions">
    <button type="button">Play</button>
    <button type="button">Remove</button>
    <button type="button" id="first-up" disabled aria-disabled="true">Up</button>
    <button type="button" id="first-down">Down</button>
  </div>
</article>
<article class="queue-manage-row" data-role="middle">
  <div class="queue-manage-actions">
    <button type="button">Play</button>
    <button type="button">Remove</button>
    <button type="button" id="mid-up">Up</button>
    <button type="button" id="mid-down">Down</button>
  </div>
</article>
<article class="queue-manage-row" data-role="last">
  <div class="queue-manage-actions">
    <button type="button">Play</button>
    <button type="button">Remove</button>
    <button type="button" id="last-up">Up</button>
    <button type="button" id="last-down" disabled aria-disabled="true">Down</button>
  </div>
</article>
<article class="queue-manage-row" data-role="only">
  <div class="queue-manage-actions">
    <button type="button">Play</button>
    <button type="button">Remove</button>
    <button type="button" id="only-up" disabled aria-disabled="true">Up</button>
    <button type="button" id="only-down" disabled aria-disabled="true">Down</button>
  </div>
</article>
</body></html>`;
    const fixture = path.join(evidenceDir, "boundaries.html");
    writeFileSync(fixture, html, "utf8");

    let browser;
    try {
        browser = await chromium.launch({ headless: true });
    } catch (error) {
        record("browser launch", false, error instanceof Error ? error.message : String(error));
        return;
    }

    for (const vp of [{ width: 390, height: 844 }, { width: 1366, height: 768 }]) {
        const context = await browser.newContext({ viewport: vp });
        const page = await context.newPage();
        try {
            await page.goto(`file://${fixture.replace(/\\/g, "/")}`, { waitUntil: "load" });
            const m = await page.evaluate(() => {
                const read = (id) => {
                    const el = document.getElementById(id);
                    const s = getComputedStyle(el);
                    return {
                        disabled: el.disabled,
                        aria: el.getAttribute("aria-disabled"),
                        opacity: Number.parseFloat(s.opacity),
                        cursor: s.cursor,
                        pointerEvents: s.pointerEvents,
                    };
                };
                return {
                    firstUp: read("first-up"),
                    firstDown: read("first-down"),
                    midUp: read("mid-up"),
                    midDown: read("mid-down"),
                    lastUp: read("last-up"),
                    lastDown: read("last-down"),
                    onlyUp: read("only-up"),
                    onlyDown: read("only-down"),
                    overflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
                };
            });
            const name = `${vp.width}x${vp.height}`;
            record(`${name} first Up disabled`, m.firstUp.disabled && m.firstUp.aria === "true" && m.firstUp.opacity <= 0.5 && m.firstUp.cursor === "not-allowed");
            record(`${name} first Down enabled`, !m.firstDown.disabled && m.firstDown.opacity > 0.9);
            record(`${name} middle both enabled`, !m.midUp.disabled && !m.midDown.disabled);
            record(`${name} last Up enabled / Down disabled`, !m.lastUp.disabled && m.lastDown.disabled && m.lastDown.aria === "true");
            record(`${name} only item both disabled`, m.onlyUp.disabled && m.onlyDown.disabled);
            record(`${name} no horizontal overflow`, !m.overflowX);
        } catch (error) {
            record(`${vp.width}x${vp.height} run`, false, error instanceof Error ? error.message : String(error));
        } finally {
            await context.close();
        }
    }

    await browser.close();
}

await assertComputed();
const failed = results.filter((row) => !row.ok).length;
console.log(`\nQUEUE_BOUNDARY_CONTROLS_FAILS=${failed}`);
console.log(`EVIDENCE_DIR=${evidenceDir}`);
process.exit(failed ? 1 : 0);
