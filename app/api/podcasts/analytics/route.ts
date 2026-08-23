import { NextResponse } from "next/server";
import { isAdminUserId } from "@/lib/admin-auth";
import { buildPodcastAnalytics } from "@/lib/podcast-analytics";
import { mapPodcastRows, PODCAST_EPISODE_COLUMNS, PODCAST_SHOW_COLUMNS } from "@/lib/podcast-data";
import { requirePodcastRequestCreator } from "@/lib/podcast-route-auth";
import { getErrorMessage, getSupabaseServerClient } from "@/lib/server-supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SHOW_LIMIT = 500;
const EPISODE_LIMIT = 2000;

function jsonResponse(body: Record<string, unknown>, status = 200) {
    return NextResponse.json(body, { status });
}

function isPodcastSetupMissing(error: unknown) {
    const message = getErrorMessage(error).toLowerCase();
    return message.includes("podcast_shows")
        && (message.includes("does not exist") || message.includes("schema cache"));
}

export async function GET(request: Request) {
    try {
        const userId = new URL(request.url).searchParams.get("userId")?.trim() || "";
        const auth = await requirePodcastRequestCreator(request, { userId }, "/api/podcasts/analytics");
        if (!auth.ok) return jsonResponse({ error: auth.error }, auth.status);

        const ownerUserId = auth.userId;
        const mineIsAdmin = await isAdminUserId(ownerUserId);
        const supabase = getSupabaseServerClient();

        let showQuery = supabase
            .from("podcast_shows")
            .select(PODCAST_SHOW_COLUMNS)
            .order("created_at", { ascending: false })
            .limit(SHOW_LIMIT);
        if (!mineIsAdmin) showQuery = showQuery.eq("user_id", ownerUserId);

        const showResult = await showQuery;
        if (showResult.error) {
            return jsonResponse({
                error: getErrorMessage(showResult.error),
                setupRequired: isPodcastSetupMissing(showResult.error),
            }, isPodcastSetupMissing(showResult.error) ? 409 : 500);
        }

        const showRows = (showResult.data || []) as unknown as Record<string, unknown>[];
        const scopedShowRows = mineIsAdmin
            ? showRows
            : showRows.filter((row) => String(row.user_id || "") === ownerUserId);
        const showIds = scopedShowRows.map((show) => String(show.id || "")).filter(Boolean);

        let episodeRows: Record<string, unknown>[] = [];
        if (showIds.length > 0) {
            let episodeQuery = supabase
                .from("podcast_episodes")
                .select(PODCAST_EPISODE_COLUMNS)
                .in("podcast_id", showIds)
                .order("created_at", { ascending: false })
                .limit(EPISODE_LIMIT);
            if (!mineIsAdmin) episodeQuery = episodeQuery.eq("user_id", ownerUserId);
            const episodeResult = await episodeQuery;
            if (episodeResult.error) {
                return jsonResponse({ error: getErrorMessage(episodeResult.error) }, 500);
            }
            episodeRows = ((episodeResult.data || []) as unknown as Record<string, unknown>[]).filter((row) => {
                const podcastId = String(row.podcast_id || "");
                if (!showIds.includes(podcastId)) return false;
                return mineIsAdmin || String(row.user_id || "") === ownerUserId;
            });
        }

        const mapped = await mapPodcastRows({
            showRows: scopedShowRows,
            episodeRows,
            publishedOnly: false,
        });
        const ownedShows = mineIsAdmin
            ? mapped.shows
            : mapped.shows.filter((show) => show.userId === ownerUserId);
        const ownedShowIds = new Set(ownedShows.map((show) => show.id));
        const ownedEpisodes = mapped.episodes.filter((episode) => (
            ownedShowIds.has(episode.podcastId)
            && (mineIsAdmin || episode.userId === ownerUserId)
        ));

        return jsonResponse({
            ok: true,
            analytics: buildPodcastAnalytics(ownedShows, ownedEpisodes),
        });
    }
    catch (error) {
        console.error("[api/podcasts/analytics] GET failed:", error);
        return jsonResponse({ error: getErrorMessage(error) }, 500);
    }
}
