import { createHash } from "node:crypto";
import { songAllowsStreaming } from "@/lib/song-usage-permissions";
import { resolveRequestUserId } from "@/lib/request-auth";
import { getSupabaseServerClient, isUuid } from "@/lib/server-supabase";
import { recordDurableSongQualifiedPlay } from "@/lib/song-play-persistence";
import { songPlayEngagementModel } from "./song-play-engagement.shared.mjs";

export type SongPlayRequestBody = {
    playbackSessionId?: unknown;
    event?: unknown;
};

export function getListenerKeyFromRequest(request: Request, authenticatedUserId: string | null) {
    if (authenticatedUserId) {
        return `user:${authenticatedUserId}`;
    }
    const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "";
    const ip = forwarded || request.headers.get("x-real-ip")?.trim() || "unknown";
    const hash = createHash("sha256").update(ip).digest("hex").slice(0, 24);
    return `anon:${hash}`;
}

export function parseSongPlayRequestBody(body: Record<string, unknown>) {
    const playbackSessionId = String(body.playbackSessionId || "").trim();
    const event = String(body.event || "").trim();
    if (!playbackSessionId || !isUuid(playbackSessionId)) {
        return { ok: false as const, status: 400, error: "Valid playbackSessionId is required." };
    }
    if (event !== "qualified_start") {
        return { ok: false as const, status: 400, error: "Only qualified_start play events are accepted." };
    }
    return { ok: true as const, playbackSessionId, event };
}

async function recordSongPlayLegacyInMemory(
    request: Request,
    songId: string,
    parsedBody: { playbackSessionId: string; event: string },
    authUserId: string | null,
) {
    const listenerKey = getListenerKeyFromRequest(request, authUserId);
    const qualification = songPlayEngagementModel.recordQualifiedPlay({
        songId,
        listenerKey,
        playbackSessionId: parsedBody.playbackSessionId,
        event: parsedBody.event,
    });
    const supabase = getSupabaseServerClient();

    if (!qualification.accepted) {
        if (qualification.duplicate) {
            const { data: existing } = await supabase
                .from("songs")
                .select("plays")
                .eq("id", songId)
                .maybeSingle();
            const plays = Math.max(0, Number(existing?.plays) || 0);
            return {
                status: 200,
                body: {
                    ok: true,
                    duplicate: true,
                    reason: qualification.reason,
                    plays,
                },
            };
        }
        return {
            status: 400,
            body: {
                ok: false,
                duplicate: false,
                reason: qualification.reason,
            },
        };
    }

    const { data: song, error: readError } = await supabase
        .from("songs")
        .select("id,plays,user_id,streaming_enabled,ringtone_enabled")
        .eq("id", songId)
        .maybeSingle();

    if (readError) {
        return { status: 500, body: { error: "Could not load song." } };
    }
    if (!song) {
        return { status: 404, body: { error: "Song not found." } };
    }

    const isOwner = Boolean(authUserId && song.user_id === authUserId);
    const isPublic = songAllowsStreaming(song as Record<string, unknown>);
    if (!isPublic && !isOwner) {
        return { status: 403, body: { error: "This song is not available for public playback." } };
    }

    const currentPlays = Math.max(0, Number(song.plays) || 0);
    const nextPlays = currentPlays + 1;
    const { data: updated, error: updateError } = await supabase
        .from("songs")
        .update({ plays: nextPlays })
        .eq("id", songId)
        .select("plays")
        .maybeSingle();

    if (updateError || !updated) {
        return { status: 500, body: { error: "Could not persist play count." } };
    }

    return {
        status: 200,
        body: {
            ok: true,
            plays: Number(updated.plays) || nextPlays,
            songId,
        },
    };
}

export async function recordSongPlay(request: Request, songId: string) {
    if (!songId || !isUuid(songId)) {
        return { status: 400, body: { error: "Invalid song id." } };
    }

    const rawBody = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const parsedBody = parseSongPlayRequestBody(rawBody);
    if (!parsedBody.ok) {
        return { status: parsedBody.status, body: { error: parsedBody.error } };
    }

    const auth = await resolveRequestUserId(request);
    const listenerKey = getListenerKeyFromRequest(request, auth.userId || null);

    const durable = await recordDurableSongQualifiedPlay(
        songId,
        listenerKey,
        parsedBody.playbackSessionId,
    );

    if (!durable.ok) {
        if (durable.missingRpc) {
            return recordSongPlayLegacyInMemory(request, songId, parsedBody, auth.userId || null);
        }
        return { status: 500, body: { error: "Could not persist play count." } };
    }

    const result = durable.result;
    if (result.reason === "not_found") {
        return { status: 404, body: { error: "Song not found." } };
    }
    if (result.reason === "not_playable") {
        return { status: 403, body: { error: "This song is not available for public playback." } };
    }
    if (result.reason === "database_error") {
        return { status: 500, body: { error: "Could not persist play count." } };
    }
    if (!result.accepted) {
        if (result.duplicate) {
            return {
                status: 200,
                body: {
                    ok: true,
                    duplicate: true,
                    reason: result.reason,
                    plays: Math.max(0, Number(result.plays) || 0),
                },
            };
        }
        return {
            status: 400,
            body: { ok: false, duplicate: false, reason: result.reason },
        };
    }

    return {
        status: 200,
        body: {
            ok: true,
            plays: Math.max(0, Number(result.plays) || 0),
            songId,
        },
    };
}