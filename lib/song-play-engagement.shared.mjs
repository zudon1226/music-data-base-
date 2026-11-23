/**
 * Server-side music play qualification and deduplication (shared with tests).
 */

export const SONG_PLAY_MIN_INTERVAL_MS = 45_000;
export const SONG_PLAY_SESSION_MAX_AGE_MS = 6 * 60 * 60 * 1000;

export function songPlayDedupKey(songId, listenerKey, playbackSessionId) {
    return `${songId}::${listenerKey}::${playbackSessionId}`;
}

export function songPlayThrottleKey(songId, listenerKey) {
    return `${songId}::${listenerKey}`;
}

function nowMs(input) {
    return Number.isFinite(input) ? input : Date.now();
}

export class SongPlayEngagementModel {
    constructor() {
        /** @type {Map<string, { acceptedAt: number, songId: string, listenerKey: string, sessionId: string }>} */
        this.sessions = new Map();
        /** @type {Map<string, number>} */
        this.lastAcceptedAt = new Map();
        /** @type {Map<string, number>} */
        this.trackPlayCounts = new Map();
    }

    /**
     * @param {{ songId: string, listenerKey: string, playbackSessionId: string, event: string, now?: number }} input
     */
    recordQualifiedPlay(input) {
        const songId = String(input.songId || "").trim();
        const listenerKey = String(input.listenerKey || "").trim();
        const playbackSessionId = String(input.playbackSessionId || "").trim();
        const event = String(input.event || "").trim();
        const now = nowMs(input.now);

        if (!songId) {
            return { accepted: false, reason: "missing_song_id", plays: null };
        }
        if (!listenerKey) {
            return { accepted: false, reason: "missing_listener_key", plays: null };
        }
        if (!playbackSessionId) {
            return { accepted: false, reason: "missing_session_id", plays: null };
        }
        if (event !== "qualified_start") {
            return { accepted: false, reason: "invalid_event", plays: null };
        }

        this.pruneStale(now);

        const sessionKey = songPlayDedupKey(songId, listenerKey, playbackSessionId);
        if (this.sessions.has(sessionKey)) {
            const plays = this.trackPlayCounts.get(songId) ?? 0;
            return { accepted: false, reason: "duplicate_session", duplicate: true, plays };
        }

        const throttleKey = songPlayThrottleKey(songId, listenerKey);
        const lastAt = this.lastAcceptedAt.get(throttleKey) ?? 0;
        if (lastAt && now - lastAt < SONG_PLAY_MIN_INTERVAL_MS) {
            const plays = this.trackPlayCounts.get(songId) ?? 0;
            return { accepted: false, reason: "throttled", duplicate: true, plays };
        }

        this.sessions.set(sessionKey, { acceptedAt: now, songId, listenerKey, sessionId: playbackSessionId });
        this.lastAcceptedAt.set(throttleKey, now);
        const nextPlays = (this.trackPlayCounts.get(songId) ?? 0) + 1;
        this.trackPlayCounts.set(songId, nextPlays);
        return { accepted: true, reason: "accepted", plays: nextPlays };
    }

    pruneStale(now = Date.now()) {
        for (const [key, entry] of this.sessions.entries()) {
            if (now - entry.acceptedAt > SONG_PLAY_SESSION_MAX_AGE_MS) {
                this.sessions.delete(key);
            }
        }
        for (const [key, acceptedAt] of this.lastAcceptedAt.entries()) {
            if (now - acceptedAt > SONG_PLAY_SESSION_MAX_AGE_MS) {
                this.lastAcceptedAt.delete(key);
            }
        }
    }
}

/** Process-local singleton for API route dedup (best-effort on serverless). */
export const songPlayEngagementModel = new SongPlayEngagementModel();