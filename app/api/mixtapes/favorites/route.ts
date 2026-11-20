import { NextResponse } from "next/server";
import { requireMixtapeRequestUser } from "@/lib/mixtape-route-auth";
import { getErrorMessage, getSupabaseServerClient, isUuid } from "@/lib/server-supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonResponse(body: Record<string, unknown>, status = 200) {
    return NextResponse.json(body, { status });
}

function isMissingFavoritesTable(error: unknown) {
    const message = getErrorMessage(error).toLowerCase();
    return message.includes("mixtape_favorites")
        && (message.includes("does not exist") || message.includes("schema cache"));
}

async function refreshFavoriteCount(mixtapeId: string) {
    const supabase = getSupabaseServerClient();
    const { count, error } = await supabase
        .from("mixtape_favorites")
        .select("id", { count: "exact", head: true })
        .eq("mixtape_id", mixtapeId);
    if (error) return;
    await supabase
        .from("mixtapes")
        .update({ favorite_count: count || 0 })
        .eq("id", mixtapeId);
}

export async function GET(request: Request) {
    try {
        const userId = new URL(request.url).searchParams.get("userId")?.trim() || "";
        if (!userId || !isUuid(userId)) return jsonResponse({ favoriteMixtapeIds: [] });
        const auth = await requireMixtapeRequestUser(request, { userId }, "/api/mixtapes/favorites");
        if (!auth.ok) return jsonResponse({ favoriteMixtapeIds: [] });
        const { data, error } = await getSupabaseServerClient()
            .from("mixtape_favorites")
            .select("mixtape_id")
            .eq("user_id", auth.userId);
        if (error) {
            if (isMissingFavoritesTable(error)) {
                return jsonResponse({ favoriteMixtapeIds: [], setupRequired: true });
            }
            return jsonResponse({ error: getErrorMessage(error), favoriteMixtapeIds: [] }, 500);
        }
        return jsonResponse({
            favoriteMixtapeIds: (data || [])
                .map((row) => String((row as { mixtape_id?: string }).mixtape_id || ""))
                .filter(Boolean),
        });
    }
    catch (error) {
        console.error("[api/mixtapes/favorites] GET failed:", error);
        return jsonResponse({ error: getErrorMessage(error), favoriteMixtapeIds: [] }, 500);
    }
}

export async function POST(request: Request) {
    try {
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const auth = await requireMixtapeRequestUser(request, body, "/api/mixtapes/favorites");
        if (!auth.ok) return jsonResponse({ error: auth.error }, auth.status);
        const mixtapeId = String(body.mixtapeId || body.mixtape_id || "").trim();
        if (!isUuid(mixtapeId)) return jsonResponse({ error: "Invalid mixtape id." }, 400);
        const favorite = body.favorite !== false;
        const supabase = getSupabaseServerClient();
        const mixtape = await supabase
            .from("mixtapes")
            .select("id,status,moderation_state")
            .eq("id", mixtapeId)
            .maybeSingle();
        if (mixtape.error) return jsonResponse({ error: getErrorMessage(mixtape.error) }, 500);
        if (!mixtape.data) return jsonResponse({ error: "Mixtape not found." }, 404);
        const row = mixtape.data as { status?: string; moderation_state?: string };
        if (row.status !== "published" || row.moderation_state !== "clear") {
            return jsonResponse({ error: "Only published mixtapes can be favorited." }, 409);
        }

        if (favorite) {
            const inserted = await supabase
                .from("mixtape_favorites")
                .upsert(
                    { mixtape_id: mixtapeId, user_id: auth.userId },
                    { onConflict: "mixtape_id,user_id", ignoreDuplicates: true },
                );
            if (inserted.error) {
                if (isMissingFavoritesTable(inserted.error)) {
                    return jsonResponse({ error: getErrorMessage(inserted.error), setupRequired: true }, 409);
                }
                return jsonResponse({ error: getErrorMessage(inserted.error) }, 500);
            }
        }
        else {
            const removed = await supabase
                .from("mixtape_favorites")
                .delete()
                .eq("mixtape_id", mixtapeId)
                .eq("user_id", auth.userId);
            if (removed.error) {
                if (isMissingFavoritesTable(removed.error)) {
                    return jsonResponse({ error: getErrorMessage(removed.error), setupRequired: true }, 409);
                }
                return jsonResponse({ error: getErrorMessage(removed.error) }, 500);
            }
        }

        await refreshFavoriteCount(mixtapeId);
        const { count } = await supabase
            .from("mixtape_favorites")
            .select("id", { count: "exact", head: true })
            .eq("mixtape_id", mixtapeId);
        return jsonResponse({
            ok: true,
            favorited: favorite,
            favoriteCount: count || 0,
        });
    }
    catch (error) {
        console.error("[api/mixtapes/favorites] POST failed:", error);
        return jsonResponse({ error: getErrorMessage(error) }, 500);
    }
}