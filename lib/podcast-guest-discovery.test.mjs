/**
 * Guest podcast discovery tab visibility.
 * Run: node lib/podcast-guest-discovery.test.mjs
 */
import assert from "node:assert/strict";
import {
    ALL_PODCAST_DISCOVERY_SECTION_IDS,
    coercePodcastDiscoverySectionForUser,
    visiblePodcastDiscoverySectionIds,
} from "./podcast-guest-discovery.shared.mjs";

assert.deepEqual(ALL_PODCAST_DISCOVERY_SECTION_IDS, ["discover", "saved", "following", "liked"]);

assert.deepEqual(visiblePodcastDiscoverySectionIds(""), ["discover"]);
assert.deepEqual(visiblePodcastDiscoverySectionIds(null), ["discover"]);
assert.deepEqual(visiblePodcastDiscoverySectionIds(undefined), ["discover"]);
assert.deepEqual(visiblePodcastDiscoverySectionIds("user-1"), ALL_PODCAST_DISCOVERY_SECTION_IDS);

assert.equal(coercePodcastDiscoverySectionForUser("", "liked"), "discover");
assert.equal(coercePodcastDiscoverySectionForUser("user-1", "liked"), "liked");

console.log("podcast-guest-discovery.test.mjs: ok");