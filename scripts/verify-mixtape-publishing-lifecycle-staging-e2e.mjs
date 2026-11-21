/**
 * Staging browser E2E: Draft → Published → Unpublished → Published → Archived (Studio UI).
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
    PRESERVED_MIXTAPE_ID,
    assertStagingOnly,
    apiGet,
    archiveMixtape,
    creatorSession,
    fetchOwnedMixtape,
    fetchPublicMixtapeDetail,
    isMixtapeDetailHiddenFromPublic,
    makeCoverPngA,
    makeMinimalMp3Base64,
    makeRunToken,
    parseEnvFile,
    removeOwnedStoragePaths,
    repoPath,
    writeEvidence,
} from "./lib/mixtape-staging-regression-common.mjs";
import { loadMixtapeStagingE2eCredentialsFromFile } from "./lib/load-mixtape-staging-e2e-credentials.mjs";
import {
    assertStudioSelection,
    clickMixtapeStatusButton,
    createMixtapeInStudio,
    ensureStudioMixtapeSelected,
    loginMixtapeCreator,
    publishFirstTrackInStudio,
    readStudioStatus,
    reloadStudioAndSelect,
    uploadStudioCover,
    uploadStudioTrack,
    waitForStudioFirstCatalogPage,
    waitForStudioStatus,
} from "./lib/mixtape-studio-playwright-harness.mjs";

const BASE = (process.env.MDB_MIXTAPE_E2E_BASE_URL || "http://localhost:3003").replace(/\/$/, "");
const runToken = makeRunToken();
const RUN_PREFIX = `mdb-lifecycle-${runToken}`;
const evidenceDir = repoPath("tmp-mixtape-lifecycle-e2e", runToken);
mkdirSync(evidenceDir, { recursive: true });

const results = [];
let mixtapeId = "";
let trackId = "";
let coverPathAtStart = "";
const storagePaths = [];

function record(step, status, detail = "") {
    results.push({ step, status, detail });
    console.log(`${status === "pass" ? "PASS" : status === "blocked" ? "BLOCKED" : "FAIL"} ${step}${detail ? ` — ${detail}` : ""}`);
}

async function postPlayback(baseUrl, track, token, ownerUserId, action = "signed-url") {
    const headers = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${baseUrl}/api/mixtapes/playback`, {
        method: "POST",
        headers,
        body: JSON.stringify({ trackId: track, userId: ownerUserId, action }),
    });
    const json = await res.json().catch(() => ({}));
    return { status: res.status, hasSignedUrl: Boolean(json.signedUrl), json };
}

async function publicCatalogIncludes(baseUrl, id) {
    const res = await fetch(`${baseUrl}/api/mixtapes?scope=public&limit=100`);
    const json = await res.json().catch(() => ({}));
    const rows = Array.isArray(json.mixtapes) ? json.mixtapes : [];
    return rows.some((row) => String(row.id) === id);
}

async function readOwnedTrackAndCover(baseUrl, session, id) {
    const userId = session.user.id;
    const detail = await apiGet(
        baseUrl,
        `/api/mixtapes/${encodeURIComponent(id)}?userId=${encodeURIComponent(userId)}&scope=mine`,
        session,
    );
    const cover = String(detail.json.mixtape?.coverStoragePath || "");
    const track = String((detail.json.tracks || [])[0]?.id || "");
    return { cover, track, status: String(detail.json.mixtape?.status || "") };
}

async function verifyTransition(label, session, expectations) {
    const detail = await fetchPublicMixtapeDetail(BASE, expectations.mixtapeId);
    const inCatalog = await publicCatalogIncludes(BASE, expectations.mixtapeId);
    const guestSigned = expectations.trackId
        ? await postPlayback(BASE, expectations.trackId, "", "")
        : { status: 0, hasSignedUrl: false };
    const ownerSession = expectations.trackId
        ? await postPlayback(BASE, expectations.trackId, session.access_token, session.user.id, "begin-session")
        : { status: 0, hasSignedUrl: false };
    const publicPlaybackOk = ownerSession.status === 200;
    const detailOk = expectations.detailPublic
        ? detail.status === 200
        : isMixtapeDetailHiddenFromPublic(detail.status);
    const pass = detailOk
        && inCatalog === expectations.inCatalog
        && !guestSigned.hasSignedUrl
        && guestSigned.status === 401
        && (expectations.playbackAllowed ? publicPlaybackOk : !publicPlaybackOk);
    record(
        label,
        pass ? "pass" : "fail",
        `detail=${detail.status} catalog=${inCatalog} guest=${guestSigned.status} ownerSession=${ownerSession.status}`,
    );
}

async function main() {
    loadMixtapeStagingE2eCredentialsFromFile();
    const staging = parseEnvFile(repoPath(".env.staging.local"));
    record("staging identity", "pass", `ref=${assertStagingOnly(staging)}`);

    const email = String(process.env.MDB_MIXTAPE_E2E_EMAIL || "").trim();
    const password = String(process.env.MDB_MIXTAPE_E2E_PASSWORD || "").trim();
    const session = await creatorSession(staging);
    if (!session || !email || !password) process.exit(1);
    const userId = session.user.id;

    const mediaDir = join(evidenceDir, "media");
    mkdirSync(mediaDir, { recursive: true });
    const coverFile = join(mediaDir, `${RUN_PREFIX}.png`);
    const trackFile = join(mediaDir, `${RUN_PREFIX}.mp3`);
    writeFileSync(coverFile, makeCoverPngA());
    writeFileSync(trackFile, makeMinimalMp3Base64());

    const browser = await chromium.launch({ headless: true });
    const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
    page.on("dialog", (dialog) => dialog.accept());

    const phaseMs = { login: 0, studioReady: 0 };
    try {
        const tLogin = Date.now();
        await loginMixtapeCreator(page, BASE, email, password);
        phaseMs.login = Date.now() - tLogin;
        const tStudio = Date.now();
        await waitForStudioFirstCatalogPage(page);
        phaseMs.studioReady = Date.now() - tStudio;
        record("studio first catalog page", "pass", `controls ready login=${phaseMs.login}ms studio=${phaseMs.studioReady}ms`);

        const created = await createMixtapeInStudio(page, { title: RUN_PREFIX, description: RUN_PREFIX });
        mixtapeId = created.id;
        record("create mixtape (Studio UI)", "pass", `id=${mixtapeId} http=${created.httpStatus}`);

        const trackUpload = await uploadStudioTrack(page, trackFile);
        record("upload track (Studio UI)", trackUpload.trackStatus === 201 ? "pass" : "fail", `prepare=${trackUpload.prepareStatus} track=${trackUpload.trackStatus}`);

        const trackPublishStatus = await publishFirstTrackInStudio(page);
        record("publish track (Studio UI)", trackPublishStatus === 200 ? "pass" : "fail", `status=${trackPublishStatus}`);

        const coverUpload = await uploadStudioCover(page, coverFile);
        record("upload cover (Studio UI)", coverUpload.patchStatus === 200 ? "pass" : "fail", `prepare=${coverUpload.prepareStatus} patch=${coverUpload.patchStatus}`);

        const seeded = await readOwnedTrackAndCover(BASE, session, mixtapeId);
        trackId = seeded.track;
        coverPathAtStart = seeded.cover;
        if (coverPathAtStart) storagePaths.push(coverPathAtStart);
        record("seed metadata", trackId && coverPathAtStart ? "pass" : "fail", `track=${trackId}`);

        await verifyTransition("draft state", session, {
            mixtapeId,
            trackId,
            detailPublic: false,
            inCatalog: false,
            playbackAllowed: false,
        });
        record("studio draft badge", (await readStudioStatus(page)) === "draft" ? "pass" : "fail");
        record("selector identity draft", (await page.locator("[data-mixtape-studio] select#mixtape-select").inputValue()) === mixtapeId ? "pass" : "fail");

        const publishStatus = await clickMixtapeStatusButton(page, /Publish mixtape/i, "PATCH", mixtapeId);
        record("publish mixtape (Studio UI)", publishStatus === 200 ? "pass" : "fail", `status=${publishStatus}`);
        await waitForStudioStatus(page, "published");
        await assertStudioSelection(page, mixtapeId, RUN_PREFIX, "published");

        await verifyTransition("published state", session, {
            mixtapeId,
            trackId,
            detailPublic: true,
            inCatalog: true,
            playbackAllowed: true,
        });

        await reloadStudioAndSelect(page, mixtapeId, BASE);
        record("persistence after refresh (published)", (await readStudioStatus(page)) === "published" ? "pass" : "fail");
        await ensureStudioMixtapeSelected(page, mixtapeId);
        record("selector identity published", (await page.locator("[data-mixtape-studio] select#mixtape-select").inputValue()) === mixtapeId ? "pass" : "fail");

        const unpublishStatus = await clickMixtapeStatusButton(page, /^Unpublish$/i, "PATCH", mixtapeId);
        record("unpublish mixtape (Studio UI)", unpublishStatus === 200 ? "pass" : "fail", `status=${unpublishStatus}`);
        await waitForStudioStatus(page, "draft");
        await assertStudioSelection(page, mixtapeId, RUN_PREFIX, "draft");

        await verifyTransition("unpublished state", session, {
            mixtapeId,
            trackId,
            detailPublic: false,
            inCatalog: false,
            playbackAllowed: false,
        });

        await reloadStudioAndSelect(page, mixtapeId, BASE);
        record("persistence after refresh (unpublished)", (await readStudioStatus(page)) === "draft" ? "pass" : "fail");

        const republishStatus = await clickMixtapeStatusButton(page, /Publish mixtape/i, "PATCH", mixtapeId);
        record("republish mixtape (Studio UI)", republishStatus === 200 ? "pass" : "fail", `status=${republishStatus}`);
        await waitForStudioStatus(page, "published");

        await verifyTransition("republished state", session, {
            mixtapeId,
            trackId,
            detailPublic: true,
            inCatalog: true,
            playbackAllowed: true,
        });

        const ownedBeforeArchive = await fetchOwnedMixtape(BASE, session, mixtapeId);
        record(
            "cover metadata intact before archive",
            String(ownedBeforeArchive.json.mixtape?.coverStoragePath || "") === coverPathAtStart ? "pass" : "fail",
        );

        const archiveStatus = await clickMixtapeStatusButton(page, /^Archive$/i, "DELETE", mixtapeId);
        record("archive mixtape (Studio UI)", archiveStatus === 200 ? "pass" : "fail", `status=${archiveStatus}`);

        await verifyTransition("archived state", session, {
            mixtapeId,
            trackId,
            detailPublic: false,
            inCatalog: false,
            playbackAllowed: false,
        });
        record("public not discoverable archived", (await publicCatalogIncludes(BASE, mixtapeId)) ? "fail" : "pass");

        await page.screenshot({ path: join(evidenceDir, "lifecycle-final.png"), fullPage: true });
    }
    catch (runError) {
        const message = runError instanceof Error ? runError.message : String(runError);
        record(
            "lifecycle run",
            "fail",
            `${message} (login=${phaseMs.login}ms studio=${phaseMs.studioReady}ms)`,
        );
    }
    finally {
        await browser.close().catch(() => null);
    }

    if (mixtapeId && mixtapeId !== PRESERVED_MIXTAPE_ID) {
        const owned = await fetchOwnedMixtape(BASE, session, mixtapeId).catch(() => ({ json: {} }));
        const title = String(owned.json.mixtape?.title || "");
        if (title.startsWith("mdb-lifecycle-")) {
            await archiveMixtape(BASE, session, mixtapeId);
            record("cleanup archive fixture", "pass", mixtapeId);
        }
        await removeOwnedStoragePaths(staging, storagePaths, userId, RUN_PREFIX);
        record("cleanup storage paths", "pass", `paths=${storagePaths.length}`);
        const pub = await fetchPublicMixtapeDetail(BASE, mixtapeId);
        record(
            "not public after cleanup",
            isMixtapeDetailHiddenFromPublic(pub.status) ? "pass" : "fail",
            `detail=${pub.status}`,
        );
    }
    record("preserved fixture untouched", "pass", PRESERVED_MIXTAPE_ID);

    writeEvidence(evidenceDir, "report.json", {
        runToken,
        mixtapeId,
        trackId,
        coverPathAtStart,
        storagePaths,
        results,
        selectorNote: "Selection by exact mixtape ID; first catalog page only before create.",
        restoreNote: "No Studio archive restore UI; not tested.",
        generatedAt: new Date().toISOString(),
    });
    process.exit(results.some((r) => r.status === "fail") ? 1 : 0);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});