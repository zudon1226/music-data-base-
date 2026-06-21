import {
    encodeSongStoragePath,
    extractSongStoragePathFromPublicUrl,
    isLegacySongFilenamePath,
    normalizeSongStoragePath,
    resolveSongStoragePath,
    SONGS_BUCKET,
} from "@/lib/song-storage-path";
import { getErrorMessage, getSupabaseServerClient } from "@/lib/server-supabase";
import { SUPABASE_PROJECT_URL } from "@/lib/supabase-config";

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

async function lookupSongStoragePath(supabase: ReturnType<typeof getSupabaseServerClient>, songId: string) {
    const { data } = await supabase
        .from("songs")
        .select("storage_path,audio_url")
        .eq("id", songId)
        .maybeSingle();
    if (!data) {
        return "";
    }
    return resolveSongStoragePath(
        typeof data.storage_path === "string" ? data.storage_path : "",
        typeof data.audio_url === "string" ? data.audio_url : "",
    );
}

async function lookupLegacySongStoragePath(
    supabase: ReturnType<typeof getSupabaseServerClient>,
    fileName: string,
) {
    const cleanFileName = normalizeSongStoragePath(fileName);
    if (!cleanFileName) {
        return "";
    }

    const exactMatch = await supabase
        .from("songs")
        .select("storage_path,audio_url")
        .eq("storage_path", cleanFileName)
        .limit(1)
        .maybeSingle();
    if (exactMatch.data) {
        return resolveSongStoragePath(
            typeof exactMatch.data.storage_path === "string" ? exactMatch.data.storage_path : "",
            typeof exactMatch.data.audio_url === "string" ? exactMatch.data.audio_url : "",
        );
    }

    const suffixMatches = await supabase
        .from("songs")
        .select("storage_path,audio_url")
        .ilike("storage_path", `%/${cleanFileName}`)
        .order("created_at", { ascending: false })
        .limit(5);
    for (const row of suffixMatches.data || []) {
        const resolved = resolveSongStoragePath(
            typeof row.storage_path === "string" ? row.storage_path : "",
            typeof row.audio_url === "string" ? row.audio_url : "",
        );
        if (resolved.includes("/")) {
            return resolved;
        }
    }

    const endsWithMatches = await supabase
        .from("songs")
        .select("storage_path,audio_url")
        .ilike("storage_path", `%${cleanFileName}`)
        .order("created_at", { ascending: false })
        .limit(5);
    for (const row of endsWithMatches.data || []) {
        const resolved = resolveSongStoragePath(
            typeof row.storage_path === "string" ? row.storage_path : "",
            typeof row.audio_url === "string" ? row.audio_url : "",
        );
        if (resolved) {
            return resolved;
        }
    }

    return "";
}

async function fetchPublicSongBlob(storagePath: string) {
    const publicUrl = `${SUPABASE_PROJECT_URL}/storage/v1/object/public/${SONGS_BUCKET}/${encodeSongStoragePath(storagePath)}`;
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
    | { error: string; storagePath?: string };

async function resolveAudioDownload(rawPath: string, songId: string): Promise<AudioDownloadResult> {
    let storagePath = normalizeSongStoragePath(rawPath);
    let supabase = getSupabaseServerClient();

    if (songId) {
        const fromSongId = await lookupSongStoragePath(supabase, songId);
        if (fromSongId) {
            storagePath = fromSongId;
        }
    }

    if (!storagePath && songId) {
        return { error: "Missing audio path for song." };
    }
    if (!storagePath) {
        return { error: "Missing audio path." };
    }

    const candidates = [storagePath];
    const fromPublicUrl = extractSongStoragePathFromPublicUrl(storagePath);
    if (fromPublicUrl && !candidates.includes(fromPublicUrl)) {
        candidates.push(fromPublicUrl);
    }

    if (isLegacySongFilenamePath(storagePath)) {
        const legacyResolved = await lookupLegacySongStoragePath(supabase, storagePath);
        if (legacyResolved && !candidates.includes(legacyResolved)) {
            candidates.unshift(legacyResolved);
        }
    }

    let lastError = "Audio file could not be loaded.";
    for (const candidate of candidates) {
        const download = await downloadFromStorage(candidate);
        supabase = download.supabase;
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

    return { error: lastError, storagePath };
}

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const path = searchParams.get("path") || "";
        const songId = String(searchParams.get("songId") || "").trim();
        const resolved = await resolveAudioDownload(path, songId);

        if ("error" in resolved) {
            console.error("[api/audio] Supabase download failed:", {
                path,
                songId: songId || null,
                storagePath: resolved.storagePath || path,
                error: resolved.error,
            });
            return Response.json({ error: resolved.error || "Audio file could not be loaded." }, { status: 500 });
        }

        return new Response(resolved.data.stream(), {
            headers: {
                "Content-Type": resolved.contentType || getContentType(resolved.storagePath || path),
                "Cache-Control": "public, max-age=3600",
            },
        });
    }
    catch (error) {
        console.error("[api/audio] Server error:", error);
        return Response.json({ error: error instanceof Error ? error.message : "Audio file could not be loaded." }, { status: 500 });
    }
}
