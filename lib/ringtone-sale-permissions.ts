import { getSupabaseServerClient, isUuid } from "@/lib/server-supabase";

/** Marketplace resale requires explicit song-level ringtone_sale_enabled. */
export async function assertSourceSongAllowsRingtoneSale(sourceSongId: string | null | undefined) {
    const songId = String(sourceSongId || "").trim();
    if (!songId || !isUuid(songId)) {
        return {
            ok: false as const,
            error: "A source song with resale permission is required to sell this ringtone.",
            code: "RINGTONE_SALE_NOT_AUTHORIZED",
        };
    }
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
        .from("songs")
        .select("ringtone_enabled,ringtone_sale_enabled,ringtone_price")
        .eq("id", songId)
        .maybeSingle();
    if (error || !data) {
        return { ok: false as const, error: "Source song could not be verified for resale.", code: "SOURCE_NOT_FOUND" };
    }
    if (data.ringtone_enabled !== true || data.ringtone_sale_enabled !== true) {
        return {
            ok: false as const,
            error: "This source song is not authorized for ringtone sale.",
            code: "RINGTONE_SALE_NOT_AUTHORIZED",
        };
    }
    return { ok: true as const, ringtonePrice: data.ringtone_price };
}
