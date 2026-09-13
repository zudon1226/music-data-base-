import { isAdminUserId } from "@/lib/admin-auth";
import { assertLibrarySourceSongForPersonal, canUserCreatePersonalRingtones } from "@/lib/personal-ringtone-access";
import { loadResolvedAccountCapabilities } from "@/lib/resolved-account-role";
import { songAllowsRingtoneCreation } from "@/lib/song-usage-permissions";
import { normalizeRingtoneSourceDurationSeconds } from "@/lib/ringtone-validation";
import { getErrorMessage, getSupabaseServerClient, isUuid } from "@/lib/server-supabase";

const SOURCE_SONG_SELECT_WITH_USAGE = "id,user_id,producer_id,duration,audio_url,storage_path,streaming_enabled,ringtone_enabled,ringtone_creation_enabled,ringtone_sale_enabled,ringtone_price";
const SOURCE_SONG_SELECT_LEGACY = "id,user_id,producer_id,duration,audio_url,storage_path";

async function loadSourceSongRecord(songId: string) {
    const supabase = getSupabaseServerClient();
    const withUsage = await supabase
        .from("songs")
        .select(SOURCE_SONG_SELECT_WITH_USAGE)
        .eq("id", songId)
        .maybeSingle();
    if (!withUsage.error) return withUsage;
    const message = getErrorMessage(withUsage.error);
    if (!/ringtone_|streaming_enabled/i.test(message)) {
        return withUsage;
    }
    return supabase
        .from("songs")
        .select(SOURCE_SONG_SELECT_LEGACY)
        .eq("id", songId)
        .maybeSingle();
}

export async function canUserCreateRingtones(userId: string) {
    if (!userId || !isUuid(userId)) return false;
    if (await isAdminUserId(userId)) return true;
    // Explicit account roles only — never grant from leftover artist/producer profile rows.
    const capabilities = await loadResolvedAccountCapabilities(userId);
    return capabilities.canMyRingtones;
}

export async function canUserAccessRingtoneStudio(userId: string) {
    if (!userId || !isUuid(userId)) return false;
    if (await isAdminUserId(userId)) return true;
    const capabilities = await loadResolvedAccountCapabilities(userId);
    return capabilities.canMyRingtones || capabilities.canPersonalRingtones;
}

export async function requireRingtoneCreator(userId: string) {
    if (!(await canUserCreateRingtones(userId))) {
        return { ok: false as const, status: 403, error: "Creator permission is required to manage ringtones." };
    }
    return { ok: true as const, userId };
}

export async function requireRingtoneStudioAccess(userId: string) {
    if (!(await canUserAccessRingtoneStudio(userId))) {
        return { ok: false as const, status: 403, error: "Ringtone studio access is not available for this account." };
    }
    return { ok: true as const, userId };
}

/** Creator-owned source OR listener library source for personal products. */
export async function assertAuthorizedSourceSong(input: {
    userId: string;
    songId: string;
    isPersonal: boolean;
}) {
    if (input.isPersonal) {
        if (!(await canUserCreatePersonalRingtones(input.userId))) {
            return { ok: false as const, error: "Personal ringtone creation is not available.", code: "FORBIDDEN" };
        }
        return assertLibrarySourceSongForPersonal(input.userId, input.songId);
    }
    return assertOwnsSourceSong(input.userId, input.songId);
}

export async function assertOwnsSourceSong(userId: string, songId: string) {
    if (!isUuid(userId) || !isUuid(songId)) {
        return { ok: false as const, error: "Invalid song or user id." };
    }
    // Canonical ownership fields on public.songs: user_id (uploader) and producer_id (credit).
    // Songs store length in `duration` (seconds integer or legacy mm:ss text) — not duration_seconds.
    const { data, error } = await loadSourceSongRecord(songId);
    if (error) return { ok: false as const, error: getErrorMessage(error) };
    if (!data) return { ok: false as const, error: "Source audio could not be found." };

    const record = data as Record<string, unknown>;
    const ownerId = String(data.user_id || "");
    const producerId = String((data as { producer_id?: unknown }).producer_id || "");
    const isOwner = ownerId === userId || producerId === userId;
    const isAdmin = await isAdminUserId(userId);
    if (!isOwner && !isAdmin) {
        return { ok: false as const, error: "Source audio is not authorized." };
    }

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
        // null when metadata is missing — never return 0 (Number(null) trap).
        sourceDurationSeconds,
        ownerUserId: ownerId || null,
        producerId: producerId || null,
        adminOverride: isAdmin && !isOwner,
        storagePath: String((data as { storage_path?: unknown }).storage_path || "").trim() || null,
        audioUrl: String((data as { audio_url?: unknown }).audio_url || "").trim() || null,
    };
}

export async function buyerHasPaidRingtonePurchase(buyerId: string, ringtoneId: string) {
    if (!isUuid(buyerId) || !isUuid(ringtoneId)) return null;
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
        .from("ringtone_purchases")
        .select("id,payment_status,buyer_id,ringtone_id,creator_id,revision_id,revision_number")
        .eq("buyer_id", buyerId)
        .eq("ringtone_id", ringtoneId)
        .eq("payment_status", "paid")
        .maybeSingle();
    if (error || !data) return null;
    return data;
}
