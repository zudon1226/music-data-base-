import { NextResponse } from "next/server";
import { isCatalogItemPubliclyPlayable } from "@/lib/moderation-status.mjs";
import { requireMixtapeOwner } from "@/lib/mixtape-access";
import { mapMixtapeRows, MIXTAPE_COLUMNS, MIXTAPE_TRACK_COLUMNS } from "@/lib/mixtape-data";
import { requireMixtapeRequestUser } from "@/lib/mixtape-route-auth";
import {
    MIXTAPE_BUCKET,
    validateMixtapeOwnedTrackStoragePath,
} from "@/lib/mixtape-validation";
import { getErrorMessage, getSupabaseServerClient, isUuid } from "@/lib/server-supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonResponse(body: Record<string, unknown>, status = 200) {
    return NextResponse.json(body, { status });
}

async function loadPublishedTrack(trackId: string) {
    const supabase = getSupabaseServerClient();
    const trackResult = await supabase
        .from("mixtape_tracks")
        .select(MIXTAPE_TRACK_COLUMNS)
        .eq("id", trackId)
        .maybeSingle();
    if (trackResult.error || !trackResult.data) {
        return { ok: false as const, error: "Mixtape track not found." };
    }
    const trackRow = trackResult.data as unknown as Record<string, unknown>;
    const mixtapeResult = await supabase
        .from("mixtapes")
        .select(MIXTAPE_COLUMNS)
        .eq("id", String(trackRow.mixtape_id))
        .maybeSingle();
    if (mixtapeResult.error || !mixtapeResult.data) {
        return { ok: false as const, error: "Mixtape not found." };
    }
    const mixtapeRow = mixtapeResult.data as unknown as Record<string, unknown>;
    const publicPlayback = trackRow.status === "published"
        && mixtapeRow.status === "published"
        && isCatalogItemPubliclyPlayable(trackRow)
        && isCatalogItemPubliclyPlayable(mixtapeRow);
    return { ok: true as const, trackRow, mixtapeRow, publicPlayback };
}

export async function POST(request: Request) {
    try {
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const action = String(body.action || body.mode || "signed-url").trim().toLowerCase();

        const auth = await requireMixtapeRequestUser(request, body, "/api/mixtapes/playback");
        if (!auth.ok) return jsonResponse({ error: auth.error }, auth.status);
        const callerUserId = auth.userId;
        const supabase = getSupabaseServerClient();

        if (action === "advance" || action === "heartbeat") {
            const playbackSessionId = String(body.playbackSessionId || body.playback_session_id || "").trim();
            if (!isUuid(playbackSessionId)) return jsonResponse({ error: "Invalid playback session id." }, 400);
            const { data: advanced, error } = await supabase.rpc("advance_mixtape_playback_session", {
                playback_session_id: playbackSessionId,
                caller_user_id: callerUserId,
            });
            if (error) return jsonResponse({ error: getErrorMessage(error) }, 500);
            return jsonResponse({ ok: true, advanced: Boolean(advanced) });
        }

        if (action === "qualify" || action === "qualified-play") {
            const playbackSessionId = String(body.playbackSessionId || body.playback_session_id || "").trim();
            if (!isUuid(playbackSessionId)) return jsonResponse({ error: "Invalid playback session id." }, 400);
            const { data: qualified, error } = await supabase.rpc("record_mixtape_qualified_play", {
                playback_session_id: playbackSessionId,
                caller_user_id: callerUserId,
            });
            if (error) return jsonResponse({ error: getErrorMessage(error) }, 500);
            return jsonResponse({ ok: true, qualified: Boolean(qualified) });
        }

        const trackId = String(body.trackId || body.track_id || "").trim();
        if (!isUuid(trackId)) return jsonResponse({ error: "Invalid mixtape track id." }, 400);
        const loaded = await loadPublishedTrack(trackId);
        if (!loaded.ok) return jsonResponse({ error: loaded.error }, 404);

        if (!loaded.publicPlayback) {
            const owner = await requireMixtapeOwner(auth.userId, loaded.trackRow.user_id);
            if (!owner.ok) return jsonResponse({ error: "Mixtape track not found." }, 404);
        }

        if (action === "begin-session" || action === "begin") {
            if (!loaded.publicPlayback) {
                return jsonResponse({ error: "Playback sessions are only available for published tracks." }, 409);
            }
            const { data: sessionId, error } = await supabase.rpc("begin_mixtape_playback_session", {
                target_track_id: trackId,
                caller_user_id: callerUserId,
            });
            if (error) return jsonResponse({ error: getErrorMessage(error) }, 500);
            if (!sessionId) return jsonResponse({ error: "Playback session could not be started." }, 409);
            return jsonResponse({ ok: true, playbackSessionId: sessionId });
        }

        const storagePath = String(loaded.trackRow.storage_path || "").trim();
        if (!storagePath) return jsonResponse({ error: "Mixtape track media is not ready." }, 409);
        const storageOwner = validateMixtapeOwnedTrackStoragePath(
            storagePath,
            String(loaded.trackRow.user_id || ""),
            String(loaded.trackRow.mixtape_id || ""),
        );
        if (!storageOwner.ok) {
            return jsonResponse({ error: "Mixtape track media path is invalid." }, 409);
        }
        const signed = await supabase.storage.from(MIXTAPE_BUCKET).createSignedUrl(storagePath, 60 * 60);
        if (signed.error || !signed.data?.signedUrl) {
            return jsonResponse({ error: "Mixtape playback URL could not be created." }, 500);
        }
        const mapped = await mapMixtapeRows({
            mixtapeRows: [loaded.mixtapeRow],
            trackRows: [loaded.trackRow],
        });
        const track = mapped.tracks[0];
        return jsonResponse({
            ok: true,
            signedUrl: signed.data.signedUrl,
            expiresIn: 3600,
            bucket: MIXTAPE_BUCKET,
            track: {
                ...track,
                mediaUrl: "",
                storagePath: "",
            },
        });
    }
    catch (error) {
        console.error("[api/mixtapes/playback] POST failed:", error);
        return jsonResponse({ error: getErrorMessage(error) }, 500);
    }
}