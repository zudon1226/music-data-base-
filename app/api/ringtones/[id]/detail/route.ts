import { NextResponse } from "next/server";
import { isPublicRingtoneStatus } from "@/lib/ringtone-validation";
import type { RingtoneStatus } from "@/lib/ringtone-constants";
import { optionalMatchingUserId, requireMatchingUserId } from "@/lib/request-auth";
import { getErrorMessage, getSupabaseServerClient, isUuid } from "@/lib/server-supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(body: Record<string, unknown>, status = 200) {
    return NextResponse.json(body, { status });
}

type Params = { params: Promise<{ id: string }> };

/** Public ringtone product detail with related items; never exposes private download paths. */
export async function GET(request: Request, context: Params) {
    try {
        const { id } = await context.params;
        if (!isUuid(id)) return json({ error: "Invalid ringtone id." }, 400);
        const url = new URL(request.url);
        const userId = url.searchParams.get("userId")?.trim() || "";
        if (userId) {
            await optionalMatchingUserId(request, userId, { route: "/api/ringtones/[id]/detail" });
        }

        const supabase = getSupabaseServerClient();
        const { data, error } = await supabase
            .from("ringtone_products")
            .select("id,creator_id,title,description,artwork_url,preview_url,duration_seconds,clip_start_seconds,clip_end_seconds,price_cents,currency,status,is_featured,is_explicit,source_song_id,source_kind,published_at,created_at,review_notes")
            .eq("id", id)
            .maybeSingle();
        if (error) return json({ error: getErrorMessage(error) }, 500);
        if (!data) return json({ error: "Ringtone not found." }, 404);

        const status = String(data.status || "") as RingtoneStatus;
        if (!isPublicRingtoneStatus(status)) {
            if (!userId || !isUuid(userId)) return json({ error: "Ringtone not found." }, 404);
            const auth = await requireMatchingUserId(request, "/api/ringtones/[id]/detail", userId);
            if (!auth.ok || data.creator_id !== userId) return json({ error: "Ringtone not found." }, 404);
        }

        const [profile, song, purchase, favorite, related, moreFromCreator, reviews] = await Promise.all([
            supabase.from("profiles").select("id,user_id,display_name,name,username").or(`id.eq.${data.creator_id},user_id.eq.${data.creator_id}`).limit(1),
            data.source_song_id
                ? supabase.from("songs").select("id,title,artist,cover_url,category,type").eq("id", data.source_song_id).maybeSingle()
                : Promise.resolve({ data: null }),
            userId && isUuid(userId)
                ? supabase.from("ringtone_purchases").select("id,payment_status,amount_cents,currency,purchased_at,payment_reference").eq("buyer_id", userId).eq("ringtone_id", id).eq("payment_status", "paid").maybeSingle()
                : Promise.resolve({ data: null }),
            userId && isUuid(userId)
                ? supabase.from("ringtone_favorites").select("id").eq("user_id", userId).eq("ringtone_id", id).maybeSingle()
                : Promise.resolve({ data: null }),
            supabase
                .from("ringtone_products")
                .select("id,title,artwork_url,price_cents,currency,duration_seconds,preview_url,clip_start_seconds,clip_end_seconds,is_explicit,creator_id")
                .in("status", ["published"])
                .neq("id", id)
                .order("published_at", { ascending: false, nullsFirst: false })
                .limit(8),
            supabase
                .from("ringtone_products")
                .select("id,title,artwork_url,price_cents,currency,duration_seconds,preview_url,clip_start_seconds,clip_end_seconds,is_explicit,creator_id")
                .in("status", ["published"])
                .eq("creator_id", data.creator_id)
                .neq("id", id)
                .order("published_at", { ascending: false, nullsFirst: false })
                .limit(8),
            supabase
                .from("ringtone_reviews")
                .select("rating")
                .eq("ringtone_id", id),
        ]);

        const profileRow = (profile.data || [])[0] as { display_name?: string; name?: string; username?: string } | undefined;
        const creatorName = String(profileRow?.display_name || profileRow?.name || profileRow?.username || "Creator");
        const reviewRows = reviews.data || [];
        const reviewCount = reviewRows.length;
        const averageRating = reviewCount
            ? Number((reviewRows.reduce((sum, row) => sum + Number(row.rating || 0), 0) / reviewCount).toFixed(2))
            : null;

        return json({
            ringtone: {
                ...data,
                creatorName,
                sourceSong: song.data || null,
                owned: Boolean(purchase.data),
                purchase: purchase.data || null,
                favorited: Boolean(favorite.data),
                reviewSummary: { count: reviewCount, averageRating },
            },
            relatedRingtones: related.data || [],
            moreFromCreator: moreFromCreator.data || [],
        });
    } catch (error) {
        console.error("[api/ringtones/:id/detail] GET failed:", error);
        return json({ error: getErrorMessage(error) }, 500);
    }
}
