import { isAdminUserId } from "@/lib/admin-auth";
import { getErrorMessage, getSupabaseServerClient, isUuid } from "@/lib/server-supabase";

export async function canUserCreateRingtones(userId: string) {
    if (!userId || !isUuid(userId)) return false;
    if (await isAdminUserId(userId)) return true;

    const supabase = getSupabaseServerClient();

    const roles = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .eq("status", "active")
        .in("role", ["admin", "artist", "producer", "creator"])
        .limit(1);
    if (!roles.error && (roles.data || []).length > 0) return true;

    const profile = await supabase
        .from("profiles")
        .select("account_type,is_admin")
        .or(`id.eq.${userId},user_id.eq.${userId}`)
        .limit(1);
    const row = (profile.data || [])[0] as { account_type?: string; is_admin?: boolean } | undefined;
    if (row?.is_admin) return true;
    const accountType = String(row?.account_type || "").toLowerCase();
    if (["admin", "artist", "producer", "creator"].includes(accountType)) return true;

    const artist = await supabase.from("artist_profiles").select("id").eq("user_id", userId).limit(1);
    if (!artist.error && (artist.data || []).length > 0) return true;

    const producer = await supabase.from("producer_profiles").select("id").eq("user_id", userId).limit(1);
    if (!producer.error && (producer.data || []).length > 0) return true;

    return false;
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
    const { data, error } = await supabase
        .from("songs")
        .select("id,user_id,duration,duration_seconds")
        .eq("id", songId)
        .maybeSingle();
    if (error) return { ok: false as const, error: getErrorMessage(error) };
    if (!data) return { ok: false as const, error: "Source song was not found." };
    if (String(data.user_id || "") !== userId) {
        return { ok: false as const, error: "You may only create ringtones from songs you own." };
    }
    const duration = Number(
        (data as { duration_seconds?: unknown; duration?: unknown }).duration_seconds
        ?? (data as { duration?: unknown }).duration
        ?? NaN,
    );
    return {
        ok: true as const,
        songId,
        sourceDurationSeconds: Number.isFinite(duration) ? duration : null,
    };
}

export async function buyerHasPaidRingtonePurchase(buyerId: string, ringtoneId: string) {
    if (!isUuid(buyerId) || !isUuid(ringtoneId)) return null;
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
        .from("ringtone_purchases")
        .select("id,payment_status,buyer_id,ringtone_id,creator_id")
        .eq("buyer_id", buyerId)
        .eq("ringtone_id", ringtoneId)
        .eq("payment_status", "paid")
        .maybeSingle();
    if (error || !data) return null;
    return data;
}
