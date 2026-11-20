/**
 * Anonymous public podcast listener path and view rules.
 * Run: node lib/public-podcast-listener.test.mjs
 */
import assert from "node:assert/strict";
import {
    ANONYMOUS_PUBLIC_PODCAST_LISTENER_VIEWS,
    ANONYMOUS_PUBLIC_PODCAST_LOGIN_QUERY,
    buildAnonymousPublicPodcastLoginHubUrl,
    isAnonymousPublicPodcastListenerPath,
    isAnonymousPublicPodcastListenerView,
    isAnonymousPublicPodcastLoginIntentPath,
    isPublicPodcastDiscoveryPath,
    normalizeAppPathname,
} from "./public-podcast-listener.ts";

const SHOW_ID = "3624d901-e787-4421-9600-b350155a7f43";
const EPISODE_ID = "4fa0ac8d-999f-4b30-be7b-2a4841f52872";

assert.equal(normalizeAppPathname("/podcast/"), "/podcast");
assert.equal(normalizeAppPathname(""), "/");

assert.ok(isPublicPodcastDiscoveryPath("/podcast"));
assert.ok(isPublicPodcastDiscoveryPath("/podcast/"));
assert.ok(!isPublicPodcastDiscoveryPath(`/podcast/${SHOW_ID}`));

assert.ok(isAnonymousPublicPodcastListenerPath("/podcast"));
assert.ok(isAnonymousPublicPodcastListenerPath(`/podcast/${SHOW_ID}`));
assert.ok(isAnonymousPublicPodcastListenerPath(`/podcast/episode/${EPISODE_ID}`));
assert.ok(!isAnonymousPublicPodcastListenerPath("/"));
assert.ok(!isAnonymousPublicPodcastListenerPath("/marketplace"));
assert.ok(!isAnonymousPublicPodcastListenerPath("/podcast/not-a-uuid"));
assert.ok(!isAnonymousPublicPodcastListenerPath("/podcast/episode"));

for (const view of ANONYMOUS_PUBLIC_PODCAST_LISTENER_VIEWS) {
    assert.ok(isAnonymousPublicPodcastListenerView(view), `expected listener view: ${view}`);
}
assert.ok(!isAnonymousPublicPodcastListenerView("Home"));
assert.ok(!isAnonymousPublicPodcastListenerView("Podcast Studio"));
assert.ok(!isAnonymousPublicPodcastListenerView("Marketplace"));

assert.equal(buildAnonymousPublicPodcastLoginHubUrl(), `/?${ANONYMOUS_PUBLIC_PODCAST_LOGIN_QUERY}=1`);
assert.ok(isAnonymousPublicPodcastLoginIntentPath("/", `?${ANONYMOUS_PUBLIC_PODCAST_LOGIN_QUERY}=1`));
assert.ok(!isAnonymousPublicPodcastLoginIntentPath("/podcast", `?${ANONYMOUS_PUBLIC_PODCAST_LOGIN_QUERY}=1`));
assert.ok(!isAnonymousPublicPodcastLoginIntentPath("/", ""));

console.log("public-podcast-listener.test.mjs: ok");