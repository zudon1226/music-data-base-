/**
 * Listener personal ringtones: library-scoped source authorization and download gates.
 */

import { isAdminUserId } from "@/lib/admin-auth";
import { loadResolvedAccountCapabilities } from "@/lib/resolved-account-role";
import { songAllowsRingtoneCreation } from "@/lib/song-usage-permissions";
import { normalizeRingtoneSourceDurationSeconds } from "@/lib/ringtone-validation";
import { getErrorMessage, getSupabaseServerClient, isUuid } from "@/lib/server-supabase";

const SOURCE_SONG_SELECT =
    "id,user_id,producer_id,duration,audio_url,storage_path,streaming_enabled,ringtone_enabled,ringtone_creation_enabled,ringtone_sale_enabled,ringtone_price";

export async function canUserCreatePersonalRingtones(userId: string) {
    if (!userId || !isUuid(userId)) return false;
    if (await isAdminUserId(userId)) return true;
    const capabilities = await loadResolvedAccountCapabilities(userId);
    return capabilities.canPersonalRingtones;
}

export async function requirePersonalRingtoneCreator(userId: string) {
    if (!(await canUserCreatePersonalRingtones(userId))) {
        return {
            ok: false as const,
            status: 403,
            error: "Personal ringtone creation requires a listener account.",
        };
    }
    return { ok: true as const, userId };
}

async function loadSourceSongRecord(songId: string) {
    const supabase = getSupabaseServerClient();
    return supabase.from("songs").select(SOURCE_SONG_SELECT).eq("id", songId).maybeSingle();
}

export async function listenerHasLibrarySongSave(userId: string, songId: string) {
    if (!isUuid(userId) || !isUuid(songId)) return false;
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
        .from("library_saves")
        .select("id")
        .eq("user_id", userId)
        .eq("item_id", songId)
        .eq("item_type", "song")
        .maybeSingle();
    if (error) return false;
    return Boolean(data?.id);
}

/** Server-side: library membership + creator ringtone creation permission. */
export async function assertLibrarySourceSongForPersonal(userId: string, songId: string) {
    if (!isUuid(userId) || !isUuid(songId)) {
        return { ok: false as const, error: "Invalid song or user id." };
    }

    const inLibrary = await listenerHasLibrarySongSave(userId, songId);
    if (!inLibrary && !(await isAdminUserId(userId))) {
        return { ok: false as const, error: "Source audio is not in your library.", code: "LIBRARY_REQUIRED" };
    }

    const { data, error } = await loadSourceSongRecord(songId);
    if (error) return { ok: false as const, error: getErrorMessage(error) };
    if (!data) return { ok: false as const, error: "Source audio could not be found." };

    const record = data as Record<string, unknown>;
    if (!songAllowsRingtoneCreation(record)) {
        return {
            ok: false as const,
            error: "This song is not authorized for ringtone creation.",
            code: "RINGTONE_CREATION_NOT_AUTHORIZED",
        };
    }

    const sourceDurationSeconds = normalizeRingtoneSourceDurationSeconds(
        (data as { duration?: unknown }).duration,
    );

    return {
        ok: true as const,
        songId,
        sourceDurationSeconds,
        ownerUserId: String(data.user_id || "") || null,
        producerId: String((data as { producer_id?: unknown }).producer_id || "") || null,
        storagePath: String((data as { storage_path?: unknown }).storage_path || "").trim() || null,
        audioUrl: String((data as { audio_url?: unknown }).audio_url || "").trim() || null,
    };
}

export function isPersonalRingtoneProduct(record: Record<string, unknown>) {
    return record.is_personal === true;
}

export async function assertPersonalRingtoneDownloadAllowed(input: {
    userId: string;
    product: Record<string, unknown>;
}) {
    if (!isPersonalRingtoneProduct(input.product)) {
        return { ok: false as const, status: 403, code: "NOT_PERSONAL", error: "Not a personal ringtone." };
    }
    if (String(input.product.creator_id || "") !== input.userId && !(await isAdminUserId(input.userId))) {
        return { ok: false as const, status: 403, code: "FORBIDDEN", error: "Forbidden." };
    }

    const sourceSongId = String(input.product.source_song_id || "").trim();
    if (sourceSongId && isUuid(sourceSongId)) {
        const source = await assertLibrarySourceSongForPersonal(input.userId, sourceSongId);
        if (!source.ok) {
            return {
                ok: false as const,
                status: 403,
                code: source.code || "SOURCE_NOT_AUTHORIZED",
                error: source.error,
            };
        }
    }

    const hasClip = Boolean(
        String(input.product.android_storage_path || "").trim()
        || String(input.product.iphone_storage_path || "").trim()
        || String(input.product.download_storage_path || "").trim(),
    );
    if (!hasClip) {
        return {
            ok: false as const,
            status: 404,
            code: "FILE_NOT_FOUND",
            error: "Downloadable ringtone file was not found.",
        };
    }

    return { ok: true as const };
}
