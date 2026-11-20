import { getSupabaseServerClient } from "@/lib/server-supabase";
import {
    mapMixtapeCategoryRow,
    mapMixtapeRow,
    mapMixtapeTrackRow,
    type Mixtape,
    type MixtapeCategory,
    type MixtapeTrack,
} from "@/lib/mixtape-types";

export const MIXTAPE_COLUMNS = [
    "id",
    "user_id",
    "title",
    "description",
    "category_id",
    "genre",
    "explicit_content",
    "cover_image_url",
    "cover_storage_path",
    "status",
    "moderation_state",
    "is_featured",
    "release_date",
    "published_at",
    "play_count",
    "favorite_count",
    "created_at",
    "updated_at",
].join(",");

export const MIXTAPE_TRACK_COLUMNS = [
    "id",
    "mixtape_id",
    "user_id",
    "position",
    "title",
    "description",
    "storage_path",
    "media_url",
    "file_name",
    "file_size",
    "mime_type",
    "duration_seconds",
    "status",
    "moderation_state",
    "play_count",
    "published_at",
    "created_at",
    "updated_at",
].join(",");

export const MIXTAPE_CATEGORY_COLUMNS = "id,slug,label,sort_order,is_active,created_at,updated_at";

export async function loadMixtapeCreatorNames(userIds: string[]) {
    const uniqueIds = [...new Set(userIds.filter(Boolean))];
    const names = new Map<string, string>();
    if (uniqueIds.length === 0) return names;
    const supabase = getSupabaseServerClient();
    const [byId, byUserId] = await Promise.all([
        supabase.from("profiles").select("id,user_id,display_name,name,username").in("id", uniqueIds),
        supabase.from("profiles").select("id,user_id,display_name,name,username").in("user_id", uniqueIds),
    ]);
    for (const row of [...(byId.data || []), ...(byUserId.data || [])] as Record<string, unknown>[]) {
        const id = String(row.user_id || row.id || "");
        const name = String(row.display_name || row.name || row.username || "").trim();
        if (id && name) names.set(id, name);
    }
    return names;
}

export async function loadMixtapeTrackCounts(
    mixtapeIds: string[],
    options: { publishedOnly?: boolean } = {},
) {
    const uniqueIds = [...new Set(mixtapeIds.filter(Boolean))];
    const counts = new Map<string, number>();
    if (uniqueIds.length === 0) return counts;
    const supabase = getSupabaseServerClient();
    let query = supabase.from("mixtape_tracks").select("mixtape_id").in("mixtape_id", uniqueIds);
    if (options.publishedOnly) query = query.eq("status", "published");
    const { data } = await query;
    for (const row of data || []) {
        const id = String((row as { mixtape_id?: string }).mixtape_id || "");
        if (!id) continue;
        counts.set(id, (counts.get(id) || 0) + 1);
    }
    return counts;
}

export async function loadMixtapeCategories(): Promise<MixtapeCategory[]> {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
        .from("mixtape_categories")
        .select(MIXTAPE_CATEGORY_COLUMNS)
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
    if (error) return [];
    return (data || []).map((row) => mapMixtapeCategoryRow(row as Record<string, unknown>));
}

export async function mapMixtapeRows(input: {
    mixtapeRows: Record<string, unknown>[];
    trackRows: Record<string, unknown>[];
    categoryById?: Map<string, MixtapeCategory>;
    publishedOnly?: boolean;
}) {
    const creatorNames = await loadMixtapeCreatorNames(
        input.mixtapeRows.map((row) => String(row.user_id || "")),
    );
    const mixtapeIds = input.mixtapeRows.map((row) => String(row.id || "")).filter(Boolean);
    const trackCounts = await loadMixtapeTrackCounts(mixtapeIds, {
        publishedOnly: input.publishedOnly,
    });
    const categories = input.categoryById || new Map(
        (await loadMixtapeCategories()).map((category) => [category.id, category]),
    );
    const mixtapes = input.mixtapeRows.map((row) => {
        const categoryId = row.category_id ? String(row.category_id) : "";
        const category = categoryId ? categories.get(categoryId) : undefined;
        const mapped = mapMixtapeRow({
            ...row,
            creator_name: creatorNames.get(String(row.user_id || "")) || "",
            category_slug: category?.slug || "",
            category_label: category?.label || "",
        });
        mapped.trackCount = trackCounts.get(String(row.id || "")) || 0;
        return mapped;
    });
    const mixtapeMap = new Map(mixtapes.map((mixtape) => [mixtape.id, mixtape]));
    const tracks = input.trackRows.map((row) => mapMixtapeTrackRow(
        row,
        mixtapeMap.get(String(row.mixtape_id || "")),
    ));
    return { mixtapes, tracks, categories: [...categories.values()] };
}

export function attachMixtapeMeta(track: MixtapeTrack, mixtapes: Mixtape[]) {
    const mixtape = mixtapes.find((candidate) => candidate.id === track.mixtapeId);
    return mixtape
        ? {
            ...track,
            mixtapeTitle: mixtape.title,
            creatorName: mixtape.creatorName || track.creatorName,
            coverImageUrl: track.coverImageUrl || mixtape.coverImageUrl,
        }
        : track;
}