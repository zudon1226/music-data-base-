import {
    AudioPlaybackGuardError,
    evaluateSongAudioPlaybackAccess,
    resolveAudioPlaybackViewer,
    resolveCatalogSongForAudio,
} from "@/lib/audio-playback-guard";
import {
    encodeSongStoragePath,
    extractSongStoragePathFromPublicUrl,
    isLegacySongFilenamePath,
    normalizeSongStoragePath,
    SONGS_BUCKET,
} from "@/lib/song-storage-path";
import { getErrorMessage, getSupabaseServerClient } from "@/lib/server-supabase";
import { readSupabaseProjectUrl } from "@/lib/supabase-config";

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

async function fetchPublicSongBlob(storagePath: string) {
    const publicUrl = `${readSupabaseProjectUrl()}/storage/v1/object/public/${SONGS_BUCKET}/${encodeSongStoragePath(storagePath)}`;
    const response = await fetch(publicUrl, { cache: "no-store" });
    if (!response.ok) {
        return { error: `Public audio URL fetch failed with HTTP ${response.status}.` };
    }
    const data = await response.blob();
    return {
        data,
        contentType: response.headers.get("content-type") || getContentType(storagePath),
        publicUrl,
    };
}

type AudioDownloadResult =
    | { storagePath: string; data: Blob; contentType: string }
    | { error: string; storagePath?: string; status?: number; code?: string };

async function resolveAudioDownload(storagePath: string): Promise<AudioDownloadResult> {
    const normalized = normalizeSongStoragePath(storagePath);
    if (!normalized) {
        return { error: "Missing audio path.", status: 400, code: "MISSING_PATH" };
    }

    const candidates = [normalized];
    const fromPublicUrl = extractSongStoragePathFromPublicUrl(normalized);
    if (fromPublicUrl && !candidates.includes(fromPublicUrl)) {
        candidates.push(fromPublicUrl);
    }

    if (isLegacySongFilenamePath(normalized)) {
        const supabase = getSupabaseServerClient();
        const catalog = await resolveCatalogSongForAudio(supabase, { rawPath: normalized });
        if (catalog.storagePath && !candidates.includes(catalog.storagePath)) {
            candidates.unshift(catalog.storagePath);
        }
    }

    let lastError = "Audio file could not be loaded.";
    for (const candidate of candidates) {
        const download = await downloadFromStorage(candidate);
        if (!download.error && download.data) {
            return {
                storagePath: download.normalizedPath,
                data: download.data,
                contentType: download.data.type || getContentType(download.normalizedPath),
            };
        }
        lastError = download.error ? getErrorMessage(download.error) : lastError;

        const publicFetch = await fetchPublicSongBlob(candidate);
        if (!("error" in publicFetch)) {
            return {
                storagePath: candidate,
                data: publicFetch.data,
                contentType: publicFetch.contentType,
            };
        }
        lastError = publicFetch.error || lastError;
    }

    return { error: lastError, storagePath: normalized, status: 500 };
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

        const storagePath = catalog.storagePath || normalizeSongStoragePath(path);
        if (!storagePath) {
            return Response.json({ error: songId ? "Missing audio path for song." : "Missing audio path.", code: "MISSING_PATH" }, { status: 400 });
        }

        const resolved = await resolveAudioDownload(storagePath);

        if ("error" in resolved) {
            console.error("[api/audio] Supabase download failed:", {
                path,
                songId: songId || null,
                storagePath: resolved.storagePath || path,
                error: resolved.error,
            });
            return Response.json(
                { error: resolved.error || "Audio file could not be loaded.", code: resolved.code || "AUDIO_FETCH_FAILED" },
                { status: resolved.status || 500 },
            );
        }

        return new Response(resolved.data.stream(), {
            headers: {
                "Content-Type": resolved.contentType || getContentType(resolved.storagePath || path),
                "Cache-Control": "public, max-age=3600",
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
