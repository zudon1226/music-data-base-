import { NextResponse } from "next/server";
import { isAdminUserId } from "@/lib/admin-auth";
import { buildMixtapeAnalytics } from "@/lib/mixtape-analytics";
import { mapMixtapeRows, MIXTAPE_COLUMNS, MIXTAPE_TRACK_COLUMNS } from "@/lib/mixtape-data";
import { requireMixtapeRequestCreator } from "@/lib/mixtape-route-auth";
import { getErrorMessage, getSupabaseServerClient } from "@/lib/server-supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MIXTAPE_LIMIT = 500;
const TRACK_LIMIT = 2000;

function jsonResponse(body: Record<string, unknown>, status = 200) {
    return NextResponse.json(body, { status });
}

function isMixtapeSetupMissing(error: unknown) {
    const message = getErrorMessage(error).toLowerCase();
    return message.includes("mixtapes")
        && (message.includes("does not exist") || message.includes("schema cache"));
}

export async function GET(request: Request) {
    try {
        const userId = new URL(request.url).searchParams.get("userId")?.trim() || "";
        const auth = await requireMixtapeRequestCreator(request, { userId }, "/api/mixtapes/analytics");
        if (!auth.ok) return jsonResponse({ error: auth.error }, auth.status);

        const ownerUserId = auth.userId;
        const mineIsAdmin = await isAdminUserId(ownerUserId);
        const supabase = getSupabaseServerClient();

        let mixtapeQuery = supabase
            .from("mixtapes")
            .select(MIXTAPE_COLUMNS)
            .order("created_at", { ascending: false })
            .limit(MIXTAPE_LIMIT);
        if (!mineIsAdmin) mixtapeQuery = mixtapeQuery.eq("user_id", ownerUserId);

        const mixtapeResult = await mixtapeQuery;
        if (mixtapeResult.error) {
            return jsonResponse({
                error: getErrorMessage(mixtapeResult.error),
                setupRequired: isMixtapeSetupMissing(mixtapeResult.error),
            }, isMixtapeSetupMissing(mixtapeResult.error) ? 409 : 500);
        }

        const mixtapeRows = (mixtapeResult.data || []) as unknown as Record<string, unknown>[];
        const scopedMixtapeRows = mineIsAdmin
            ? mixtapeRows
            : mixtapeRows.filter((row) => String(row.user_id || "") === ownerUserId);
        const mixtapeIds = scopedMixtapeRows.map((mixtape) => String(mixtape.id || "")).filter(Boolean);

        let trackRows: Record<string, unknown>[] = [];
        if (mixtapeIds.length > 0) {
            let trackQuery = supabase
                .from("mixtape_tracks")
                .select(MIXTAPE_TRACK_COLUMNS)
                .in("mixtape_id", mixtapeIds)
                .order("position", { ascending: true })
                .limit(TRACK_LIMIT);
            if (!mineIsAdmin) trackQuery = trackQuery.eq("user_id", ownerUserId);
            const trackResult = await trackQuery;
            if (trackResult.error) {
                return jsonResponse({ error: getErrorMessage(trackResult.error) }, 500);
            }
            trackRows = ((trackResult.data || []) as unknown as Record<string, unknown>[]).filter((row) => {
                const mixtapeId = String(row.mixtape_id || "");
                if (!mixtapeIds.includes(mixtapeId)) return false;
                return mineIsAdmin || String(row.user_id || "") === ownerUserId;
            });
        }

        const mapped = await mapMixtapeRows({
            mixtapeRows: scopedMixtapeRows,
            trackRows,
            publishedOnly: false,
        });
        const ownedMixtapes = mineIsAdmin
            ? mapped.mixtapes
            : mapped.mixtapes.filter((mixtape) => mixtape.userId === ownerUserId);
        const ownedIds = new Set(ownedMixtapes.map((mixtape) => mixtape.id));
        const ownedTracks = mapped.tracks.filter((track) => (
            ownedIds.has(track.mixtapeId)
            && (mineIsAdmin || track.userId === ownerUserId)
        ));

        let qualifiedPlays: number | null = null;
        const ownedIdList = [...ownedIds];
        if (ownedIdList.length > 0) {
            const { count, error: qualifiedError } = await supabase
                .from("mixtape_plays")
                .select("id", { count: "exact", head: true })
                .in("mixtape_id", ownedIdList);
            if (!qualifiedError) qualifiedPlays = Math.max(0, Number(count) || 0);
        }

        return jsonResponse({
            ok: true,
            analytics: buildMixtapeAnalytics(ownedMixtapes, ownedTracks, { qualifiedPlays }),
        });
    }
    catch (error) {
        console.error("[api/mixtapes/analytics] GET failed:", error);
        return jsonResponse({ error: getErrorMessage(error) }, 500);
    }
}