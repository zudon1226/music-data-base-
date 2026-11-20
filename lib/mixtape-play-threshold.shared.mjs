/**
 * Mixtape qualified play threshold (mirrors SQL mixtape_play_qualification_threshold).
 * Count after 30s, or exactly 25% of duration when track is shorter than 30 seconds (no 1s floor).
 */
export const MIXTAPE_MIN_PLAY_SECONDS = 30;
export const MIXTAPE_SHORT_TRACK_RATIO = 0.25;

/**
 * @param {number | null | undefined} durationSeconds
 * @returns {number}
 */
export function mixtapePlayQualificationThreshold(durationSeconds) {
    const duration = Math.max(0, Number(durationSeconds) || 0);
    if (duration <= 0) {
        return MIXTAPE_MIN_PLAY_SECONDS;
    }
    if (duration < MIXTAPE_MIN_PLAY_SECONDS) {
        return MIXTAPE_SHORT_TRACK_RATIO * duration;
    }
    return MIXTAPE_MIN_PLAY_SECONDS;
}

/**
 * @param {number | null | undefined} durationSeconds
 * @param {number | null | undefined} listenedSeconds
 * @returns {boolean}
 */
export function isQualifiedMixtapePlay(durationSeconds, listenedSeconds) {
    const listened = Math.max(0, Number(listenedSeconds) || 0);
    return listened >= mixtapePlayQualificationThreshold(durationSeconds);
}