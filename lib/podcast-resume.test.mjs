/**
 * Guest Continue listening + resume progress helpers.
 * Run: node lib/podcast-resume.test.mjs
 */
import assert from "node:assert/strict";
import {
    isEligiblePodcastResume,
    podcastResumeStartSeconds,
    sanitizePodcastResumeProgressList,
    selectContinueListeningPodcasts,
} from "./podcast-resume.shared.mjs";

const EPISODE_A = "4fa0ac8d-999f-4b30-be7b-2a4841f52872";
const EPISODE_B = "65da7c00-89e5-4f9d-a04a-ea2062c18293";

const publishedEpisodes = [
    {
        id: EPISODE_A,
        podcastId: "3624d901-e787-4421-9600-b350155a7f43",
        title: "Audio Episode",
        status: "published",
        episodeType: "audio",
        durationSeconds: 120,
    },
    {
        id: EPISODE_B,
        podcastId: "3624d901-e787-4421-9600-b350155a7f43",
        title: "Video Episode",
        status: "published",
        episodeType: "video",
        durationSeconds: 90,
    },
];

// Guest with saved local progress sees Continue listening.
const guestItems = selectContinueListeningPodcasts({
    progress: [{
        episodeId: EPISODE_A,
        position: 42,
        duration: 120,
        playedAt: "2026-11-18T20:00:00.000Z",
    }],
    publishedEpisodes,
});
assert.equal(guestItems.length, 1);
assert.equal(guestItems[0].episode.id, EPISODE_A);
assert.equal(guestItems[0].position, 42);

// No history → empty Continue listening.
assert.deepEqual(selectContinueListeningPodcasts({
    progress: [],
    publishedEpisodes,
}), []);

// Resume position restored via eligibility rules.
const resume = podcastResumeStartSeconds({
    episodeId: EPISODE_B,
    position: 30,
    duration: 90,
});
assert.equal(resume, 30);
assert.ok(isEligiblePodcastResume({ episodeId: EPISODE_B, position: 30, duration: 90 }));

// Malformed / stale local data does not throw.
assert.deepEqual(sanitizePodcastResumeProgressList(null), []);
assert.deepEqual(sanitizePodcastResumeProgressList([{ episodeId: "not-uuid", position: 99 }]), []);
assert.deepEqual(
    sanitizePodcastResumeProgressList([
        { episodeId: EPISODE_A, position: "bad", playedAt: "2026-11-18T19:00:00.000Z" },
        { episodeId: EPISODE_A, position: 55, playedAt: "2026-11-18T21:00:00.000Z" },
    ]),
    [{ episodeId: EPISODE_A, position: 55, duration: undefined, completed: false, playedAt: "2026-11-18T21:00:00.000Z" }],
);

// Signed-in path uses the same selector (unchanged merge semantics).
const signedInItems = selectContinueListeningPodcasts({
    progress: [
        { episodeId: EPISODE_B, position: 18, duration: 90, playedAt: "2026-11-18T22:00:00.000Z" },
        { episodeId: EPISODE_A, position: 12, duration: 120, playedAt: "2026-11-18T23:00:00.000Z" },
    ],
    publishedEpisodes,
    limit: 2,
});
assert.equal(signedInItems.length, 2);
assert.equal(signedInItems[0].episode.id, EPISODE_A);

// Draft episodes in catalog are excluded even with local progress.
const draftOnly = selectContinueListeningPodcasts({
    progress: [{ episodeId: EPISODE_A, position: 40, duration: 120 }],
    publishedEpisodes: [{ ...publishedEpisodes[0], status: "draft" }],
});
assert.equal(draftOnly.length, 0);

console.log("podcast-resume.test.mjs: ok");