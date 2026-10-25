import {
    AudioPlaybackGuardError,
    evaluateSongAudioPlaybackAccess,
    resolveAudioPlaybackViewer,
    resolveCatalogSongForAudio,
} from "@/lib/audio-playback-guard";
import {
    normalizeSongStoragePath,
    SONGS_BUCKET,
} from "@/lib/song-storage-path";
import { getErrorMessage, getSupabaseServerClient } from "@/lib/server-supabase";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getContentType(path: string) {
    const extension = path.split(".").pop()?.toLowerCase();

    if (extension === "wav") return "audio/wav";
    if (extension === "m4a") return "audio/mp4";
    if (extension === "aac") return "audio/aac";
    return "audio/mpeg";
}

async function downloadFromStorage(path: string) {
    const supabase = getSupabaseServerClient();
    const normalizedPath = normalizeSongStoragePath(path);
    const { data, error } = await supabase.storage.from(SONGS_BUCKET).download(normalizedPath);
    return {
        supabase,
        normalizedPath,
        data,
        error,
    };
}

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const path = searchParams.get("path") || "";
        const songId = String(searchParams.get("songId") || "").trim();
        const supabase = getSupabaseServerClient();
        const viewer = await resolveAudioPlaybackViewer(request);
        const catalog = await resolveCatalogSongForAudio(supabase, { songId, rawPath: path });
        const access = evaluateSongAudioPlaybackAccess(catalog.song, viewer);

        if (!access.ok) {
            return Response.json({ error: access.error, code: access.code }, { status: 404 });
        }

        if (catalog.pathError || !catalog.storagePath) {
            return Response.json({
                error: "Audio path does not match the catalog record.",
                code: catalog.pathError || "MISSING_PATH",
            }, { status: 400 });
        }

        const download = await downloadFromStorage(catalog.storagePath);
        if (download.error || !download.data) {
            const message = download.error ? getErrorMessage(download.error) : "Audio file could not be loaded.";
            console.error("[api/audio] Supabase download failed:", {
                songId: songId || null,
                storagePath: catalog.storagePath,
                error: message,
            });
            return Response.json(
                { error: message, code: "AUDIO_FETCH_FAILED" },
                { status: 500 },
            );
        }

        return new Response(download.data.stream(), {
            headers: {
                "Content-Type": download.data.type || getContentType(download.normalizedPath),
                "Cache-Control": "private, no-store",
            },
        });
    }
    catch (error) {
        if (error instanceof AudioPlaybackGuardError) {
            console.error("[api/audio] moderation guard blocked delivery:", error.message);
            return Response.json({ error: error.message, code: error.code }, { status: 503 });
        }
        console.error("[api/audio] Server error:", error);
        return Response.json({ error: error instanceof Error ? error.message : "Audio file could not be loaded." }, { status: 500 });
    }
}
