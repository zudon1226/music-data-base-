import { getSupabaseServerClient } from "@/lib/server-supabase";

export type DurableSongPlayResult = {
    accepted: boolean;
    duplicate: boolean;
    reason: string;
    plays: number | null;
};

function parseRpcRow(data: unknown): DurableSongPlayResult | null {
    if (!data || typeof data !== "object") return null;
    const row = data as Record<string, unknown>;
    return {
        accepted: row.accepted === true,
        duplicate: row.duplicate === true,
        reason: String(row.reason || ""),
        plays: row.plays === null || row.plays === undefined ? null : Number(row.plays),
    };
}

export function isMissingSongPlayRpcError(message: string) {
    const lower = message.toLowerCase();
    return (
        lower.includes("record_song_qualified_play")
        && (lower.includes("does not exist") || lower.includes("could not find") || lower.includes("404"))
    );
}

export async function recordDurableSongQualifiedPlay(
    songId: string,
    listenerKey: string,
    playbackSessionId: string,
): Promise<{ ok: true; result: DurableSongPlayResult } | { ok: false; error: string; missingRpc?: boolean }> {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase.rpc("record_song_qualified_play", {
        p_song_id: songId,
        p_listener_key: listenerKey,
        p_playback_session_id: playbackSessionId,
    });

    if (error) {
        const message = error.message || "Play persistence failed.";
        return {
            ok: false,
            error: message,
            missingRpc: isMissingSongPlayRpcError(message),
        };
    }

    const parsed = parseRpcRow(data);
    if (!parsed) {
        return { ok: false, error: "Play persistence returned an invalid payload." };
    }

    return { ok: true, result: parsed };
}