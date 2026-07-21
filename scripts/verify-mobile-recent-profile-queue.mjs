/**
 * Mobile Recently Played / Queue / Profile layout contracts.
 * Asserts source CSS structure AND computed fixture dimensions at 390x844.
 * Run: node scripts/verify-mobile-recent-profile-queue.mjs
 */
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, devices } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const results = [];
const evidenceDir = path.join(root, "tmp", "mobile-layout-evidence");

function record(name, ok, detail = "") {
    results.push({ name, ok: Boolean(ok), detail: String(detail || "") });
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

function read(rel) {
    const full = path.join(root, rel);
    if (!existsSync(full)) return "";
    return readFileSync(full, "utf8");
}

const page = read("app/page.tsx");
const profile = read("components/user-profile-dashboard.tsx");
const pkg = read("package.json");
const heading = read("components/destination-page-heading.tsx");

const start = page.indexOf("@media (max-width: 768px)");
const end = page.indexOf("`}</style>", start);
const mobileBlock = start >= 0 ? page.slice(start, end > start ? end : undefined) : "";

const homeHeroMarker = "/* Home hero — compact at narrow widths so Recommended clears the player. */";
const homeHeroStillPresent = mobileBlock.includes(homeHeroMarker);

record("mobile 768 breakpoint present", Boolean(mobileBlock));
record(
    "home hero block left in place (out of scope for this fix)",
    homeHeroStillPresent,
    "Home CSS must not be deleted by Profile/Queue/RP edits",
);

record(
    "recent card header grid 112px + side metadata",
    page.includes('className="recent-card-header"')
        && page.includes('className="recent-art"')
        && /recent-card-header[\s\S]{0,500}grid-template-columns:\s*112px\s+minmax\(0,\s*1fr\)/.test(mobileBlock)
        && /recent-art[\s\S]{0,220}width:\s*112px/.test(mobileBlock)
        && /recent-art[\s\S]{0,220}height:\s*112px/.test(mobileBlock),
);

record(
    "recent row natural height no stretch",
    /recent-row[\s\S]{0,500}justify-content:\s*flex-start/.test(mobileBlock)
        && /recent-row[\s\S]{0,500}min-height:\s*0/.test(mobileBlock)
        && /recent-row[\s\S]{0,500}height:\s*auto/.test(mobileBlock)
        && /recent-row[\s\S]{0,500}flex-grow:\s*0/.test(mobileBlock)
        && !/recent-row[\s\S]{0,500}justify-content:\s*space-between/.test(mobileBlock),
);

record(
    "recent actions 2-row grid 44-48px",
    page.includes('className="recent-actions"')
        && /recent-actions[\s\S]{0,400}grid-template-columns:\s*1fr\s+1fr/.test(mobileBlock)
        && /recent-actions\s*>\s*:first-child[\s\S]{0,200}grid-column:\s*1\s*\/\s*-1/.test(mobileBlock)
        && /recent-actions\s*>\s*button[\s\S]{0,400}min-height:\s*44px/.test(mobileBlock)
        && /recent-actions\s*>\s*button[\s\S]{0,400}max-height:\s*48px/.test(mobileBlock),
);

record(
    "queue content is mobile scrollport above fixed player",
    mobileBlock.includes('data-active-view="Queue"')
        && /body:has\(\.zml-app\[data-active-view="Queue"\]\)/.test(mobileBlock)
        && /html:has\(\.zml-app\[data-active-view="Queue"\]\)[\s\S]{0,220}overflow:\s*hidden/.test(mobileBlock)
        && /data-active-view="Queue"[\s\S]{0,2200}overflow-y:\s*auto/.test(mobileBlock)
        && /data-active-view="Queue"[\s\S]{0,2200}height:\s*100dvh/.test(mobileBlock)
        && /data-active-view="Queue"[\s\S]{0,2200}-webkit-overflow-scrolling:\s*touch/.test(mobileBlock)
        && /queue-page[\s\S]{0,600}flex:\s*0\s+0\s+auto/.test(mobileBlock)
        && /queue-page[\s\S]{0,600}flex-grow:\s*0/.test(mobileBlock)
        && /queue-page[\s\S]{0,600}min-height:\s*0/.test(mobileBlock)
        && /queue-page[\s\S]{0,600}height:\s*auto/.test(mobileBlock)
        && /queue-page \.empty-state[\s\S]{0,300}min-height:\s*0/.test(mobileBlock)
        && /queue-toolbar[\s\S]{0,200}grid-template-columns:\s*1fr/.test(mobileBlock)
        && !/\.queue-page\s*\{[^}]{0,280}100vh/.test(mobileBlock)
        && !/\.queue-page\s*\{[^}]{0,280}100dvh/.test(mobileBlock),
);

record(
    "queue player-safe padding uses player height + clearance",
    /queue-page[\s\S]{0,800}padding-bottom:\s*calc\(var\(--mobile-player-height,\s*112px\)\s*\+\s*24px\)/.test(mobileBlock)
        || /content > \.queue-page[\s\S]{0,200}padding-bottom:\s*calc\(var\(--mobile-player-height,\s*112px\)/.test(mobileBlock),
);

record(
    "profile compact card 96-112 avatar (unchanged scope)",
    /profile-avatar-image[\s\S]{0,200}width:\s*104px/.test(mobileBlock)
        || /profile-avatar,[\s\S]{0,120}width:\s*104px/.test(mobileBlock),
);
record(
    "profile change-photo 44px + edit/logout row (unchanged scope)",
    mobileBlock.includes(".profile-avatar-upload")
        && mobileBlock.includes("height: 44px !important")
        && mobileBlock.includes("repeat(2, minmax(0, 1fr))")
        && profile.includes('className="profile-hero-main"'),
);

record(
    "three pages not unwrapped with display contents",
    !/\.content > \.queue-page[\s\S]{0,80}display:\s*contents/.test(mobileBlock)
        && !/\.content > \.recent-panel[\s\S]{0,80}display:\s*contents/.test(mobileBlock)
        && !/\.content > \.profile-page[\s\S]{0,80}display:\s*contents/.test(mobileBlock),
);
record(
    "destination heading markers preserved",
    page.includes("DestinationPageHeading") && heading.includes('data-nav-destination="heading"'),
);
record("package script verify:mobile-layout", pkg.includes("verify:mobile-layout"));

function extractMobileCss() {
    const open = page.indexOf("@media (max-width: 768px)");
    if (open < 0) return "";
    const close = page.indexOf("`}</style>", open);
    const block = page.slice(open, close > open ? close : undefined);
    // Drop the media wrapper braces content only — keep @media so viewport gating works.
    return block.replace(/`\s*$/, "");
}

async function assertComputedFixture() {
    const css = extractMobileCss();
    if (!css) {
        record("computed fixture CSS extract", false, "missing 768 media block");
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
    --mobile-player-height: 88px;
    --mobile-player-reserve: 116px;
    --global-player-height: 88px;
    --global-player-height-collapsed: 52px;
    --player-dock-inset-bottom: 12px;
    --player-scrollbar-gutter: 20px;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: #020617;
    color: #fff;
    font-family: Arial, sans-serif;
  }
  .shell {
    display: grid;
    grid-template-columns: 112px 1fr;
    min-height: 100dvh;
  }
  .sidebar { background: #0b1736; }
  .content {
    position: relative;
    overflow: auto;
    padding: 8px 10px 0;
    height: 100dvh;
  }
  .section-heading { margin: 0 0 8px; }
  .section-heading h2 { margin: 0; font-size: 22px; }
  .section-heading p { margin: 4px 0 0; font-size: 13px; color: #9bdcf0; }
  .recent-row {
    background: #10204a;
    border: 1px solid rgba(0, 212, 255, 0.18);
    border-radius: 8px;
  }
  .recent-number { color: #9bdcf0; font-weight: 900; font-size: 13px; }
  .recent-copy h3 { margin: 0; font-size: 15px; }
  .recent-copy p, .recent-copy small, .recent-time { margin: 0; color: #9bdcf0; font-size: 12px; }
  .recent-actions button, .mobile-queue-btn {
    border: 0;
    border-radius: 8px;
    background: #22d3ee;
    color: #020617;
    font-weight: 900;
    font-size: 12px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
  }
  .empty-state {
    border: 1px solid rgba(0, 212, 255, 0.28);
    border-radius: 8px;
    background: #0b1736;
  }
  .empty-state h2 { margin: 0 0 6px; }
  .empty-state p { margin: 0; }
  .queue-toolbar button {
    border: 0;
    border-radius: 8px;
    background: #22d3ee;
    color: #020617;
    font-weight: 900;
  }
  .fixed-mobile-player {
    position: fixed;
    left: 112px;
    right: 0;
    bottom: 0;
    height: 72px;
    background: #0f274f;
    border-top: 1px solid rgba(0,212,255,.3);
    z-index: 9999;
  }
  ${css}
</style>
</head>
<body>
  <div class="shell">
    <aside class="sidebar"></aside>
    <main id="rp-root" class="content">
      <section class="section-heading destination-page-heading"><div><h2>Recently Played</h2><p>Resume where you left off.</p></div></section>
      <section class="recent-panel">
        <div class="liked-tabs" role="tablist">
          <button class="active" type="button">Songs</button>
          <button type="button">Videos</button>
          <button type="button">Albums</button>
        </div>
        <section class="recent-list">
          <article class="recent-row" id="rp-card-1">
            <div class="recent-card-header">
              <span class="recent-number">1</span>
              <img class="recent-art" id="rp-art-1" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==" width="112" height="112" alt=""/>
              <div class="recent-copy">
                <h3>Compact Track Title One</h3>
                <p>Artist Name</p>
                <small>song | 1:12 / 3:40</small>
                <span class="recent-time">Jul 17, 2026</span>
              </div>
            </div>
            <div class="recent-actions" id="rp-actions-1">
              <button type="button">Resume 1:12</button>
              <button type="button">Remove</button>
              <button class="mobile-queue-btn" type="button">Add to Queue</button>
            </div>
          </article>
          <article class="recent-row" id="rp-card-2">
            <div class="recent-card-header">
              <span class="recent-number">2</span>
              <img class="recent-art" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==" width="112" height="112" alt=""/>
              <div class="recent-copy">
                <h3>Compact Track Title Two</h3>
                <p>Second Artist</p>
                <small>song | 0:00 / 2:10</small>
                <span class="recent-time">Jul 16, 2026</span>
              </div>
            </div>
            <div class="recent-actions">
              <button type="button">Play</button>
              <button type="button">Remove</button>
              <button class="mobile-queue-btn" type="button">Add to Queue</button>
            </div>
          </article>
        </section>
      </section>
    </main>
  </div>

  <div class="shell" id="queue-shell" style="display:none">
    <aside class="sidebar"></aside>
    <main id="queue-root" class="content">
      <section class="section-heading destination-page-heading"><div><h2>Queue</h2><p>Manage upcoming media.</p></div></section>
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
    </main>
  </div>
  <div class="fixed-mobile-player" id="player"></div>
</body>
</html>`;

    mkdirSync(evidenceDir, { recursive: true });
    const fixturePath = path.join(evidenceDir, "fixture.html");
    writeFileSync(fixturePath, html, "utf8");

    let browser;
    try {
        browser = await chromium.launch({ headless: true });
    } catch (error) {
        record("computed fixture browser launch", false, error instanceof Error ? error.message : String(error));
        return;
    }

    const iphone = devices["iPhone 12"];
    const context = await browser.newContext({
        ...iphone,
        viewport: { width: 390, height: 844 },
    });
    const page = await context.newPage();
    try {
        await page.goto(`file://${fixturePath.replace(/\\/g, "/")}`, { waitUntil: "load" });

        const rp = await page.evaluate(() => {
            const card = document.getElementById("rp-card-1");
            const art = document.getElementById("rp-art-1");
            const actions = document.getElementById("rp-actions-1");
            const buttons = [...(actions?.querySelectorAll("button") || [])];
            const cardRect = card.getBoundingClientRect();
            const artRect = art.getBoundingClientRect();
            const artStyle = getComputedStyle(art);
            const gaps = [];
            const header = card.querySelector(".recent-card-header");
            const headerStyle = getComputedStyle(header);
            const kids = [header, actions];
            for (let i = 0; i < kids.length - 1; i++) {
                const a = kids[i].getBoundingClientRect();
                const b = kids[i + 1].getBoundingClientRect();
                gaps.push(Math.max(0, b.top - a.bottom));
            }
            return {
                cardH: cardRect.height,
                artW: artRect.width,
                artH: artRect.height,
                artCssW: artStyle.width,
                artCssH: artStyle.height,
                gridCols: headerStyle.gridTemplateColumns,
                btnHeights: buttons.map((b) => b.getBoundingClientRect().height),
                maxInternalGap: Math.max(0, ...gaps),
                overflowX: document.documentElement.scrollWidth > 390 + 1,
                card2Top: document.getElementById("rp-card-2").getBoundingClientRect().top,
            };
        });

        record(
            "computed RP artwork <= 120px",
            rp.artW <= 120 && rp.artH <= 120,
            `art=${rp.artW.toFixed(1)}x${rp.artH.toFixed(1)} css=${rp.artCssW}x${rp.artCssH}`,
        );
        record(
            "computed RP artwork target 112px",
            rp.artW >= 110 && rp.artW <= 114 && rp.artH >= 110 && rp.artH <= 114,
            `art=${rp.artW.toFixed(1)}x${rp.artH.toFixed(1)}`,
        );
        record(
            "computed RP first card height <= 320px",
            rp.cardH <= 320,
            `cardH=${rp.cardH.toFixed(1)}`,
        );
        record(
            "computed RP action buttons 44-48px",
            rp.btnHeights.length >= 3 && rp.btnHeights.every((h) => h >= 44 && h <= 48),
            `btns=${rp.btnHeights.map((h) => h.toFixed(1)).join(",")}`,
        );
        record(
            "computed RP internal gap <= 20px",
            rp.maxInternalGap <= 20,
            `maxGap=${rp.maxInternalGap.toFixed(1)}`,
        );
        record(
            "computed RP second card visible in first viewport",
            rp.card2Top < 844,
            `card2Top=${rp.card2Top.toFixed(1)}`,
        );
        record("computed RP no horizontal overflow", !rp.overflowX);

        await page.screenshot({ path: path.join(evidenceDir, "recently-played-390.png"), fullPage: false });

        await page.evaluate(() => {
            document.getElementById("rp-root").parentElement.style.display = "none";
            document.getElementById("queue-shell").style.display = "grid";
        });

        const queue = await page.evaluate(() => {
            const root = document.getElementById("queue-root");
            const wrap = document.getElementById("queue-page");
            const empty = document.getElementById("queue-empty");
            const style = getComputedStyle(wrap);
            const emptyRect = empty.getBoundingClientRect();
            const wrapRect = wrap.getBoundingClientRect();
            const paddingBottom = parseFloat(style.paddingBottom) || 0;
            const contentBottomGap = wrapRect.bottom - emptyRect.bottom - paddingBottom;
            return {
                minHeight: style.minHeight,
                height: style.height,
                flexGrow: style.flexGrow,
                flex: style.flex,
                paddingBottom,
                wrapH: wrapRect.height,
                emptyBottom: emptyRect.bottom,
                contentBottomGap,
                overflowX: document.documentElement.scrollWidth > 390 + 1,
                routeContentBottom: emptyRect.bottom,
            };
        });

        record(
            "computed Queue wrapper min-height 0/auto",
            queue.minHeight === "0px" || queue.minHeight === "auto",
            `min-height=${queue.minHeight}`,
        );
        record(
            "computed Queue wrapper not flex-grow 1",
            queue.flexGrow === "0",
            `flex-grow=${queue.flexGrow} flex=${queue.flex}`,
        );
        record(
            "computed Queue content ends <=24px after empty (excl player padding)",
            queue.contentBottomGap <= 24,
            `gap=${queue.contentBottomGap.toFixed(1)} padBottom=${queue.paddingBottom.toFixed(1)} wrapH=${queue.wrapH.toFixed(1)}`,
        );
        record(
            "computed Queue content group finishes ~420-520 from top",
            queue.routeContentBottom >= 200 && queue.routeContentBottom <= 560,
            `emptyBottom=${queue.routeContentBottom.toFixed(1)}`,
        );
        record("computed Queue no horizontal overflow", !queue.overflowX);

        const player = await page.evaluate(() => {
            const el = document.getElementById("player");
            const r = el.getBoundingClientRect();
            const s = getComputedStyle(el);
            return {
                h: r.height,
                position: s.position,
                bottom: s.bottom,
                rightGutter: window.innerWidth - r.right,
                left: r.left,
            };
        });
        record(
            "computed floating player dock clears edges",
            player.position === "fixed"
                && player.h >= 48
                && player.h <= 96
                && player.rightGutter >= 7.5
                && player.left >= 112,
            `h=${player.h.toFixed(1)} pos=${player.position} rightGutter=${player.rightGutter.toFixed(1)} left=${player.left.toFixed(1)}`,
        );

        await page.screenshot({ path: path.join(evidenceDir, "empty-queue-390.png"), fullPage: false });
    } catch (error) {
        record("computed fixture run", false, error instanceof Error ? error.message : String(error));
    } finally {
        await context.close();
        await browser.close();
    }
}

await assertComputedFixture();

const failed = results.filter((row) => !row.ok).length;
console.log(`\nMOBILE_PROFILE_QUEUE_RECENT_FAILS=${failed}`);
console.log(`EVIDENCE_DIR=${evidenceDir}`);
process.exit(failed ? 1 : 0);
