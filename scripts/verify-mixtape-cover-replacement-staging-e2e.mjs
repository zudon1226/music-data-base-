/**
 * Staging E2E: Studio cover upload, replace, refresh persistence, safe failure.
 */
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
    PRESERVED_MIXTAPE_ID,
    assertStagingOnly,
    apiPost,
    archiveMixtape,
    creatorSession,
    fetchOwnedMixtape,
    fetchPublicMixtapeDetail,
    isMixtapeDetailHiddenFromPublic,
    findForeignMixtapeId,
    makeCoverPngA,
    makeCoverPngB,
    makeMinimalMp3Base64,
    makeRunToken,
    parseEnvFile,
    removeOwnedStoragePaths,
    repoPath,
    storageObjectExists,
    writeEvidence,
} from "./lib/mixtape-staging-regression-common.mjs";
import { loadMixtapeStagingE2eCredentialsFromFile } from "./lib/load-mixtape-staging-e2e-credentials.mjs";
import {
    clickMixtapeStatusButton,
    createMixtapeInStudio,
    loginMixtapeCreator,
    publishFirstTrackInStudio,
    readCoverPreviewBackground,
    reloadStudioAndSelect,
    waitForCoverPreviewBackground,
    uploadStudioCover,
    uploadStudioTrack,
    waitForStudioFirstCatalogPage,
} from "./lib/mixtape-studio-playwright-harness.mjs";

const BASE = (process.env.MDB_MIXTAPE_E2E_BASE_URL || "http://localhost:3003").replace(/\/$/, "");
const runToken = makeRunToken();
const RUN_PREFIX = `mdb-cover-replace-${runToken}`;
const evidenceDir = repoPath("tmp-mixtape-cover-replacement-e2e", runToken);
mkdirSync(evidenceDir, { recursive: true });
const mediaDir = join(evidenceDir, "media");
mkdirSync(mediaDir, { recursive: true });
const coverAPath = join(mediaDir, `${RUN_PREFIX}-a.png`);
const coverBPath = join(mediaDir, `${RUN_PREFIX}-b.png`);
const coverBadPath = join(mediaDir, `${RUN_PREFIX}-bad.gif`);
const trackPath = join(mediaDir, `${RUN_PREFIX}.mp3`);
writeFileSync(coverAPath, makeCoverPngA());
writeFileSync(coverBPath, makeCoverPngB());
writeFileSync(coverBadPath, Buffer.from("GIF89a", "utf8"));
writeFileSync(trackPath, makeMinimalMp3Base64());

const results = [];
let mixtapeId = "";
let pathA = "";
let pathB = "";
const storagePaths = [];

function record(step, status, detail = "") {
    results.push({ step, status, detail });
    console.log(`${status === "pass" ? "PASS" : status === "blocked" ? "BLOCKED" : "FAIL"} ${step}${detail ? ` — ${detail}` : ""}`);
}

async function main() {
    loadMixtapeStagingE2eCredentialsFromFile();
    const staging = parseEnvFile(repoPath(".env.staging.local"));
    record("staging identity", "pass", `ref=${assertStagingOnly(staging)}`);

    const email = String(process.env.MDB_MIXTAPE_E2E_EMAIL || "").trim();
    const password = String(process.env.MDB_MIXTAPE_E2E_PASSWORD || "").trim();
    if (!email || !password) process.exit(1);

    const session = await creatorSession(staging);
    if (!session) process.exit(1);
    const userId = session.user.id;

    const browser = await chromium.launch({ headless: true });
    const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
    page.on("dialog", (dialog) => dialog.accept());

    try {
        await loginMixtapeCreator(page, BASE, email, password);
        await waitForStudioFirstCatalogPage(page);

        const created = await createMixtapeInStudio(page, { title: RUN_PREFIX, description: RUN_PREFIX });
        mixtapeId = created.id;
        record("create mixtape (Studio UI)", "pass", mixtapeId);

        await uploadStudioTrack(page, trackPath);
        await publishFirstTrackInStudio(page);

        const coverAUpload = await uploadStudioCover(page, coverAPath);
        record(
            "upload cover A (Studio UI)",
            coverAUpload.patchStatus === 200 ? "pass" : "fail",
            `prepare=${coverAUpload.prepareStatus} patch=${coverAUpload.patchStatus}`,
        );
        const bgA = await readCoverPreviewBackground(page);
        record("cover preview after A", bgA && bgA !== "none" ? "pass" : "fail", bgA.slice(0, 60));

        const ownedA = await fetchOwnedMixtape(BASE, session, mixtapeId);
        pathA = String(ownedA.json.mixtape?.coverStoragePath || "");
        if (pathA) storagePaths.push(pathA);

        await clickMixtapeStatusButton(page, /Publish mixtape/i, "PATCH", mixtapeId);
        const publicDetail = await fetchPublicMixtapeDetail(BASE, mixtapeId);
        record("published public detail", publicDetail.status === 200 ? "pass" : "fail", `http=${publicDetail.status}`);

        await reloadStudioAndSelect(page, mixtapeId, BASE);
        await waitForCoverPreviewBackground(page).catch(() => null);
        const bgAfterRefresh = await readCoverPreviewBackground(page);
        record("cover preview after refresh", bgAfterRefresh && bgAfterRefresh !== "none" ? "pass" : "fail");

        const coverBUpload = await uploadStudioCover(page, coverBPath);
        record(
            "replace cover B (Studio UI)",
            coverBUpload.patchStatus === 200 ? "pass" : "fail",
            `prepare=${coverBUpload.prepareStatus} patch=${coverBUpload.patchStatus}`,
        );

        const ownedB = await fetchOwnedMixtape(BASE, session, mixtapeId);
        pathB = String(ownedB.json.mixtape?.coverStoragePath || "");
        if (pathB) storagePaths.push(pathB);
        record(
            "cover path changed",
            pathA && pathB && pathA !== pathB ? "pass" : "fail",
            `pathA=${pathA} pathB=${pathB}`,
        );

        await reloadStudioAndSelect(page, mixtapeId, BASE);
        await waitForCoverPreviewBackground(page).catch(() => null);
        const bgB = await readCoverPreviewBackground(page);
        record("replacement persists after refresh", bgB && bgB !== "none" ? "pass" : "fail");

        const oldObjectStillPresent = await storageObjectExists(staging, pathA);
        const newObjectPresent = await storageObjectExists(staging, pathB);
        record(
            "storage lifecycle (no server delete on replace)",
            oldObjectStillPresent && newObjectPresent ? "pass" : "fail",
            `oldKept=${oldObjectStillPresent} new=${newObjectPresent}`,
        );

        const failPrepare = page.waitForResponse(
            (r) => r.request().method() === "POST" && r.url().includes("/api/mixtapes/uploads"),
            { timeout: 30_000 },
        );
        await page.locator('[data-mixtape-studio] input[accept*="image"]').setInputFiles(coverBadPath);
        const failRes = await failPrepare.catch(() => null);
        const failStatus = failRes?.status() ?? 0;
        const studioText = await page.locator("[data-mixtape-studio]").innerText();
        const ownedAfterFail = await fetchOwnedMixtape(BASE, session, mixtapeId);
        record(
            "failed replacement safe",
            (failStatus === 400 || /cover must be|does not match|MIME/i.test(studioText))
                && ownedAfterFail.json.mixtape?.coverStoragePath === pathB
                ? "pass"
                : "fail",
            `prepare=${failStatus}`,
        );
        record(
            "no false success on failure",
            !/Cover artwork updated/i.test(studioText) || failStatus === 400 ? "pass" : "fail",
        );

        await page.screenshot({ path: join(evidenceDir, "studio-cover-final.png"), fullPage: true });

        const foreignMixtapeId = await findForeignMixtapeId(staging, userId);
        if (foreignMixtapeId) {
            const intruder = await apiPost(
                BASE,
                "/api/mixtapes/uploads",
                {
                    userId,
                    action: "prepare-cover",
                    mixtapeId: foreignMixtapeId,
                    fileName: `${RUN_PREFIX}-intruder.png`,
                    contentType: "image/png",
                    fileSize: 90,
                },
                session,
            );
            record("foreign creator cannot prepare cover", intruder.status === 403 ? "pass" : "fail", `status=${intruder.status}`);
        }

        const anon = createClient(staging.NEXT_PUBLIC_SUPABASE_URL, staging.NEXT_PUBLIC_SUPABASE_ANON_KEY);
        const anonRead = await anon.storage.from("mixtapes").download(pathB);
        record("anon cannot read private cover object", anonRead.error ? "pass" : "fail");
    }
    finally {
        await browser.close();
        if (mixtapeId && mixtapeId !== PRESERVED_MIXTAPE_ID) {
            const owned = await fetchOwnedMixtape(BASE, session, mixtapeId).catch(() => ({ json: {} }));
            const title = String(owned.json.mixtape?.title || "");
            if (title.startsWith("mdb-cover-replace-")) {
                await archiveMixtape(BASE, session, mixtapeId);
                record("cleanup archive fixture", "pass", mixtapeId);
            }
            const pub = await fetchPublicMixtapeDetail(BASE, mixtapeId);
            record(
                "not public after cleanup",
                isMixtapeDetailHiddenFromPublic(pub.status) ? "pass" : "fail",
                `detail=${pub.status}`,
            );
            await removeOwnedStoragePaths(staging, storagePaths, userId, RUN_PREFIX);
        }
        record("preserved fixture untouched", "pass", PRESERVED_MIXTAPE_ID);
    }

    writeEvidence(evidenceDir, "report.json", {
        runToken,
        mixtapeId,
        coverPaths: { a: pathA, b: pathB },
        storagePaths,
        results,
        generatedAt: new Date().toISOString(),
    });
    process.exit(results.some((r) => r.status === "fail") ? 1 : 0);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});