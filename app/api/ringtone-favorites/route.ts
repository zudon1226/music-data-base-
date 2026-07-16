import { NextResponse } from "next/server";
import { PUBLIC_RINGTONE_STATUSES } from "@/lib/ringtone-constants";
import { requireMatchingUserId } from "@/lib/request-auth";
import { getErrorMessage, getSupabaseServerClient, isUuid } from "@/lib/server-supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(body: Record<string, unknown>, status = 200) {
    return NextResponse.json(body, { status });
}

export async function GET(request: Request) {
    try {
        const userId = new URL(request.url).searchParams.get("userId")?.trim() || "";
        if (!userId || !isUuid(userId)) return json({ favoriteRingtoneIds: [] });
        const auth = await requireMatchingUserId(request, "/api/ringtone-favorites", userId);
        if (!auth.ok) return json({ favoriteRingtoneIds: [] });

        const supabase = getSupabaseServerClient();
        const includeProducts = new URL(request.url).searchParams.get("includeProducts") === "1";
        const { data, error } = await supabase
            .from("ringtone_favorites")
            .select("ringtone_id,created_at")
            .eq("user_id", userId)
            .order("created_at", { ascending: false });
        if (error) return json({ error: getErrorMessage(error) }, 500);
        const favoriteRingtoneIds = (data || []).map((row) => row.ringtone_id).filter(Boolean);
        if (!includeProducts) return json({ favoriteRingtoneIds });

        const products = favoriteRingtoneIds.length
            ? await supabase
                .from("ringtone_products")
                .select("id,title,artwork_url,preview_url,duration_seconds,clip_start_seconds,clip_end_seconds,price_cents,currency,status,is_explicit,creator_id,published_at")
                .in("id", favoriteRingtoneIds)
                .in("status", [...PUBLIC_RINGTONE_STATUSES])
            : { data: [] as Record<string, unknown>[] };

        return json({
            favoriteRingtoneIds,
            favorites: products.data || [],
        });
    } catch (error) {
        console.error("[api/ringtone-favorites] GET failed:", error);
        return json({ error: getErrorMessage(error) }, 500);
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json().catch(() => ({})) as Record<string, unknown>;
        const userId = String(body.userId || body.sessionUserId || "").trim();
        const ringtoneId = String(body.ringtoneId || "").trim();
        const favorite = body.favorite !== false;
        if (!userId || !isUuid(userId)) return json({ error: "userId is required." }, 400);
        if (!ringtoneId || !isUuid(ringtoneId)) return json({ error: "ringtoneId is required." }, 400);

        const auth = await requireMatchingUserId(request, "/api/ringtone-favorites", userId);
        if (!auth.ok) return json({ error: auth.error }, auth.status);

        const supabase = getSupabaseServerClient();
        if (!favorite) {
            const { error } = await supabase
                .from("ringtone_favorites")
                .delete()
                .eq("user_id", userId)
                .eq("ringtone_id", ringtoneId);
            if (error) return json({ error: getErrorMessage(error) }, 500);
            return json({ favorite: false, ringtoneId });
        }

        const product = await supabase
            .from("ringtone_products")
            .select("id,status")
            .eq("id", ringtoneId)
            .maybeSingle();
        if (product.error) return json({ error: getErrorMessage(product.error) }, 500);
        if (!product.data || !(PUBLIC_RINGTONE_STATUSES as readonly string[]).includes(String(product.data.status))) {
            return json({ error: "Only published or approved ringtones can be favorited." }, 403);
        }

        const { error } = await supabase.from("ringtone_favorites").upsert({
            user_id: userId,
            ringtone_id: ringtoneId,
        }, { onConflict: "ringtone_id,user_id" });
        if (error) return json({ error: getErrorMessage(error) }, 500);
        return json({ favorite: true, ringtoneId });
    } catch (error) {
        console.error("[api/ringtone-favorites] POST failed:", error);
        return json({ error: getErrorMessage(error) }, 500);
    }
}
