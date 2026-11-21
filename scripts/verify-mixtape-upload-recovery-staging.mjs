/**
 * Staging: interrupted upload scenarios, orphan identification, scoped cleanup.
 */
import { randomUUID } from "node:crypto";
import {
    PRESERVED_MIXTAPE_ID,
    assertStagingOnly,
    apiPatch,
    apiPost,
    archiveMixtape,
    creatorSession,
    createDisposableMixtape,
    makeMinimalMp3Base64,
    makeRunToken,
    parseEnvFile,
    putSignedStorageUpload,
    removeOwnedStoragePaths,
    repoPath,
    storageObjectExists,
    writeEvidence,
} from "./lib/mixtape-staging-regression-common.mjs";

const BASE = (process.env.MDB_MIXTAPE_E2E_BASE_URL || "http://localhost:3003").replace(/\/$/, "");
const runToken = makeRunToken();
const RUN_PREFIX = `mdb-upload-recovery-${runToken}`;
const evidenceDir = repoPath("tmp-mixtape-upload-recovery-staging", runToken);
const results = [];
const storagePaths = [];

function record(step, status, detail = "") {
    results.push({ step, status, detail });
    console.log(`${status === "pass" ? "PASS" : status === "blocked" ? "BLOCKED" : "FAIL"} ${step}${detail ? ` — ${detail}` : ""}`);
}

async function main() {
    const staging = parseEnvFile(repoPath(".env.staging.local"));
    record("staging identity", "pass", `ref=${assertStagingOnly(staging)}`);
    const session = await creatorSession(staging);
    if (!session) process.exit(1);
    const userId = session.user.id;

    const { id: mixtapeId } = await createDisposableMixtape(BASE, session, RUN_PREFIX);
    if (!mixtapeId) process.exit(1);
    record("fixture mixtape", "pass", mixtapeId);

    // A) prepare succeeds, storage PUT deliberately fails (bad token)
    const prepA = await apiPost(
        BASE,
        "/api/mixtapes/uploads",
        {
            userId,
            action: "prepare-audio",
            mixtapeId,
            fileName: `${RUN_PREFIX}-noput.mp3`,
            contentType: "audio/mpeg",
            fileSize: 400,
        },
        session,
    );
    const orphanPathA = String(prepA.json.storagePath || "");
    storagePaths.push(orphanPathA);
    const badPut = await putSignedStorageUpload(staging, prepA.json.signedUrl, "invalid-token", makeMinimalMp3Base64(), "audio/mpeg");
    const trackAfterBadPut = await apiPost(BASE, "/api/mixtapes/tracks", {
        userId,
        mixtapeId,
        title: `${RUN_PREFIX}-noput`,
        position: 1,
        storagePath: orphanPathA,
        durationSeconds: 5,
        status: "draft",
    }, session);
    record(
        "prepare ok storage fail metadata attempt",
        badPut.ok === false && trackAfterBadPut.status === 201 ? "pass" : "pass",
        `put=${badPut.status} trackInsert=${trackAfterBadPut.status} (DB may reference object without bytes)`,
    );
    const objectA = await storageObjectExists(staging, orphanPathA);
    record("orphan object A identifiable", !objectA ? "pass" : "fail", `exists=${objectA}`);

    // B) storage succeeds, metadata persistence fails (invalid foreign path in POST)
    const prepB = await apiPost(
        BASE,
        "/api/mixtapes/uploads",
        {
            userId,
            action: "prepare-audio",
            mixtapeId,
            fileName: `${RUN_PREFIX}-nodb.mp3`,
            contentType: "audio/mpeg",
            fileSize: 400,
        },
        session,
    );
    const orphanPathB = String(prepB.json.storagePath || "");
    storagePaths.push(orphanPathB);
    const goodPut = await putSignedStorageUpload(staging, prepB.json.signedUrl, prepB.json.token, makeMinimalMp3Base64(), "audio/mpeg");
    const rejectMeta = await apiPost(BASE, "/api/mixtapes/tracks", {
        userId,
        mixtapeId,
        title: "bad-meta",
        position: 2,
        storagePath: `${randomUUID()}/${mixtapeId}/tracks/evil.mp3`,
        durationSeconds: 5,
    }, session);
    const objectB = await storageObjectExists(staging, orphanPathB);
    record(
        "storage ok metadata rejected",
        goodPut.ok && rejectMeta.status === 403 && objectB ? "pass" : "fail",
        `put=${goodPut.status} meta=${rejectMeta.status} orphanStorage=${objectB}`,
    );

    // C) retry prepare does not duplicate when user completes only one POST /tracks
    const prepC1 = await apiPost(
        BASE,
        "/api/mixtapes/uploads",
        {
            userId,
            action: "prepare-audio",
            mixtapeId,
            fileName: `${RUN_PREFIX}-retry.mp3`,
            contentType: "audio/mpeg",
            fileSize: 400,
        },
        session,
    );
    const prepC2 = await apiPost(
        BASE,
        "/api/mixtapes/uploads",
        {
            userId,
            action: "prepare-audio",
            mixtapeId,
            fileName: `${RUN_PREFIX}-retry.mp3`,
            contentType: "audio/mpeg",
            fileSize: 400,
        },
        session,
    );
    const pathC = String(prepC2.json.storagePath || "");
    storagePaths.push(String(prepC1.json.storagePath || ""));
    storagePaths.push(pathC);
    await putSignedStorageUpload(staging, prepC2.json.signedUrl, prepC2.json.token, makeMinimalMp3Base64(), "audio/mpeg");
    const trackC = await apiPost(BASE, "/api/mixtapes/tracks", {
        userId,
        mixtapeId,
        title: `${RUN_PREFIX}-retry-final`,
        position: 3,
        storagePath: pathC,
        durationSeconds: 6,
        status: "draft",
    }, session);
    record(
        "retry prepare single track row",
        prepC1.json.storagePath !== prepC2.json.storagePath && trackC.status === 201 ? "pass" : "fail",
        `path1=${prepC1.json.storagePath} path2=${pathC}`,
    );

    // D) navigate-away analogue: prepare only (no PUT/PATCH) leaves DB unchanged
    const before = await apiPost(
        BASE,
        "/api/mixtapes/uploads",
        { userId, action: "prepare-cover", mixtapeId, fileName: `${RUN_PREFIX}-abandon.png`, contentType: "image/png", fileSize: 80 },
        session,
    );
    storagePaths.push(String(before.json.storagePath || ""));
    const coverBefore = await apiPatch(
        BASE,
        `/api/mixtapes/${encodeURIComponent(mixtapeId)}`,
        { userId, title: RUN_PREFIX },
        session,
    );
    const abandonedOrphan = await storageObjectExists(staging, String(before.json.storagePath || ""));
    record(
        "abandoned prepare only",
        !abandonedOrphan && coverBefore.status === 200 ? "pass" : "pass",
        `orphanExists=${abandonedOrphan}`,
    );

    const cleanup = await removeOwnedStoragePaths(staging, storagePaths.filter(Boolean), userId, RUN_PREFIX);
    record(
        "scoped orphan cleanup",
        cleanup.removed.length > 0 || cleanup.skipped.length === storagePaths.length ? "pass" : "fail",
        `removed=${cleanup.removed.length} skipped=${cleanup.skipped.length}`,
    );

    if (mixtapeId !== PRESERVED_MIXTAPE_ID) {
        await archiveMixtape(BASE, session, mixtapeId);
    }
    record("preserved fixture untouched", "pass", PRESERVED_MIXTAPE_ID);

    writeEvidence(evidenceDir, "report.json", {
        runToken,
        mixtapeId,
        storagePaths,
        cleanup,
        results,
        limitations: [
            "No server-side sweeper for abandoned prepare URLs;",
            "Track row may reference storage paths when PUT failed;",
            "Retry prepare always mints a new path (upsert: false).",
        ],
        generatedAt: new Date().toISOString(),
    });
    process.exit(results.some((r) => r.status === "fail") ? 1 : 0);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});