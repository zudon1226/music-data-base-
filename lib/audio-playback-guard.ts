import { isAdminUserId } from "@/lib/admin-auth";
import { isCatalogItemPubliclyPlayable, isModerationHoldColumnError } from "@/lib/moderation-status.mjs";
import { getBearerToken, resolveStrictRequestUserId } from "@/lib/request-auth";
import {
    isLegacySongFilenamePath,
    normalizeSongStoragePath,
    resolveSongStoragePath,
} from "@/lib/song-storage-path";
import { getErrorMessage, getSupabaseServerClient, isUuid } from "@/lib/server-supabase";

export type SongPlaybackRow = {
    id: string;
    user_id: string | null;
    storage_path: string | null;
    audio_url: string | null;
    moderation_state?: string | null;
};

export type AudioPlaybackViewer = {
    userId: string;
    isAdmin: boolean;
};

export const AUDIO_MODERATION_UNAVAILABLE_CODE = "MODERATION_UNAVAILABLE";

export const MODERATION_HOLD_MIGRATION_MESSAGE =
    "Catalog moderation_state is not available until migration 202610172000 is applied.";

export class AudioPlaybackGuardError extends Error {
    readonly code = AUDIO_MODERATION_UNAVAILABLE_CODE;

    constructor(message: string = MODERATION_HOLD_MIGRATION_MESSAGE) {
        super(message);
        this.name = "AudioPlaybackGuardError";
    }
}

const SONG_PLAYBACK_SELECT = "id,user_id,storage_path,audio_url,moderation_state";

export function evaluateSongAudioPlaybackAccess(
    song: SongPlaybackRow | null | undefined,
    viewer: AudioPlaybackViewer,
) {
    if (!song) {
        return { ok: false as const, code: "NOT_FOUND" as const, error: "Song not found." };
    }
    if (!isCatalogItemPubliclyPlayable(song as Record<string, unknown>, {
        allowOwner: true,
        viewerUserId: viewer.userId,
        isAdmin: viewer.isAdmin,
    })) {
        return { ok: false as const, code: "NOT_FOUND" as const, error: "Song not found." };
    }
    return { ok: true as const, song };
}

export function rowMatchesStoragePath(row: SongPlaybackRow, normalizedPath: string) {
    const resolved = resolveSongStoragePath(row.storage_path, row.audio_url);
    return resolved === normalizedPath;
}

/** Require zero or one catalog row for a normalized storage path; deny ambiguous matches. */
export function pickUniqueCatalogSongForStoragePath(
    songs: SongPlaybackRow[],
    normalizedPath: string,
): SongPlaybackRow | null {
    if (!normalizedPath || songs.length === 0) return null;
    if (songs.length === 1) {
        return rowMatchesStoragePath(songs[0], normalizedPath) ? songs[0] : null;
    }
    const exactMatches = songs.filter((row) => rowMatchesStoragePath(row, normalizedPath));
    return exactMatches.length === 1 ? exactMatches[0] : null;
}

export async function resolveAudioPlaybackViewer(request: Request): Promise<AudioPlaybackViewer> {
    const token = getBearerToken(request);
    if (!token) {
        return { userId: "", isAdmin: false };
    }
    const resolved = await resolveStrictRequestUserId(request, {});
    if (!resolved.userId) {
        return { userId: "", isAdmin: false };
    }
    const isAdmin = await isAdminUserId(resolved.userId);
    return { userId: resolved.userId, isAdmin };
}

async function loadSongById(
    supabase: ReturnType<typeof getSupabaseServerClient>,
    songId: string,
): Promise<SongPlaybackRow | null> {
    const primary = await supabase
        .from("songs")
        .select(SONG_PLAYBACK_SELECT)
        .eq("id", songId)
        .maybeSingle();
    if (primary.error) {
        if (isModerationHoldColumnError(primary.error)) {
            throw new AudioPlaybackGuardError();
        }
        throw new Error(getErrorMessage(primary.error));
    }
    return primary.data ? (primary.data as SongPlaybackRow) : null;
}

type SongSelectQueryResult = {
    data: unknown[] | null;
    error: { message?: string } | null;
};

async function selectSongRows(
    _supabase: ReturnType<typeof getSupabaseServerClient>,
    run: (select: string) => Promise<SongSelectQueryResult>,
) {
    const withHold = await run(SONG_PLAYBACK_SELECT);
    if (!withHold.error) return (withHold.data || []) as SongPlaybackRow[];
    if (isModerationHoldColumnError(withHold.error)) {
        throw new AudioPlaybackGuardError();
    }
    throw new Error(getErrorMessage(withHold.error));
}

async function findSongsByStoragePath(
    supabase: ReturnType<typeof getSupabaseServerClient>,
    rawPath: string,
): Promise<SongPlaybackRow[]> {
    const cleanFileName = normalizeSongStoragePath(rawPath);
    if (!cleanFileName) return [];

    const exact = await selectSongRows(supabase, async (columns) =>
        await supabase.from("songs").select(columns).eq("storage_path", cleanFileName));
    if (exact.length > 0) return exact;

    const matches: SongPlaybackRow[] = [];
    const suffix = await selectSongRows(supabase, async (columns) =>
        await supabase
            .from("songs")
            .select(columns)
            .ilike("storage_path", `%/${cleanFileName}`)
            .order("created_at", { ascending: false })
            .limit(5));
    for (const row of suffix) {
        if (rowMatchesStoragePath(row, cleanFileName)) matches.push(row);
    }
    if (matches.length > 0) return matches;

    const endsWith = await selectSongRows(supabase, async (columns) =>
        await supabase
            .from("songs")
            .select(columns)
            .ilike("storage_path", `%${cleanFileName}`)
            .order("created_at", { ascending: false })
            .limit(5));
    for (const row of endsWith) {
        if (rowMatchesStoragePath(row, cleanFileName)) matches.push(row);
    }
    return matches;
}

export async function resolveCatalogSongForAudio(
    supabase: ReturnType<typeof getSupabaseServerClient>,
    input: { songId?: string; rawPath?: string },
): Promise<{ song: SongPlaybackRow | null; storagePath: string; catalogRequired: boolean }> {
    const songId = String(input.songId || "").trim();
    const rawPath = String(input.rawPath || "");
    let storagePath = normalizeSongStoragePath(rawPath);

    if (songId && isUuid(songId)) {
        const song = await loadSongById(supabase, songId);
        if (!song) {
            return { song: null, storagePath: storagePath || "", catalogRequired: true };
        }
        const fromSong = resolveSongStoragePath(song.storage_path, song.audio_url);
        if (fromSong) storagePath = fromSong;
        return { song, storagePath, catalogRequired: true };
    }

    if (!storagePath && isLegacySongFilenamePath(rawPath)) {
        storagePath = normalizeSongStoragePath(rawPath);
    }

    if (!storagePath) {
        return { song: null, storagePath: "", catalogRequired: false };
    }

    const songs = await findSongsByStoragePath(supabase, storagePath);
    const song = pickUniqueCatalogSongForStoragePath(songs, storagePath);
    return { song, storagePath, catalogRequired: true };
}
