import { NextResponse } from "next/server";
import { isPublicStreamingCatalogSong } from "@/lib/song-usage-permissions";
import { requireMatchingUserId } from "@/lib/request-auth";
import { getErrorMessage, getSupabaseServerClient, isUuid } from "@/lib/server-supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PUBLIC_SONG_COLUMNS = "id,title,artist,producer,producer_id,beat_id,category,type,audio_url,storage_path,cover_url,avatar_url,duration,plays,likes,created_at,user_id,streaming_enabled,ringtone_enabled,ringtone_creation_enabled,ringtone_sale_enabled,ringtone_price";
const OWNER_RINGTONE_ONLY_COLUMNS = PUBLIC_SONG_COLUMNS;

function jsonResponse(body: Record<string, unknown>, status = 200) {
    return NextResponse.json(body, { status });
}

async function loadPublicStreamingCatalog(supabase: ReturnType<typeof getSupabaseServerClient>) {
    const { data, error } = await supabase
        .from("songs")
        .select(PUBLIC_SONG_COLUMNS)
        .eq("streaming_enabled", true)
        .order("created_at", { ascending: false });
    if (error) return { rows: [] as Record<string, unknown>[], error };
    return {
        rows: (data || []).filter((row) => isPublicStreamingCatalogSong(row as Record<string, unknown>)),
        error: null,
    };
}

async function loadOwnerRingtoneOnlySongs(
    supabase: ReturnType<typeof getSupabaseServerClient>,
    ownerUserId: string,
) {
    const { data, error } = await supabase
        .from("songs")
        .select(OWNER_RINGTONE_ONLY_COLUMNS)
        .eq("streaming_enabled", false)
        .eq("ringtone_enabled", true)
        .or(`user_id.eq.${ownerUserId},producer_id.eq.${ownerUserId}`)
        .order("created_at", { ascending: false });
    if (error) {
        console.warn("[api/songs] owner ringtone-only load failed:", getErrorMessage(error));
        return [];
    }
    return (data || []) as Record<string, unknown>[];
}

export async function GET(request: Request) {
    try {
        const url = new URL(request.url);
        const ownerUserId = url.searchParams.get("ownerUserId")?.trim() || "";
        const supabase = getSupabaseServerClient();

        const { rows, error } = await loadPublicStreamingCatalog(supabase);
        if (error) {
            console.error("[api/songs] load failed:", error);
            return jsonResponse({ error: getErrorMessage(error) }, 500);
        }

        const songs: Record<string, unknown>[] = [...rows];
        if (ownerUserId && isUuid(ownerUserId)) {
            const auth = await requireMatchingUserId(request, "/api/songs", ownerUserId);
            if (auth.ok) {
                const ownerExtras = await loadOwnerRingtoneOnlySongs(supabase, ownerUserId);
                const seen = new Set(songs.map((row) => String(row.id || "")));
                for (const row of ownerExtras) {
                    const id = String(row.id || "");
                    if (id && !seen.has(id)) {
                        songs.push(row);
                        seen.add(id);
                    }
                }
            }
        }

        return jsonResponse({ songs });
    }
    catch (error) {
        console.error("[api/songs] server error:", error);
        return jsonResponse({ error: getErrorMessage(error) }, 500);
    }
}
