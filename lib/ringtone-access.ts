import { isAdminUserId } from "@/lib/admin-auth";
import { loadResolvedAccountCapabilities } from "@/lib/resolved-account-role";
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
    const { data, error } = await supabase
        .from("songs")
        .select("id,user_id,producer_id,duration,audio_url,storage_path")
        .eq("id", songId)
        .maybeSingle();
    if (error) return { ok: false as const, error: getErrorMessage(error) };
    if (!data) return { ok: false as const, error: "Source song was not found." };

    const ownerId = String(data.user_id || "");
    const producerId = String((data as { producer_id?: unknown }).producer_id || "");
    const isOwner = ownerId === userId || producerId === userId;
    const isAdmin = await isAdminUserId(userId);
    if (!isOwner && !isAdmin) {
        return { ok: false as const, error: "You may only create ringtones from songs you own." };
    }

    const duration = Number((data as { duration?: unknown }).duration ?? NaN);
    return {
        ok: true as const,
        songId,
        sourceDurationSeconds: Number.isFinite(duration) ? duration : null,
        ownerUserId: ownerId || null,
        producerId: producerId || null,
        adminOverride: isAdmin && !isOwner,
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
