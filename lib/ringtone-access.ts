import { isAdminUserId } from "@/lib/admin-auth";
import { loadResolvedAccountCapabilities } from "@/lib/resolved-account-role";
import { normalizeRingtoneSourceDurationSeconds } from "@/lib/ringtone-validation";
import { getErrorMessage, getSupabaseServerClient, isUuid } from "@/lib/server-supabase";

export async function canUserCreateRingtones(userId: string) {
    if (!userId || !isUuid(userId)) return false;
    if (await isAdminUserId(userId)) return true;
    // Explicit account roles only — never grant from leftover artist/producer profile rows.
    const capabilities = await loadResolvedAccountCapabilities(userId);
    return capabilities.canMyRingtones;
}

export async function requireRingtoneCreator(userId: string) {
    if (!(await canUserCreateRingtones(userId))) {
        return { ok: false as const, status: 403, error: "Creator permission is required to manage ringtones." };
    }
    return { ok: true as const, userId };
}

export async function assertOwnsSourceSong(userId: string, songId: string) {
    if (!isUuid(userId) || !isUuid(songId)) {
        return { ok: false as const, error: "Invalid song or user id." };
    }
    const supabase = getSupabaseServerClient();
    // Canonical ownership fields on public.songs: user_id (uploader) and producer_id (credit).
    // Songs store length in `duration` (seconds integer or legacy mm:ss text) — not duration_seconds.
    const { data, error } = await supabase
        .from("songs")
        .select("id,user_id,producer_id,duration,audio_url,storage_path")
        .eq("id", songId)
        .maybeSingle();
    if (error) return { ok: false as const, error: getErrorMessage(error) };
    if (!data) return { ok: false as const, error: "Source audio could not be found." };

    const ownerId = String(data.user_id || "");
    const producerId = String((data as { producer_id?: unknown }).producer_id || "");
    const isOwner = ownerId === userId || producerId === userId;
    const isAdmin = await isAdminUserId(userId);
    if (!isOwner && !isAdmin) {
        return { ok: false as const, error: "Source audio is not authorized." };
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
