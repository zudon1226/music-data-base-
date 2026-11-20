import assert from "node:assert/strict";
import {
    MixtapePlaybackEngagementModel,
    MIXTAPE_PLAYBACK_SESSION_MAX_TICK_SECONDS,
    creditServerMeasuredProgress,
    canBeginPublishedPlaybackSession,
    playbackDedupKey,
} from "./mixtape-playback-engagement.shared.mjs";
import { mixtapePlayQualificationThreshold } from "./mixtape-play-threshold.shared.mjs";

const T0 = 1_700_000_000_000;

function qualifySession(model, sessionId, userId, durationSeconds) {
    const threshold = mixtapePlayQualificationThreshold(durationSeconds);
    let now = T0;
    const session = model.sessions.get(sessionId);
    if (!session) throw new Error("missing session");
    while (session.listenedSeconds < threshold) {
        now += MIXTAPE_PLAYBACK_SESSION_MAX_TICK_SECONDS * 1000;
        model.advanceSession(sessionId, userId, durationSeconds, now);
    }
}

function testUnpublishedContentProtection() {
    assert.equal(
        canBeginPublishedPlaybackSession(
            { status: "draft", moderationState: "clear", durationSeconds: 120 },
            { status: "published", moderationState: "clear" },
        ),
        false,
    );
    assert.equal(
        canBeginPublishedPlaybackSession(
            { status: "published", moderationState: "clear", durationSeconds: 0 },
            { status: "published", moderationState: "clear" },
        ),
        false,
    );
}

function testInvalidDurationRejection() {
    const model = new MixtapePlaybackEngagementModel();
    model.beginSession("s1", "track-a", "user-a", T0);
    const result = model.recordQualifiedPlay("s1", "user-a", 0);
    assert.equal(result.accepted, false);
    assert.equal(result.reason, "invalid_duration");
}

function testUnauthorizedListenerRejection() {
    const model = new MixtapePlaybackEngagementModel();
    model.beginSession("s1", "track-a", "user-a", T0);
    qualifySession(model, "s1", "user-a", 120);
    const result = model.recordQualifiedPlay("s1", "user-b", 120);
    assert.equal(result.accepted, false);
    assert.equal(result.reason, "unauthorized_listener");
}

function testSameSessionDuplicateRejection() {
    const model = new MixtapePlaybackEngagementModel();
    model.beginSession("s1", "track-a", "user-a", T0);
    qualifySession(model, "s1", "user-a", 120);
    const first = model.recordQualifiedPlay("s1", "user-a", 120);
    const second = model.recordQualifiedPlay("s1", "user-a", 120);
    assert.equal(first.accepted, true);
    assert.equal(second.accepted, false);
    assert.equal(second.reason, "duplicate_session");
    assert.equal(model.trackPlayCounts.get("track-a"), 1);
}

function testNewSessionLegitimatePlayAcceptance() {
    const model = new MixtapePlaybackEngagementModel();
    model.beginSession("s1", "track-a", "user-a", T0);
    model.beginSession("s2", "track-a", "user-a", T0);
    qualifySession(model, "s1", "user-a", 120);
    qualifySession(model, "s2", "user-a", 120);
    assert.equal(model.recordQualifiedPlay("s1", "user-a", 120).accepted, true);
    assert.equal(model.recordQualifiedPlay("s2", "user-a", 120).accepted, true);
    assert.equal(model.trackPlayCounts.get("track-a"), 2);
    assert.notEqual(
        playbackDedupKey("track-a", "user-a", "s1"),
        playbackDedupKey("track-a", "user-a", "s2"),
    );
}

function testConcurrentDuplicateRequests() {
    const model = new MixtapePlaybackEngagementModel();
    model.beginSession("s1", "track-a", "user-a", T0);
    qualifySession(model, "s1", "user-a", 60);
    const key = playbackDedupKey("track-a", "user-a", "s1");
    const first = model.recordQualifiedPlay("s1", "user-a", 60);
    const raced = (() => {
        if (model.qualifiedPlays.has(key)) {
            return { accepted: false, reason: "duplicate_session" };
        }
        return model.recordQualifiedPlay("s1", "user-a", 60);
    })();
    assert.equal(first.accepted, true);
    assert.equal(raced.accepted, false);
    assert.equal(model.trackPlayCounts.get("track-a"), 1);
}

function testRapidRepeatedAdvancesDoNotManufactureTime() {
    const model = new MixtapePlaybackEngagementModel();
    model.beginSession("s1", "track-a", "user-a", T0);
    const duration = 120;
  for (let i = 0; i < 50; i += 1) {
    model.advanceSession("s1", "user-a", duration, T0);
  }
    const session = model.sessions.get("s1");
    assert.ok(session);
    assert.equal(session.listenedSeconds, 0);
}

function testServerMeasuredWallClockCredit() {
    const duration = 20;
    const threshold = mixtapePlayQualificationThreshold(duration);
    let listened = 0;
    let last = 0;
    listened = creditServerMeasuredProgress(listened, duration, 5);
    last = 5;
    assert.equal(listened, 5);
    listened = creditServerMeasuredProgress(listened, duration, 999);
    assert.equal(listened, Math.min(last + MIXTAPE_PLAYBACK_SESSION_MAX_TICK_SECONDS, duration));
    assert.ok(listened >= threshold);
}

testUnpublishedContentProtection();
testInvalidDurationRejection();
testUnauthorizedListenerRejection();
testSameSessionDuplicateRejection();
testNewSessionLegitimatePlayAcceptance();
testConcurrentDuplicateRequests();
testRapidRepeatedAdvancesDoNotManufactureTime();
testServerMeasuredWallClockCredit();

console.log("mixtape-playback-engagement.test.mjs: ok");