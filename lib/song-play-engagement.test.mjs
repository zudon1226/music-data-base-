import assert from "node:assert/strict";
import {
    SongPlayEngagementModel,
    songPlayDedupKey,
} from "./song-play-engagement.shared.mjs";

const SONG_ID = "497b9cfd-e752-4060-9528-5134a2ff7f37";
const LISTENER = "user:0148b237-02e4-4fb9-ab28-3dabfd21e715";
const SESSION_A = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
const SESSION_B = "b2c3d4e5-f6a7-8901-bcde-f12345678901";

function testSuccessfulPlay() {
    const model = new SongPlayEngagementModel();
    const result = model.recordQualifiedPlay({
        songId: SONG_ID,
        listenerKey: LISTENER,
        playbackSessionId: SESSION_A,
        event: "qualified_start",
    });
    assert.equal(result.accepted, true);
    assert.equal(result.plays, 1);
}

function testInvalidSongId() {
    const model = new SongPlayEngagementModel();
    const result = model.recordQualifiedPlay({
        songId: "",
        listenerKey: LISTENER,
        playbackSessionId: SESSION_A,
        event: "qualified_start",
    });
    assert.equal(result.accepted, false);
    assert.equal(result.reason, "missing_song_id");
}

function testMalformedEvent() {
    const model = new SongPlayEngagementModel();
    const result = model.recordQualifiedPlay({
        songId: SONG_ID,
        listenerKey: LISTENER,
        playbackSessionId: SESSION_A,
        event: "failed_start",
    });
    assert.equal(result.accepted, false);
    assert.equal(result.reason, "invalid_event");
}

function testDuplicateSession() {
    const model = new SongPlayEngagementModel();
    assert.equal(
        model.recordQualifiedPlay({
            songId: SONG_ID,
            listenerKey: LISTENER,
            playbackSessionId: SESSION_A,
            event: "qualified_start",
        }).accepted,
        true,
    );
    const second = model.recordQualifiedPlay({
        songId: SONG_ID,
        listenerKey: LISTENER,
        playbackSessionId: SESSION_A,
        event: "qualified_start",
    });
    assert.equal(second.accepted, false);
    assert.equal(second.reason, "duplicate_session");
    assert.equal(model.trackPlayCounts.get(SONG_ID), 1);
}

function testNewSessionCountsAgain() {
    const model = new SongPlayEngagementModel();
    model.recordQualifiedPlay({
        songId: SONG_ID,
        listenerKey: LISTENER,
        playbackSessionId: SESSION_A,
        event: "qualified_start",
        now: 1_000,
    });
    const next = model.recordQualifiedPlay({
        songId: SONG_ID,
        listenerKey: LISTENER,
        playbackSessionId: SESSION_B,
        event: "qualified_start",
        now: 50_000,
    });
    assert.equal(next.accepted, true);
    assert.equal(model.trackPlayCounts.get(SONG_ID), 2);
}

function testDedupKeyStable() {
    assert.equal(
        songPlayDedupKey(SONG_ID, LISTENER, SESSION_A),
        `${SONG_ID}::${LISTENER}::${SESSION_A}`,
    );
}

testSuccessfulPlay();
testInvalidSongId();
testMalformedEvent();
testDuplicateSession();
testNewSessionCountsAgain();
testDedupKeyStable();
console.log("song-play-engagement.test.mjs PASS");