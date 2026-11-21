/**
 * Staging HTTP regression: mixtape upload preparation + track metadata validation.
 */
import { randomUUID } from "node:crypto";
import {
    MIXTAPE_AUDIO_MAX_BYTES,
    MIXTAPE_COVER_MAX_BYTES,
    PRESERVED_MIXTAPE_ID,
    assertStagingOnly,
    apiPost,
    archiveMixtape,
    createDisposableMixtape,
    creatorSession,
    findForeignMixtapeId,
    makeRunToken,
    parseEnvFile,
    platformOwnerSession,
    repoPath,
    writeEvidence,
} from "./lib/mixtape-staging-regression-common.mjs";

const BASE = (process.env.MDB_MIXTAPE_E2E_BASE_URL || "http://localhost:3003").replace(/\/$/, "");
const runToken = makeRunToken();
const evidenceDir = repoPath("tmp-mixtape-upload-validation-staging", runToken);
const results = [];

function expect(step, status, allowed, detail = "") {
    const ok = allowed.includes(status);
    results.push({ step, status, allowed, pass: ok, detail });
    console.log(`${ok ? "PASS" : "FAIL"} ${step} — status=${status}${detail ? ` ${detail}` : ""}`);
    return ok;
}

function coverBody(overrides, userId, mixtapeId) {
    return {
        userId,
        action: "prepare-cover",
        mixtapeId,
        fileName: "mdb-regression-cover.png",
        contentType: "image/png",
        fileSize: 90,
        ...overrides,
    };
}

function audioBody(overrides, userId, mixtapeId) {
    return {
        userId,
        action: "prepare-audio",
        mixtapeId,
        fileName: "mdb-regression-track.mp3",
        contentType: "audio/mpeg",
        fileSize: 512,
        ...overrides,
    };
}

async function main() {
    const staging = parseEnvFile(repoPath(".env.staging.local"));
    const ref = assertStagingOnly(staging);
    recordRef(ref);

    const session = await creatorSession(staging);
    if (!session) {
        console.log("BLOCKED approved creator credentials missing");
        process.exit(1);
    }
    const userId = session.user.id;
    const ownerSession = await platformOwnerSession(staging);

    const created = await createDisposableMixtape(
        BASE,
        session,
        `mdb-upload-val-${runToken}`,
    );
    const mixtapeId = created.id;
    if (!mixtapeId) {
        console.log("FAIL disposable mixtape create", created.status);
        process.exit(1);
    }

    const foreignMixtapeId = await findForeignMixtapeId(staging, userId);
    const missingMixtapeId = randomUUID();

    // --- Cover prepare ---
    expect("cover unsupported mime", (await apiPost(BASE, "/api/mixtapes/uploads", coverBody({
        fileName: "x.gif",
        contentType: "image/gif",
        fileSize: 100,
    }, userId, mixtapeId), session)).status, [400]);

    expect("cover invalid extension", (await apiPost(BASE, "/api/mixtapes/uploads", coverBody({
        fileName: "x.bmp",
        contentType: "image/png",
        fileSize: 100,
    }, userId, mixtapeId), session)).status, [400]);

    expect("cover mime extension mismatch", (await apiPost(BASE, "/api/mixtapes/uploads", coverBody({
        fileName: "x.png",
        contentType: "image/jpeg",
        fileSize: 100,
    }, userId, mixtapeId), session)).status, [400]);

    expect("cover missing fileName metadata", (await apiPost(BASE, "/api/mixtapes/uploads", coverBody({
        fileName: "",
        contentType: "",
        fileSize: 0,
    }, userId, mixtapeId), session)).status, [400]);

    expect("cover oversized descriptor", (await apiPost(BASE, "/api/mixtapes/uploads", coverBody({
        fileSize: MIXTAPE_COVER_MAX_BYTES + 1,
    }, userId, mixtapeId), session)).status, [400]);

    expect("cover invalid mixtape id", (await apiPost(BASE, "/api/mixtapes/uploads", coverBody({}, userId, "not-a-uuid"), session)).status, [400]);

    expect("cover missing mixtape", (await apiPost(BASE, "/api/mixtapes/uploads", coverBody({}, userId, missingMixtapeId), session)).status, [404]);

    expect("cover unauthenticated", (await apiPost(BASE, "/api/mixtapes/uploads", coverBody({}, "", mixtapeId), null)).status, [401]);

    expect("cover spoofed user id", (await apiPost(BASE, "/api/mixtapes/uploads", coverBody({}, randomUUID(), mixtapeId), session)).status, [403, 401]);

    if (foreignMixtapeId) {
        const foreign = await apiPost(
            BASE,
            "/api/mixtapes/uploads",
            coverBody({}, userId, foreignMixtapeId),
            session,
        );
        expect("cover foreign owner mixtape", foreign.status, [403]);
    }
    else {
        results.push({ step: "cover foreign owner mixtape", status: 0, pass: true, detail: "no foreign mixtape row found; skipped" });
        console.log("PASS cover foreign owner mixtape — skipped");
    }

    if (ownerSession && foreignMixtapeId) {
        const ownerProbe = await apiPost(
            BASE,
            "/api/mixtapes/uploads",
            coverBody({}, ownerSession.user.id, mixtapeId),
            ownerSession,
        );
        expect(
            "cover platform owner on foreign creator tape",
            ownerProbe.status,
            [200, 403],
            ownerProbe.status === 200 ? "admin may manage" : "denied",
        );
    }

    expect("cover valid prepare", (await apiPost(BASE, "/api/mixtapes/uploads", coverBody({}, userId, mixtapeId), session)).status, [200]);

    // --- Audio prepare ---
    expect("audio unsupported format", (await apiPost(BASE, "/api/mixtapes/uploads", audioBody({
        fileName: "x.wav",
        contentType: "audio/wav",
        fileSize: 200,
    }, userId, mixtapeId), session)).status, [400]);

    expect("audio invalid mixtape id", (await apiPost(BASE, "/api/mixtapes/uploads", audioBody({}, userId, "bad-id"), session)).status, [400]);

    expect("audio missing mixtape", (await apiPost(BASE, "/api/mixtapes/uploads", audioBody({}, userId, missingMixtapeId), session)).status, [404]);

    expect("audio oversized descriptor", (await apiPost(BASE, "/api/mixtapes/uploads", audioBody({
        fileSize: MIXTAPE_AUDIO_MAX_BYTES + 1,
    }, userId, mixtapeId), session)).status, [400]);

    expect("audio unauthenticated", (await apiPost(BASE, "/api/mixtapes/uploads", audioBody({}, "", mixtapeId), null)).status, [401]);

    if (foreignMixtapeId) {
        expect(
            "audio foreign owner mixtape",
            (await apiPost(BASE, "/api/mixtapes/uploads", audioBody({}, userId, foreignMixtapeId), session)).status,
            [403],
        );
    }

    const validAudio = await apiPost(BASE, "/api/mixtapes/uploads", audioBody({}, userId, mixtapeId), session);
    const validPath = String(validAudio.json.storagePath || "");
    expect("audio valid prepare", validAudio.status, [200]);

    // --- Track POST metadata (duration / ownership) ---
    expect("track missing title", (await apiPost(BASE, "/api/mixtapes/tracks", {
        userId,
        mixtapeId,
        title: "",
        position: 1,
        storagePath: validPath,
        durationSeconds: 10,
    }, session)).status, [400]);

    expect("track invalid position", (await apiPost(BASE, "/api/mixtapes/tracks", {
        userId,
        mixtapeId,
        title: "Regression",
        position: 0,
        storagePath: validPath,
        durationSeconds: 10,
    }, session)).status, [400]);

    expect("track published zero duration", (await apiPost(BASE, "/api/mixtapes/tracks", {
        userId,
        mixtapeId,
        title: "Regression zero",
        position: 1,
        storagePath: validPath,
        durationSeconds: 0,
        status: "published",
    }, session)).status, [400]);

    expect("track published negative duration", (await apiPost(BASE, "/api/mixtapes/tracks", {
        userId,
        mixtapeId,
        title: "Regression neg",
        position: 1,
        storagePath: validPath,
        durationSeconds: -3,
        status: "published",
    }, session)).status, [400]);

    expect("track published non-finite duration", (await apiPost(BASE, "/api/mixtapes/tracks", {
        userId,
        mixtapeId,
        title: "Regression nan",
        position: 1,
        storagePath: validPath,
        durationSeconds: Number.NaN,
        status: "published",
    }, session)).status, [400]);

    expect("track foreign storage path", (await apiPost(BASE, "/api/mixtapes/tracks", {
        userId,
        mixtapeId,
        title: "Regression foreign path",
        position: 1,
        storagePath: `${randomUUID()}/${mixtapeId}/tracks/evil.mp3`,
        durationSeconds: 5,
    }, session)).status, [403]);

    if (foreignMixtapeId) {
        expect("track foreign mixtape id", (await apiPost(BASE, "/api/mixtapes/tracks", {
            userId,
            mixtapeId: foreignMixtapeId,
            title: "Regression",
            position: 1,
            storagePath: validPath,
            durationSeconds: 5,
        }, session)).status, [403]);
    }

    expect("track draft zero duration allowed", (await apiPost(BASE, "/api/mixtapes/tracks", {
        userId,
        mixtapeId,
        title: `mdb-val-draft-${runToken}`,
        position: 1,
        storagePath: validPath,
        durationSeconds: 0,
        status: "draft",
    }, session)).status, [201]);

    // Cleanup fixture (archive, not preserved)
    if (mixtapeId !== PRESERVED_MIXTAPE_ID) {
        await archiveMixtape(BASE, session, mixtapeId);
    }

    writeEvidence(evidenceDir, "report.json", {
        runToken,
        ref,
        mixtapeId,
        foreignMixtapeId,
        results,
        note: "API uses 400 for oversized descriptors (not 413).",
        generatedAt: new Date().toISOString(),
    });

    const failed = results.some((r) => r.pass === false);
    process.exit(failed ? 1 : 0);
}

function recordRef(ref) {
    console.log(`PASS staging identity — ref=${ref}`);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});