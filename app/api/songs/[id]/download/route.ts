import { NextResponse } from "next/server";
import {
    authorizeMediaDownload,
    isDownloadEnabledFlag,
    recordMediaDownloadEvent,
} from "@/lib/media-download-auth";
import {
    buildMediaContentDisposition,
    buildMediaDownloadFilename,
    extensionFromStoragePath,
    mimeTypeForMediaExtension,
} from "@/lib/media-download-filename";
import { ACCESS_TOKEN_BODY_KEYS, getRecordString, requireMatchingUserId } from "@/lib/request-auth";
import { resolveSongStoragePath, SONGS_BUCKET } from "@/lib/song-storage-path";
import { getErrorMessage, getSupabaseServerClient, isUuid } from "@/lib/server-supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(body: Record<string, unknown>, status = 200) {
    return NextResponse.json(body, { status });
}

type Params = { params: Promise<{ id: string }> };

type SongDownloadRow = {
    id: string;
    title: string | null;
    user_id: string | null;
    storage_path: string | null;
    audio_url: string | null;
    download_enabled?: boolean | null;
};

/**
 * Paid-listener / owner / admin song download.
 * Streams one audio attachment after server-side entitlement checks.
 * Never returns permanent public storage URLs.
 */
export async function POST(request: Request, context: Params) {
    try {
        const { id: songId } = await context.params;
        if (!isUuid(songId)) return json({ error: "Invalid song id.", code: "INVALID_ID" }, 400);

        const body = await request.json().catch(() => ({})) as Record<string, unknown>;
        const userId = String(body.userId || body.sessionUserId || "").trim();
        if (!userId || !isUuid(userId)) {
            return json({ error: "Authentication is required.", code: "AUTH_REQUIRED" }, 401);
        }

        const accessToken = getRecordString(body, ACCESS_TOKEN_BODY_KEYS);
        const auth = await requireMatchingUserId(request, "/api/songs/[id]/download", userId, { accessToken });
        if (!auth.ok) return json({ error: auth.error, code: "AUTH_REQUIRED" }, auth.status);

        const supabase = getSupabaseServerClient();
        let song: SongDownloadRow | null = null;

        const songResult = await supabase
            .from("songs")
            .select("id,title,user_id,storage_path,audio_url,download_enabled")
            .eq("id", songId)
            .maybeSingle();

        if (songResult.error) {
            const missingColumn = /download_enabled/i.test(getErrorMessage(songResult.error));
            if (!missingColumn) return json({ error: getErrorMessage(songResult.error) }, 500);
            const fallback = await supabase
                .from("songs")
                .select("id,title,user_id,storage_path,audio_url")
                .eq("id", songId)
                .maybeSingle();
            if (fallback.error) return json({ error: getErrorMessage(fallback.error) }, 500);
            if (!fallback.data) return json({ error: "Song not found.", code: "NOT_FOUND" }, 404);
            song = { ...fallback.data, download_enabled: true };
        } else {
            song = songResult.data as SongDownloadRow | null;
        }

        if (!song) return json({ error: "Song not found.", code: "NOT_FOUND" }, 404);

        if (!isDownloadEnabledFlag(song.download_enabled)) {
            return json({
                error: "This track is not available for download.",
                code: "DOWNLOAD_DISABLED",
            }, 403);
        }

        const entitlement = await authorizeMediaDownload({
            userId,
            contentOwnerUserIds: [song.user_id],
        });
        if (!entitlement.ok) {
            return json({ error: entitlement.error, code: entitlement.code }, entitlement.status);
        }

        const storagePath = resolveSongStoragePath(song.storage_path, song.audio_url);
        if (!storagePath) {
            return json({ error: "Downloadable audio file was not found.", code: "FILE_NOT_FOUND" }, 404);
        }

        const downloaded = await supabase.storage.from(SONGS_BUCKET).download(storagePath);
        if (downloaded.error || !downloaded.data) {
            const message = getErrorMessage(downloaded.error) || "Unable to load audio file.";
            const missing = /not found|does not exist|404|Object not found/i.test(message);
            return json({
                error: message,
                code: missing ? "FILE_NOT_FOUND" : "AUDIO_FETCH_FAILED",
            }, missing ? 404 : 500);
        }

        const bytes = Buffer.from(await downloaded.data.arrayBuffer());
        const filename = buildMediaDownloadFilename(song.title, storagePath, "music");
        const ext = extensionFromStoragePath(storagePath);
        const contentType = mimeTypeForMediaExtension(ext, "music");
        const contentDisposition = buildMediaContentDisposition(filename);

        await recordMediaDownloadEvent({
            userId,
            contentId: songId,
            contentType: "music",
            filename,
            title: song.title,
            accessMode: entitlement.accessMode,
            planName: entitlement.planName,
            planSlug: entitlement.planSlug,
            deliveryStatus: "delivered",
        });

        return new NextResponse(bytes, {
            status: 200,
            headers: {
                "Content-Type": contentType,
                "Content-Disposition": contentDisposition,
                "Cache-Control": "private, no-store",
                "X-Content-Type-Options": "nosniff",
                "Content-Length": String(bytes.byteLength),
            },
        });
    } catch (error) {
        console.error("[api/songs/:id/download] failed:", error);
        return json({ error: getErrorMessage(error) }, 500);
    }
}
