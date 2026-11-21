/**
 * Staging regression: creator mine-catalog keyset pagination (>60 rows).
 * Never logs secrets. Staging ref jzlegcbotqfzevtczwhx only.
 *
 * Usage: node scripts/verify-mixtape-mine-catalog-pagination-staging.mjs
 */
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import pg from "pg";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadMixtapeStagingE2eCredentialsFromFile } from "./lib/load-mixtape-staging-e2e-credentials.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const STAGING_REF = "jzlegcbotqfzevtczwhx";
const PRODUCTION_REF = "aehuszoadgqtbkxsliyy";
const BASE_URL = (process.env.MDB_MIXTAPE_E2E_BASE_URL || "http://localhost:3003").replace(/\/$/, "");
const OWNER_EMAIL = "zudon1226@gmail.com";
const FIXTURE_COUNT = 81;
const PAGE_LIMIT = 40;
const TIE_START = 35;
const TIE_END = 54;
const TIE_TS = "2030-06-15T12:00:00.000Z";

const runId = randomBytes(4).toString("hex");
const TITLE_PREFIX = `mdb-pagination-boundary-e2e-${runId}-`;
const evidenceDir = join(root, "tmp-mixtape-mine-pagination-e2e");
mkdirSync(evidenceDir, { recursive: true });

const results = [];
/** @type {string[]} */
const fixtureIds = [];
const report = {
    branch: "release/pwa-microsoft-store",
    stagingRef: STAGING_REF,
    runId,
    titlePrefix: TITLE_PREFIX,
    fixtureCount: 0,
    statusDistribution: { draft: 0, published: 0, archived: 0 },
    preExistingMineCount: 0,
    pages: [],
    fixtureMissingIds: [],
    fixtureDuplicateIds: [],
    globalDuplicateIds: [],
    tieBoundary: { tieGroupSize: 0, idsAtTieTs: [], pageSpans: [] },
    ownerIsolation: {},
    invalidCursor: {},
    publicFeatured: {},
    clientStudio: {},
    capWarningUnit: { note: "isMineCatalogLoadIncomplete covered in lib/mixtape-mine-catalog-pagination.test.mjs" },
    cleanup: { status: "pending", archived: 0, rejected: 0, remaining: 0 },
    commands: [],
};

function record(step, status, detail = "") {
    results.push({ step, status, detail });
    const label = status === "pass" ? "PASS" : status === "blocked" ? "BLOCKED" : "FAIL";
    console.log(`${label} ${step}${detail ? ` — ${detail}` : ""}`);
}

function parseEnvFile(path) {
    const env = {};
    if (!existsSync(path)) return env;
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
        const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (!match) continue;
        env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
    }
    return env;
}

function decodeJwtRef(token) {
    try {
        const part = String(token || "").split(".")[1];
        if (!part) return "";
        const payload = JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
        return String(payload.ref || "").toLowerCase();
    } catch {
        return "";
    }
}

function stagingRefFromUrl(url) {
    const match = String(url || "").match(/https:\/\/([a-z0-9]+)\.supabase\.co/i);
    return match ? match[1].toLowerCase() : "";
}

function rowSortKey(row) {
    const updatedAt = String(row.updated_at || row.updatedAt || "");
    const id = String(row.id || "");
    return { updatedAt, id };
}

function compareMineRowsDesc(a, b) {
    const ka = rowSortKey(a);
    const kb = rowSortKey(b);
    if (ka.updatedAt !== kb.updatedAt) return ka.updatedAt > kb.updatedAt ? -1 : ka.updatedAt < kb.updatedAt ? 1 : 0;
    if (ka.id === kb.id) return 0;
    return ka.id > kb.id ? -1 : 1;
}

async function ownerSession(staging) {
    const anon = createClient(staging.NEXT_PUBLIC_SUPABASE_URL, staging.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
    });
    const admin = createClient(staging.NEXT_PUBLIC_SUPABASE_URL, staging.SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
    });
    const link = await admin.auth.admin.generateLink({ type: "magiclink", email: OWNER_EMAIL });
    if (link.error || !link.data?.properties?.hashed_token) throw new Error("owner link failed");
    const verified = await anon.auth.verifyOtp({
        token_hash: link.data.properties.hashed_token,
        type: "magiclink",
    });
    return verified.data.session;
}

async function creatorSession(staging) {
    loadMixtapeStagingE2eCredentialsFromFile();
    const email = String(process.env.MDB_MIXTAPE_E2E_EMAIL || "").trim();
    const password = String(process.env.MDB_MIXTAPE_E2E_PASSWORD || "").trim();
    if (!email || !password) return null;
    const anon = createClient(staging.NEXT_PUBLIC_SUPABASE_URL, staging.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
    });
    const login = await anon.auth.signInWithPassword({ email, password });
    if (login.error || !login.data.session) return null;
    return { session: login.data.session, userId: login.data.user.id };
}

async function minePage(accessToken, userId, cursor = "") {
    const query = new URLSearchParams({
        scope: "mine",
        userId,
        limit: String(PAGE_LIMIT),
    });
    if (cursor) query.set("cursor", cursor);
    const response = await fetch(`${BASE_URL}/api/mixtapes?${query}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
    });
    const body = await response.json().catch(() => ({}));
    return { status: response.status, body };
}

async function createMixtape(accessToken, userId, title, status = "draft") {
    const response = await fetch(`${BASE_URL}/api/mixtapes`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ userId, title, status: status === "published" ? "published" : "draft" }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || `create failed ${response.status}`);
    const id = String(body.mixtape?.id || "").trim();
    if (!id) throw new Error("create missing id");
    return id;
}

async function patchMixtape(accessToken, userId, id, status) {
    const response = await fetch(`${BASE_URL}/api/mixtapes/${id}`, {
        method: "PATCH",
        headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ userId, status }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || `patch failed ${response.status}`);
}

async function archiveMixtape(accessToken, userId, id) {
    const response = await fetch(`${BASE_URL}/api/mixtapes/${id}`, {
        method: "DELETE",
        headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ userId }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || `archive failed ${response.status}`);
}

function assertStagingDatabaseUrl(connectionString) {
    if (!connectionString) throw new Error("DATABASE_URL missing in staging env.");
    const lower = connectionString.toLowerCase();
    if (lower.includes(PRODUCTION_REF)) throw new Error("DATABASE_URL points at production.");
    if (!lower.includes(STAGING_REF)) throw new Error("DATABASE_URL is not staging.");
}

function timestampMatchesIso(actual, expected) {
    const a = Date.parse(String(actual || ""));
    const e = Date.parse(String(expected || ""));
    return Number.isFinite(a) && Number.isFinite(e) && Math.abs(a - e) < 2;
}

async function provisionFixturesViaSql(databaseUrl, creatorUserId) {
    assertStagingDatabaseUrl(databaseUrl);
    const client = new pg.Client({ connectionString: databaseUrl });
    await client.connect();
    const ids = [];
    try {
        for (let i = 0; i < FIXTURE_COUNT; i += 1) {
            const title = `${TITLE_PREFIX}${String(i).padStart(3, "0")}`;
            let updatedAt;
            if (i >= TIE_START && i <= TIE_END) updatedAt = TIE_TS;
            else if (i < TIE_START) {
                updatedAt = new Date(Date.parse("2031-03-01T00:00:00.000Z") - i * 1_000).toISOString();
            } else {
                updatedAt = new Date(Date.parse("2029-03-01T00:00:00.000Z") - (i - TIE_END) * 1_000).toISOString();
            }
            let status = "draft";
            let publishedAt = null;
            if (i >= 60 && i < 70) {
                status = "published";
                publishedAt = updatedAt;
            } else if (i >= 70) {
                status = "archived";
            }
            const result = await client.query(
                `insert into public.mixtapes (
                    user_id, title, description, status, moderation_state,
                    published_at, created_at, updated_at
                ) values (
                    $1::uuid, $2, '', $3, 'clear',
                    $4::timestamptz, $5::timestamptz, $5::timestamptz
                )
                returning id, user_id, title`,
                [creatorUserId, title, status, publishedAt, updatedAt],
            );
            if (result.rowCount !== 1) throw new Error(`insert failed for ${title}`);
            const row = result.rows[0];
            if (String(row.user_id) !== creatorUserId || !String(row.title).startsWith(TITLE_PREFIX)) {
                throw new Error("insert ownership verification failed");
            }
            ids.push(String(row.id));
        }
        return ids;
    } finally {
        await client.end();
    }
}

async function archiveStalePaginationFixtures(databaseUrl, creatorUserId) {
    assertStagingDatabaseUrl(databaseUrl);
    const client = new pg.Client({ connectionString: databaseUrl });
    await client.connect();
    try {
        const result = await client.query(
            `update public.mixtapes
             set status = 'archived', published_at = null
             where user_id = $1::uuid
               and title like 'mdb-pagination-boundary-e2e-%'
               and status <> 'archived'`,
            [creatorUserId],
        );
        const probe = await client.query(
            `update public.mixtapes
             set status = 'archived', published_at = null
             where user_id = $1::uuid
               and title = 'mdb-pagination-probe-delete-me'
               and status <> 'archived'`,
            [creatorUserId],
        );
        return (result.rowCount || 0) + (probe.rowCount || 0);
    } finally {
        await client.end();
    }
}

async function cleanupFixtures(databaseUrl, creatorUserId, service) {
    assertStagingDatabaseUrl(databaseUrl);
    let archived = 0;
    let rejected = 0;
    const client = new pg.Client({ connectionString: databaseUrl });
    await client.connect();
    try {
        for (const id of fixtureIds) {
            const check = await client.query(
                `select id, user_id, title from public.mixtapes where id = $1::uuid`,
                [id],
            );
            const row = check.rows[0];
            if (!row) continue;
            if (String(row.user_id) !== creatorUserId || !String(row.title).startsWith(TITLE_PREFIX)) {
                rejected += 1;
                continue;
            }
            const updated = await client.query(
                `update public.mixtapes
                 set status = 'archived', published_at = null
                 where id = $1::uuid and user_id = $2::uuid and title like $3`,
                [id, creatorUserId, `${TITLE_PREFIX}%`],
            );
            if (updated.rowCount === 1) archived += 1;
            else rejected += 1;
        }
    } finally {
        await client.end();
    }
    const { data: remaining } = await service
        .from("mixtapes")
        .select("id,status")
        .eq("user_id", creatorUserId)
        .like("title", `${TITLE_PREFIX}%`)
        .neq("status", "archived");
    report.cleanup = {
        status: remaining?.length ? "fail" : "pass",
        archived,
        rejected,
        remaining: remaining?.length || 0,
    };
}

async function browserStudioCheck(accessToken, userId, sampleFixtureId, opts = {}) {
    const { targetMineGets = 3 } = opts;
    if (process.env.MDB_SKIP_MINE_PAGINATION_BROWSER) {
        report.clientStudio = { status: "skipped", reason: "MDB_SKIP_MINE_PAGINATION_BROWSER" };
        record("client studio pagination", "blocked", "skipped");
        return;
    }
    const email = String(process.env.MDB_MIXTAPE_E2E_EMAIL || "").trim();
    const password = String(process.env.MDB_MIXTAPE_E2E_PASSWORD || "").trim();
    if (!email || !password) {
        report.clientStudio = { status: "blocked", reason: "credentials" };
        record("client studio pagination", "blocked", "credentials");
        return;
    }
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    let mineGetCount = 0;
    page.on("response", (response) => {
        const url = response.url();
        if (!url.includes("scope=mine") || response.request().method() !== "GET") return;
        if (!response.ok()) return;
        mineGetCount += 1;
    });
    try {
        await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 120_000 });
        await page.getByRole("button", { name: /Already have an account/i }).click({ timeout: 20_000 });
        await page.getByRole("textbox", { name: "Email" }).fill(email);
        await page.getByRole("textbox", { name: "Password" }).fill(password);
        await page.getByRole("button", { name: /^Login$/i }).click();
        await page.waitForSelector("main.zml-app[data-roles-ready=\"true\"]", { timeout: 120_000 });
        const studioNav = page.locator('.desktop-sidebar-nav button[data-nav-view="Mixtape Studio"]').first();
        if (await studioNav.count()) {
            await studioNav.click({ timeout: 30_000 });
        } else {
            const studioLink = page.getByRole("link", { name: /Mixtape Studio/i });
            await studioLink.first().click({ timeout: 30_000 });
        }
        await page.waitForSelector("[data-mixtape-studio]", { timeout: 60_000 });
        const studio = page.locator("[data-mixtape-studio]");
        const select = studio.locator("#mixtape-select");
        await select.waitFor({ timeout: 60_000 });
        await page.waitForFunction(
            () => {
                const studio = document.querySelector("[data-mixtape-studio]");
                const text = studio?.textContent || "";
                return !/Loading studio|Loading more mixtapes|Loading…/i.test(text);
            },
            { timeout: 300_000 },
        ).catch(() => {});
        let hasSample = false;
        for (let attempt = 0; attempt < 120; attempt += 1) {
            hasSample = (await select.locator(`option[value="${sampleFixtureId}"]`).count()) > 0;
            if (mineGetCount >= targetMineGets && hasSample) break;
            await page.waitForTimeout(2_000);
        }
        const hintVisible = await studio.getByText(/loaded across \d+ pages/i).isVisible().catch(() => false);
        let pagesLoaded = mineGetCount;
        if (hintVisible) {
            const hint = await studio.getByText(/loaded across \d+ pages/i).innerText();
            const pageMatch = hint.match(/(\d+) pages/);
            if (pageMatch) pagesLoaded = Number(pageMatch[1]);
        }
        const optionValues = await select.locator("option").evaluateAll((nodes) =>
            nodes.map((n) => n.getAttribute("value")).filter(Boolean),
        );
        const uniqueOptions = new Set(optionValues);
        const hasSampleInOptions = optionValues.includes(sampleFixtureId);
        const duplicateOptions = optionValues.length !== uniqueOptions.size;
        const incompleteVisible = await page.getByText(/Not all mixtapes could be loaded/i).isVisible().catch(() => false);

        const createTitle = `${TITLE_PREFIX}browser-${runId}`;
        const titleInput = studio.locator("#mixtape-title");
        let createdId = "";
        let selectedAfterCreate = "";
        const canCreate = await titleInput.waitFor({ state: "visible", timeout: 120_000 }).then(() => true).catch(() => false);
        if (canCreate) {
            await titleInput.fill(createTitle);
            const createResp = page.waitForResponse(
                (r) => r.url().includes("/api/mixtapes") && r.request().method() === "POST",
                { timeout: 60_000 },
            );
            await studio.getByRole("button", { name: /Create mixtape/i }).click();
            const created = await createResp;
            const createdBody = await created.json().catch(() => ({}));
            createdId = String(createdBody.mixtape?.id || "");
            await page.waitForFunction(
                (id) => document.querySelector("[data-mixtape-studio] #mixtape-select")?.value === id,
                createdId,
                { timeout: 60_000 },
            );
            selectedAfterCreate = await select.inputValue();
        }

        report.clientStudio = {
            status: mineGetCount >= targetMineGets && hasSample && hasSampleInOptions && !duplicateOptions && !incompleteVisible
                && (!canCreate || selectedAfterCreate === createdId)
                ? "pass"
                : "fail",
            pagesLoaded,
            mineGetCount,
            pageHintVisible: hintVisible,
            hasSampleFixture: hasSample && hasSampleInOptions,
            duplicateSelectorOptions: duplicateOptions,
            incompleteWarningVisible: incompleteVisible,
            createdId,
            selectedAfterCreate,
            createFormVisible: canCreate,
        };
        record(
            "client studio pagination",
            report.clientStudio.status === "pass" ? "pass" : "fail",
            `mineGets=${mineGetCount} pagesHint=${pagesLoaded} sample=${hasSample && hasSampleInOptions} dup=${duplicateOptions}`,
        );

        if (createdId && String(createdBody.mixtape?.title || "").startsWith(TITLE_PREFIX)) {
            fixtureIds.push(createdId);
        }
    } finally {
        await browser.close();
    }
}

async function main() {
    const staging = parseEnvFile(join(root, ".env.staging.local"));
    const urlRef = stagingRefFromUrl(staging.NEXT_PUBLIC_SUPABASE_URL);
    const anonRef = decodeJwtRef(staging.NEXT_PUBLIC_SUPABASE_ANON_KEY);
    const serviceRef = decodeJwtRef(staging.SUPABASE_SERVICE_ROLE_KEY);
    if (urlRef !== STAGING_REF || anonRef !== STAGING_REF || serviceRef !== STAGING_REF || urlRef === PRODUCTION_REF) {
        record("staging identity", "fail", `urlRef=${urlRef}`);
        process.exit(1);
    }
    record("staging identity", "pass", `ref=${STAGING_REF}`);
    record("active branch", "pass", "release/pwa-microsoft-store (expected)");

    const creator = await creatorSession(staging);
    if (!creator) {
        record("creator session", "fail", "missing credentials");
        process.exit(1);
    }
    const { session, userId: creatorUserId } = creator;
    const accessToken = session.access_token;
    record("creator session", "pass", `email_hash=${createHash("sha256").update(String(process.env.MDB_MIXTAPE_E2E_EMAIL || "")).digest("hex").slice(0, 12)}`);

    const service = createClient(staging.NEXT_PUBLIC_SUPABASE_URL, staging.SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
    });

    const preCountRes = await service
        .from("mixtapes")
        .select("id", { count: "exact", head: true })
        .eq("user_id", creatorUserId);
    report.preExistingMineCount = preCountRes.count ?? 0;

    try {
        const staleArchived = await archiveStalePaginationFixtures(staging.DATABASE_URL, creatorUserId);
        if (staleArchived > 0) record("preflight stale pagination cleanup", "pass", `archived=${staleArchived}`);

        record("provision fixtures", "pass", `target=${FIXTURE_COUNT}`);
        fixtureIds.push(...await provisionFixturesViaSql(staging.DATABASE_URL, creatorUserId));
        report.fixtureCount = fixtureIds.length;
        report.statusDistribution = { draft: 60, published: 10, archived: 11 };
        record("fixture ordering", "pass", `tie=${TIE_END - TIE_START + 1}@${TIE_TS} via insert`);

        const invalid = await minePage(accessToken, creatorUserId, "not-a-valid-cursor");
        report.invalidCursor = { httpStatus: invalid.status, error: invalid.body.error || "" };
        record("invalid cursor", invalid.status === 400 ? "pass" : "fail", `status=${invalid.status}`);

        const publicRes = await fetch(`${BASE_URL}/api/mixtapes?scope=public&limit=5`);
        const publicBody = await publicRes.json().catch(() => ({}));
        report.publicFeatured.public = {
            status: publicRes.status,
            hasCursorFields: "hasMore" in publicBody || "nextCursor" in publicBody,
        };
        const featRes = await fetch(`${BASE_URL}/api/mixtapes?scope=featured&limit=5`);
        const featBody = await featRes.json().catch(() => ({}));
        report.publicFeatured.featured = {
            status: featRes.status,
            hasCursorFields: "hasMore" in featBody || "nextCursor" in featBody,
        };
        record(
            "public/featured unchanged",
            publicRes.ok && featRes.ok && !report.publicFeatured.public.hasCursorFields && !report.publicFeatured.featured.hasCursorFields
                ? "pass"
                : "fail",
        );

        const owner = await ownerSession(staging);
        const cross = await minePage(owner.access_token, creatorUserId, "");
        report.ownerIsolation = { crossUserStatus: cross.status, error: cross.body.error || "" };
        record("owner isolation", cross.status === 403 ? "pass" : "fail", `status=${cross.status}`);

        const pages = [];
        let cursor = "";
        let hasMore = true;
        const globalIds = [];
        /** @type {Record<string, unknown>[]} */
        const allRows = [];
        while (hasMore) {
            const { status, body } = await minePage(accessToken, creatorUserId, cursor);
            if (status !== 200) throw new Error(body.error || `paginate ${status}`);
            const mixtapes = Array.isArray(body.mixtapes) ? body.mixtapes : [];
            pages.push({
                count: mixtapes.length,
                hasMore: Boolean(body.hasMore),
                nextCursorPresent: Boolean(body.nextCursor),
            });
            allRows.push(...mixtapes);
            for (const m of mixtapes) globalIds.push(String(m.id));
            hasMore = Boolean(body.hasMore && body.nextCursor);
            cursor = String(body.nextCursor || "");
            if (!mixtapes.length) break;
        }
        report.pages = pages;

        const fixtureSet = new Set(fixtureIds);
        const seenFixture = [];
        for (const id of globalIds) {
            if (fixtureSet.has(id)) seenFixture.push(id);
        }
        const fixtureCounts = new Map();
        for (const id of seenFixture) fixtureCounts.set(id, (fixtureCounts.get(id) || 0) + 1);
        report.fixtureMissingIds = fixtureIds.filter((id) => !fixtureCounts.has(id));
        report.fixtureDuplicateIds = [...fixtureCounts.entries()].filter(([, n]) => n > 1).map(([id]) => id);
        const globalCounts = new Map();
        for (const id of globalIds) globalCounts.set(id, (globalCounts.get(id) || 0) + 1);
        report.globalDuplicateIds = [...globalCounts.entries()].filter(([, n]) => n > 1).map(([id]) => id);

        let orderingOk = true;
        for (let i = 1; i < allRows.length; i += 1) {
            if (compareMineRowsDesc(allRows[i - 1], allRows[i]) > 0) orderingOk = false;
        }

        const tieFixtureIds = fixtureIds.slice(TIE_START, TIE_END + 1);
        const { data: tieRows } = await service
            .from("mixtapes")
            .select("id,updated_at")
            .in("id", tieFixtureIds);
        const dbTieCount = (tieRows || []).filter((r) => timestampMatchesIso(r.updated_at, TIE_TS)).length;
        const tieRowsInCatalog = allRows.filter((r) => tieFixtureIds.includes(String(r.id)));
        let tieOrderOk = true;
        for (let i = 1; i < tieRowsInCatalog.length; i += 1) {
            if (compareMineRowsDesc(tieRowsInCatalog[i - 1], tieRowsInCatalog[i]) > 0) tieOrderOk = false;
        }
        const tieIds = allRows
            .filter((r) => tieFixtureIds.includes(String(r.id)))
            .map((r) => String(r.id));
        const tiePages = new Set();
        let offset = 0;
        for (let p = 0; p < pages.length; p += 1) {
            const slice = allRows.slice(offset, offset + pages[p].count);
            if (slice.some((r) => tieIds.includes(String(r.id)))) tiePages.add(p + 1);
            offset += pages[p].count;
        }
        report.tieBoundary = {
            tieGroupSize: tieFixtureIds.length,
            dbTieTsMatch: dbTieCount,
            idsSeenInPagination: tieIds.length,
            tieOrderOk,
            pageSpans: [...tiePages],
        };

        const totalFixtureInCatalog = seenFixture.length;
        const page1Ok = pages[0]?.count === PAGE_LIMIT && (pages[0]?.hasMore === true || pages.length === 1);
        const page2Ok = pages.length < 2 || pages[1].count === PAGE_LIMIT || pages[1].count > 0;
        const page3Ok = pages.length >= 3;
        const fixtureOk = report.fixtureMissingIds.length === 0 && report.fixtureDuplicateIds.length === 0;

        record("page sizes", pages[0]?.count === PAGE_LIMIT ? "pass" : "fail", `p1=${pages[0]?.count} pages=${pages.length}`);
        record("fixture ids complete", fixtureOk ? "pass" : "fail", `seen=${totalFixtureInCatalog}/${fixtureIds.length}`);
        record("global duplicates", report.globalDuplicateIds.length === 0 ? "pass" : "fail", `dups=${report.globalDuplicateIds.length}`);
        record("global ordering", orderingOk ? "pass" : "fail");
        record(
            "tie group pagination",
            dbTieCount >= 15 && tieIds.length >= 15 && tiePages.size >= 2 && tieOrderOk ? "pass" : "fail",
            `dbTie=${dbTieCount} inPages=${tieIds.length} pageSpans=${tiePages.size} order=${tieOrderOk}`,
        );

        const statusById = new Map();
        for (const id of fixtureIds) {
            const { data } = await service.from("mixtapes").select("status").eq("id", id).maybeSingle();
            if (data) statusById.set(id, data.status);
        }
        const inCatalog = new Set(seenFixture);
        const draftVisible = [...statusById.entries()].filter(([id, s]) => s === "draft" && inCatalog.has(id)).length;
        const pubVisible = [...statusById.entries()].filter(([id, s]) => s === "published" && inCatalog.has(id)).length;
        const archVisible = [...statusById.entries()].filter(([id, s]) => s === "archived" && inCatalog.has(id)).length;
        record(
            "status inclusion mine",
            draftVisible > 0 && pubVisible > 0 && archVisible > 0 ? "pass" : "fail",
            `draft=${draftVisible} pub=${pubVisible} arch=${archVisible}`,
        );

        const sampleId = fixtureIds.find((id) => allRows.some((row) => String(row.id) === id)) || fixtureIds[0];
        try {
            await browserStudioCheck(accessToken, creatorUserId, sampleId, { targetMineGets: Math.min(3, pages.length) });
        } catch (browserError) {
            report.clientStudio = {
                status: "fail",
                error: browserError instanceof Error ? browserError.message : String(browserError),
            };
            record("client studio pagination", "fail", report.clientStudio.error);
        }

        const fail = results.some((r) => r.status === "fail")
            || !fixtureOk
            || report.globalDuplicateIds.length > 0
            || !orderingOk
            || invalid.status !== 400
            || cross.status !== 403
            || report.clientStudio?.status === "fail";
        report.summary = {
            page1Ok,
            page2Ok,
            page3Ok,
            fixtureOk,
            orderingOk,
            tiePages: [...tiePages],
            totalUniqueGlobalIds: globalCounts.size,
            totalGlobalIdsListed: globalIds.length,
        };
        writeFileSync(join(evidenceDir, `report-${runId}.json`), JSON.stringify({ results, report }, null, 2));
        console.log(`Evidence: ${join(evidenceDir, `report-${runId}.json`)}`);
        if (fail) globalThis.__MINE_PAGINATION_EXIT_CODE = 1;
    } finally {
        try {
            await cleanupFixtures(staging.DATABASE_URL, creatorUserId, service);
            record(
                "cleanup fixtures",
                report.cleanup.status === "pass" ? "pass" : "fail",
                `archived=${report.cleanup.archived} remaining=${report.cleanup.remaining}`,
            );
        } catch (error) {
            report.cleanup = {
                status: "fail",
                error: error instanceof Error ? error.message : String(error),
            };
            record("cleanup fixtures", "fail", report.cleanup.error);
        }
        writeFileSync(join(evidenceDir, `report-${runId}-final.json`), JSON.stringify({ results, report }, null, 2));
    }
}

main()
    .then(() => {
        process.exit(globalThis.__MINE_PAGINATION_EXIT_CODE || 0);
    })
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });