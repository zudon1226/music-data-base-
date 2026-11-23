import { NextResponse } from "next/server";
import { assertAuthorizedSourceSong, requireRingtoneStudioAccess } from "@/lib/ringtone-access";
import { resolveSongPlayableUrl } from "@/lib/desktop-media-queue";
import { resolveSongStoragePath, SONGS_BUCKET, normalizeSongStoragePath } from "@/lib/song-storage-path";
import { requireMatchingUserId } from "@/lib/request-auth";
import { getErrorMessage, getSupabaseServerClient, isUuid } from "@/lib/server-supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(body: Record<string, unknown>, status = 200) {
    return NextResponse.json(body, { status });
}

/**
 * Short-lived signed read URL for ringtone-studio clip preview on owned songs.
 * Avoids /api/audio which requires Authorization headers that HTMLAudioElement cannot send.
 */
export async function POST(request: Request) {
    try {
        const body = await request.json().catch(() => ({})) as Record<string, unknown>;
        const userId = String(body.userId || body.sessionUserId || "").trim();
        const songId = String(body.songId || "").trim();
        if (!userId || !isUuid(userId)) return json({ error: "userId is required." }, 400);
        if (!songId || !isUuid(songId)) return json({ error: "songId is required." }, 400);

        const auth = await requireMatchingUserId(request, "/api/ringtones/source-songs/play-url", userId);
        if (!auth.ok) return json({ error: auth.error }, auth.status);
        const studio = await requireRingtoneStudioAccess(userId);
        if (!studio.ok) return json({ error: studio.error }, studio.status);

        const ownership = await assertAuthorizedSourceSong({
            userId,
            songId,
            isPersonal: body.personal === true,
        });
        if (!ownership.ok) {
            return json({ error: ownership.error, code: ownership.code || "SOURCE_NOT_AUTHORIZED" }, 403);
        }

        const supabase = getSupabaseServerClient();
        const { data, error } = await supabase
            .from("songs")
            .select("id,storage_path,audio_url")
            .eq("id", songId)
            .maybeSingle();
        if (error) return json({ error: getErrorMessage(error) }, 500);
        if (!data) return json({ error: "Song not found.", code: "SOURCE_NOT_FOUND" }, 404);

        const resolved = resolveSongPlayableUrl(data as Record<string, unknown>);
        const storagePath = normalizeSongStoragePath(
            resolved.storagePath || resolveSongStoragePath(data.storage_path, data.audio_url),
        );
        if (!storagePath) {
            return json({ error: "Source song has no storage path.", code: "SOURCE_MISSING" }, 400);
        }

        const signed = await supabase.storage.from(SONGS_BUCKET).createSignedUrl(storagePath, 300);
        if (signed.error || !signed.data?.signedUrl) {
            return json({ error: getErrorMessage(signed.error || "Signed URL failed.") }, 500);
        }

        return json({
            songId,
            storagePath,
            signedUrl: signed.data.signedUrl,
            expiresInSeconds: 300,
        });
    } catch (error) {
        console.error("[api/ringtones/source-songs/play-url] POST failed:", error);
        return json({ error: getErrorMessage(error) }, 500);
    }
}