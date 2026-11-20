import {
    isQualifiedMixtapePlay,
    mixtapePlayQualificationThreshold,
} from "./mixtape-play-threshold.shared.mjs";

/** Mirrors SQL mixtape_playback_session_max_tick_seconds (max wall clock per advance). */
export const MIXTAPE_PLAYBACK_SESSION_MAX_TICK_SECONDS = 30;

/**
 * @param {{ status: string, moderationState?: string, durationSeconds?: number | null }} track
 * @param {{ status: string, moderationState?: string }} mixtape
 */
export function canBeginPublishedPlaybackSession(track, mixtape) {
    if (track.status !== "published" || track.moderationState !== "clear") return false;
    if (mixtape.status !== "published" || mixtape.moderationState !== "clear") return false;
    const duration = Number(track.durationSeconds) || 0;
    return duration > 0;
}

/**
 * Credits only server-measured wall time since the previous accepted advance (not client hints).
 *
 * @param {number} currentSeconds
 * @param {number} durationSeconds
 * @param {number} wallElapsedSeconds
 */
export function creditServerMeasuredProgress(currentSeconds, durationSeconds, wallElapsedSeconds) {
    const duration = Math.max(0, Number(durationSeconds) || 0);
    const current = Math.max(0, Number(currentSeconds) || 0);
    const increment = Math.min(
        Math.max(0, Number(wallElapsedSeconds) || 0),
        MIXTAPE_PLAYBACK_SESSION_MAX_TICK_SECONDS,
    );
    return Math.min(current + increment, duration);
}

/**
 * @param {string} trackId
 * @param {string} userId
 * @param {string} playbackSessionId
 */
export function playbackDedupKey(trackId, userId, playbackSessionId) {
    return `${trackId}:${userId}:${playbackSessionId}`;
}

/**
 * In-memory model mirroring SQL engage/qualify rules for verification tests.
 */
export class MixtapePlaybackEngagementModel {
    constructor() {
        /** @type {Map<string, { trackId: string, userId: string, listenedSeconds: number, status: string, lastProgressAt: number }>} */
        this.sessions = new Map();
        /** @type {Set<string>} */
        this.qualifiedPlays = new Set();
        /** @type {Map<string, number>} */
        this.trackPlayCounts = new Map();
    }

    /**
     * @param {string} sessionId
     * @param {string} trackId
     * @param {string} userId
     * @param {number} [nowMs]
     */
    beginSession(sessionId, trackId, userId, nowMs = Date.now()) {
        this.sessions.set(sessionId, {
            trackId,
            userId,
            listenedSeconds: 0,
            status: "active",
            lastProgressAt: nowMs,
        });
    }

    /**
     * @param {string} sessionId
     * @param {string} callerUserId
     * @param {number} durationSeconds
     * @param {number} nowMs
     */
    advanceSession(sessionId, callerUserId, durationSeconds, nowMs) {
        const session = this.sessions.get(sessionId);
        if (!session || session.userId !== callerUserId || session.status !== "active") {
            return false;
        }
        const wallElapsed = (nowMs - session.lastProgressAt) / 1000;
        session.listenedSeconds = creditServerMeasuredProgress(
            session.listenedSeconds,
            durationSeconds,
            wallElapsed,
        );
        session.lastProgressAt = nowMs;
        return true;
    }

    /**
     * @param {string} sessionId
     * @param {string} callerUserId
     * @param {number} durationSeconds
     * @returns {{ accepted: boolean, reason?: string }}
     */
    recordQualifiedPlay(sessionId, callerUserId, durationSeconds) {
        const session = this.sessions.get(sessionId);
        if (!session) return { accepted: false, reason: "missing_session" };
        if (session.userId !== callerUserId) {
            return { accepted: false, reason: "unauthorized_listener" };
        }
        if (session.status === "qualified") {
            return { accepted: false, reason: "duplicate_session" };
        }
        if (durationSeconds <= 0) {
            return { accepted: false, reason: "invalid_duration" };
        }
        const effective = Math.min(session.listenedSeconds, durationSeconds);
        if (!isQualifiedMixtapePlay(durationSeconds, effective)) {
            return { accepted: false, reason: "below_threshold" };
        }

        const key = playbackDedupKey(session.trackId, session.userId, sessionId);
        if (this.qualifiedPlays.has(key)) {
            return { accepted: false, reason: "duplicate_session" };
        }

        session.status = "qualified";
        this.qualifiedPlays.add(key);
        this.trackPlayCounts.set(
            session.trackId,
            (this.trackPlayCounts.get(session.trackId) || 0) + 1,
        );
        return { accepted: true };
    }
}

export { isQualifiedMixtapePlay, mixtapePlayQualificationThreshold };