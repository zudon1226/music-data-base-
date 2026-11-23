/**
 * Expand album purchases into per-track download vault rows (songs on the album).
 */
import { getErrorMessage, getSupabaseServerClient, isUuid } from "@/lib/server-supabase";
import type { PendingSaleRow } from "@/lib/sales-payment-fulfillment";

export async function expandAlbumPurchaseVaultRows(
    purchase: PendingSaleRow,
    userId: string,
): Promise<Array<Record<string, unknown>>> {
    if (String(purchase.item_type) !== "album" || !isUuid(String(purchase.item_id))) {
        return [];
    }
    const supabase = getSupabaseServerClient();
    const { data: trackRows, error: trackError } = await supabase
        .from("album_tracks")
        .select("item_id,item_type,position")
        .eq("album_id", purchase.item_id)
        .eq("item_type", "song")
        .order("position", { ascending: true });
    if (trackError) {
        throw new Error(getErrorMessage(trackError));
    }
    const songIds = [...new Set((trackRows || []).map((row) => String(row.item_id || "")).filter(isUuid))];
    if (!songIds.length) return [];

    const { data: songs, error: songError } = await supabase
        .from("songs")
        .select("id,title,artist,cover_url,audio_url,storage_path,price_cents")
        .in("id", songIds);
    if (songError) throw new Error(getErrorMessage(songError));

    const byId = new Map((songs || []).map((row) => [String(row.id), row]));
    return songIds
        .map((songId) => byId.get(songId))
        .filter(Boolean)
        .map((song) => ({
            user_id: userId,
            purchase_id: purchase.id,
            item_id: String(song!.id),
            item_type: "song",
            title: String(song!.title || "Untitled"),
            creator_name: String(song!.artist || purchase.creator_name || ""),
            cover_url: String(song!.cover_url || purchase.cover_url || ""),
            download_url: String(song!.audio_url || song!.storage_path || ""),
            price_cents: 0,
            currency: purchase.currency || "USD",
            license_type: "album_bundle",
            license_terms: [`Included with album purchase: ${purchase.title || "Album"}`],
            license_id: purchase.id,
            license_pdf_file_name: "",
        }));
}