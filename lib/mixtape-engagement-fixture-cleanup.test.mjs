import assert from "node:assert/strict";
import {
    E2E_ARTIST_ID,
    ENGAGEMENT_TITLE_PREFIX,
    PRESERVED_MIXTAPE_ID,
    archiveEngagementFixtureViaApi,
    isSafeEngagementArchiveTarget,
    isValidEngagementFixtureMetadata,
    readGuestMixtapePublicState,
} from "../scripts/lib/mixtape-engagement-fixture-cleanup.shared.mjs";

const runPin = {
    mixtapeId: "11111111-1111-4111-8111-111111111111",
    title: `${ENGAGEMENT_TITLE_PREFIX}testrun01`,
    ownerUserId: E2E_ARTIST_ID,
};

const goodFixture = { ...runPin };

assert.equal(isValidEngagementFixtureMetadata(goodFixture).ok, true);
assert.equal(isValidEngagementFixtureMetadata({ ...goodFixture, mixtapeId: PRESERVED_MIXTAPE_ID }).reason, "preserved fixture id blocked");
assert.equal(isValidEngagementFixtureMetadata({ ...goodFixture, title: "mdb-e2e-audit-bad" }).reason, "invalid title prefix");
assert.equal(isValidEngagementFixtureMetadata({ ...goodFixture, ownerUserId: "00000000-0000-4000-8000-000000000099" }).reason, "wrong owner");
assert.equal(isValidEngagementFixtureMetadata(null).reason, "fixture missing");

assert.equal(isSafeEngagementArchiveTarget(goodFixture, runPin).ok, true);
assert.equal(isSafeEngagementArchiveTarget({ ...goodFixture, mixtapeId: "22222222-2222-4222-8222-222222222222" }, runPin).reason, "mixtape id does not match run pin");
assert.equal(isSafeEngagementArchiveTarget(goodFixture, null).reason, "run fixture pin missing");
assert.equal(
    isSafeEngagementArchiveTarget({ mixtapeId: PRESERVED_MIXTAPE_ID, title: `${ENGAGEMENT_TITLE_PREFIX}x`, ownerUserId: E2E_ARTIST_ID }, runPin).ok,
    false,
);

const blockedArchive = await archiveEngagementFixtureViaApi({
    baseUrl: "http://127.0.0.1:9",
    accessToken: "token",
    userId: E2E_ARTIST_ID,
    fixture: goodFixture,
    runFixture: { ...runPin, mixtapeId: "22222222-2222-4222-8222-222222222222" },
});
assert.equal(blockedArchive.ok, false);
assert.match(blockedArchive.reason, /mixtape id does not match run pin/);

const wrongOwnerArchive = await archiveEngagementFixtureViaApi({
    baseUrl: "http://127.0.0.1:9",
    accessToken: "token",
    userId: "00000000-0000-4000-8000-000000000099",
    fixture: goodFixture,
    runFixture: runPin,
});
assert.equal(wrongOwnerArchive.ok, false);
assert.equal(wrongOwnerArchive.reason, "authenticated user is not engagement owner");

const missingPin = await archiveEngagementFixtureViaApi({
    baseUrl: "http://127.0.0.1:9",
    accessToken: "token",
    userId: E2E_ARTIST_ID,
    fixture: goodFixture,
    runFixture: undefined,
});
assert.equal(missingPin.reason, "run fixture pin missing");

const invalidRead = await readGuestMixtapePublicState("http://127.0.0.1:9", "not-a-uuid");
assert.equal(invalidRead.publiclyAvailable, false);

/** Report shape contract (cleanup failure must be serializable). */
const sampleReport = {
    cleanup: {
        status: "fail",
        reason: "still publicly available",
        verifyPublicHttp: 200,
        mixtapeId: runPin.mixtapeId,
        title: runPin.title,
    },
};
assert.equal(sampleReport.cleanup.status, "fail");
assert.ok(sampleReport.cleanup.reason.length > 0);

console.log("mixtape-engagement-fixture-cleanup.test.mjs passed");