export type SongPlayRecordResult = {
    ok: boolean;
    plays?: number;
    duplicate?: boolean;
};

export async function recordQualifiedSongPlay(songId: string, playbackSessionId: string): Promise<SongPlayRecordResult> {
    if (!songId || !playbackSessionId) {
        return { ok: false };
    }
    try {
        const response = await fetch(`/api/songs/${encodeURIComponent(songId)}/play`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                playbackSessionId,
                event: "qualified_start",
            }),
        });
        const data = (await response.json().catch(() => ({}))) as {
            ok?: boolean;
            plays?: number;
            duplicate?: boolean;
        };
        if (!response.ok && !data.duplicate) {
            return { ok: false };
        }
        return {
            ok: Boolean(data.ok),
            plays: typeof data.plays === "number" ? data.plays : undefined,
            duplicate: Boolean(data.duplicate),
        };
    }
    catch {
        return { ok: false };
    }
}

export function createSongPlaybackSessionId() {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
    }
    return `play-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}