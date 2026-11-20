/** @typedef {"discover" | "saved" | "following" | "liked"} PodcastDiscoverySectionId */

/** @type {readonly PodcastDiscoverySectionId[]} */
export const ALL_PODCAST_DISCOVERY_SECTION_IDS = Object.freeze([
    "discover",
    "saved",
    "following",
    "liked",
]);

/**
 * Signed-out visitors browse Discover only; signed-in users keep all library tabs.
 * @param {string | undefined | null} userId
 * @returns {readonly PodcastDiscoverySectionId[]}
 */
export function visiblePodcastDiscoverySectionIds(userId) {
    if (userId) {
        return ALL_PODCAST_DISCOVERY_SECTION_IDS;
    }
    return Object.freeze(["discover"]);
}

/**
 * @param {string | undefined | null} userId
 * @param {PodcastDiscoverySectionId} section
 * @returns {PodcastDiscoverySectionId}
 */
export function coercePodcastDiscoverySectionForUser(userId, section) {
    if (userId) {
        return section;
    }
    return "discover";
}