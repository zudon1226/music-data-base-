import { NextResponse } from "next/server";
import { PUBLIC_RINGTONE_STATUSES } from "@/lib/ringtone-constants";
import { optionalMatchingUserId } from "@/lib/request-auth";
import { getErrorMessage, getSupabaseServerClient, isUuid } from "@/lib/server-supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(body: Record<string, unknown>, status = 200) {
    return NextResponse.json(body, { status });
}

/** Parse optional numeric query params. Empty/missing must NOT become 0. */
function parseOptionalNumber(raw: string | null): number | null {
    if (raw == null) return null;
    const trimmed = String(raw).trim();
    if (!trimmed) return null;
    const value = Number(trimmed);
    return Number.isFinite(value) ? value : null;
}

type SortKey =
    | "featured"
    | "newest"
    | "most_purchased"
    | "most_downloaded"
    | "most_favorited"
    | "price_asc"
    | "price_desc"
    | "title";

/**
 * Server-backed public ringtone marketplace catalog with filters and pagination.
 * Never returns draft/processing/pending_review/rejected/suspended/archived rows.
 */
export async function GET(request: Request) {
    try {
        const url = new URL(request.url);
        const userId = url.searchParams.get("userId")?.trim() || "";
        if (userId) {
            await optionalMatchingUserId(request, userId, { route: "/api/ringtones/marketplace" });
        }

        const q = (url.searchParams.get("q") || "").trim().toLowerCase();
        const filter = (url.searchParams.get("filter") || "all").trim().toLowerCase();
        const sort = ((url.searchParams.get("sort") || "featured").trim().toLowerCase()) as SortKey;
        const creatorId = url.searchParams.get("creatorId")?.trim() || "";
        // Number("") === 0 — never treat missing query params as numeric filters.
        const minPrice = parseOptionalNumber(url.searchParams.get("minPriceCents"));
        const maxPrice = parseOptionalNumber(url.searchParams.get("maxPriceCents"));
        const minDuration = parseOptionalNumber(url.searchParams.get("minDuration"));
        const maxDuration = parseOptionalNumber(url.searchParams.get("maxDuration"));
        const page = Math.max(1, Number(url.searchParams.get("page") || 1) || 1);
        const pageSize = Math.min(48, Math.max(1, Number(url.searchParams.get("pageSize") || 24) || 24));
        const section = (url.searchParams.get("section") || "").trim().toLowerCase();

        const supabase = getSupabaseServerClient();
        let query = supabase
            .from("ringtone_products")
            .select("id,creator_id,title,description,artwork_url,preview_url,duration_seconds,clip_start_seconds,clip_end_seconds,price_cents,currency,status,is_featured,is_explicit,source_song_id,source_kind,published_at,created_at", { count: "exact" })
            .in("status", [...PUBLIC_RINGTONE_STATUSES])
            .not("published_at", "is", null);

        if (filter === "featured" || section === "featured") query = query.eq("is_featured", true);
        if (filter === "free" || section === "free") query = query.eq("price_cents", 0);
        if (filter === "paid") query = query.gt("price_cents", 0);
        if (filter === "explicit") query = query.eq("is_explicit", true);
        if (filter === "clean") query = query.eq("is_explicit", false);
        if (creatorId && isUuid(creatorId)) query = query.eq("creator_id", creatorId);
        if (minPrice != null) query = query.gte("price_cents", minPrice);
        if (maxPrice != null) query = query.lte("price_cents", maxPrice);
        if (minDuration != null && minDuration > 0) query = query.gte("duration_seconds", minDuration);
        if (maxDuration != null && maxDuration > 0) query = query.lte("duration_seconds", maxDuration);
        if (section === "newest" || filter === "recent") {
            query = query.order("published_at", { ascending: false, nullsFirst: false });
        }

        if (sort === "newest") query = query.order("published_at", { ascending: false, nullsFirst: false });
        else if (sort === "price_asc") query = query.order("price_cents", { ascending: true });
        else if (sort === "price_desc") query = query.order("price_cents", { ascending: false });
        else if (sort === "title") query = query.order("title", { ascending: true });
        else if (sort === "featured") {
            query = query.order("is_featured", { ascending: false }).order("published_at", { ascending: false, nullsFirst: false });
        } else {
            query = query.order("published_at", { ascending: false, nullsFirst: false });
        }

        const from = (page - 1) * pageSize;
        const to = from + pageSize - 1;
        const { data, error, count } = await query.range(from, to);
        if (error) return json({ error: getErrorMessage(error) }, 500);

        let rows = data || [];
        const ringtoneIds = rows.map((row) => row.id).filter(Boolean);
        const creatorIds = [...new Set(rows.map((row) => row.creator_id).filter(Boolean))];
        const sourceSongIds = [...new Set(rows.map((row) => row.source_song_id).filter(Boolean))];

        const [profiles, songs, purchaseCounts, downloadCounts, favoriteCounts, owned, favorites] = await Promise.all([
            creatorIds.length
                ? supabase.from("profiles").select("id,user_id,display_name,name,username").or(
                    creatorIds.map((id) => `id.eq.${id},user_id.eq.${id}`).join(","),
                )
                : Promise.resolve({ data: [] as Record<string, unknown>[] }),
            sourceSongIds.length
                ? supabase.from("songs").select("id,title,category,type,artist").in("id", sourceSongIds)
                : Promise.resolve({ data: [] as Record<string, unknown>[] }),
            ringtoneIds.length
                ? supabase.from("ringtone_purchases").select("ringtone_id").eq("payment_status", "paid").in("ringtone_id", ringtoneIds)
                : Promise.resolve({ data: [] as Record<string, unknown>[] }),
            ringtoneIds.length
                ? supabase.from("ringtone_downloads").select("ringtone_id").in("ringtone_id", ringtoneIds)
                : Promise.resolve({ data: [] as Record<string, unknown>[] }),
            ringtoneIds.length
                ? supabase.from("ringtone_favorites").select("ringtone_id").in("ringtone_id", ringtoneIds)
                : Promise.resolve({ data: [] as Record<string, unknown>[] }),
            userId && isUuid(userId) && ringtoneIds.length
                ? supabase.from("ringtone_purchases").select("ringtone_id").eq("buyer_id", userId).eq("payment_status", "paid").in("ringtone_id", ringtoneIds)
                : Promise.resolve({ data: [] as Record<string, unknown>[] }),
            userId && isUuid(userId) && ringtoneIds.length
                ? supabase.from("ringtone_favorites").select("ringtone_id").eq("user_id", userId).in("ringtone_id", ringtoneIds)
                : Promise.resolve({ data: [] as Record<string, unknown>[] }),
        ]);

        const creatorNameById = new Map<string, string>();
        for (const profile of profiles.data || []) {
            const name = String(
                (profile as { display_name?: string }).display_name
                || (profile as { name?: string }).name
                || (profile as { username?: string }).username
                || "Creator",
            );
            const id = String((profile as { id?: string }).id || "");
            const uid = String((profile as { user_id?: string }).user_id || "");
            if (id) creatorNameById.set(id, name);
            if (uid) creatorNameById.set(uid, name);
        }

        const songById = new Map((songs.data || []).map((song) => [String(song.id), song]));
        const countMap = (items: Record<string, unknown>[] | null | undefined) => {
            const map = new Map<string, number>();
            for (const item of items || []) {
                const id = String(item.ringtone_id || "");
                if (!id) continue;
                map.set(id, (map.get(id) || 0) + 1);
            }
            return map;
        };
        const purchaseMap = countMap(purchaseCounts.data as Record<string, unknown>[]);
        const downloadMap = countMap(downloadCounts.data as Record<string, unknown>[]);
        const favoriteMap = countMap(favoriteCounts.data as Record<string, unknown>[]);
        const ownedSet = new Set((owned.data || []).map((row) => String(row.ringtone_id)));
        const favoriteSet = new Set((favorites.data || []).map((row) => String(row.ringtone_id)));

        let catalog = rows.map((row) => {
            const song = row.source_song_id ? songById.get(String(row.source_song_id)) : null;
            return {
                ...row,
                creatorName: creatorNameById.get(String(row.creator_id)) || "Creator",
                sourceSongTitle: song ? String((song as { title?: string }).title || "") : "",
                sourceGenre: song
                    ? String((song as { type?: string }).type || (song as { category?: string }).category || "")
                    : "",
                purchaseCount: purchaseMap.get(String(row.id)) || 0,
                downloadCount: downloadMap.get(String(row.id)) || 0,
                favoriteCount: favoriteMap.get(String(row.id)) || 0,
                owned: ownedSet.has(String(row.id)),
                favorited: favoriteSet.has(String(row.id)),
            };
        });

        if (q) {
            catalog = catalog.filter((row) => {
                const haystack = [
                    row.title,
                    row.creatorName,
                    row.sourceSongTitle,
                    row.sourceGenre,
                    row.description,
                ].join(" ").toLowerCase();
                return haystack.includes(q);
            });
        }

        if (sort === "most_purchased") catalog.sort((a, b) => b.purchaseCount - a.purchaseCount);
        if (sort === "most_downloaded") catalog.sort((a, b) => b.downloadCount - a.downloadCount);
        if (sort === "most_favorited") catalog.sort((a, b) => b.favoriteCount - a.favoriteCount);

        // Popular creators (from current page + top paid creators)
        const creatorAgg = new Map<string, { creatorId: string; creatorName: string; count: number }>();
        for (const row of catalog) {
            const current = creatorAgg.get(String(row.creator_id)) || {
                creatorId: String(row.creator_id),
                creatorName: row.creatorName,
                count: 0,
            };
            current.count += 1 + row.purchaseCount;
            creatorAgg.set(String(row.creator_id), current);
        }
        const popularCreators = [...creatorAgg.values()]
            .sort((a, b) => b.count - a.count)
            .slice(0, 8);

        return json({
            ringtones: catalog,
            page,
            pageSize,
            total: typeof count === "number" ? count : catalog.length,
            popularCreators,
            filtersApplied: { filter, sort, q, creatorId, section },
        });
    } catch (error) {
        console.error("[api/ringtones/marketplace] GET failed:", error);
        return json({ error: getErrorMessage(error) }, 500);
    }
}
