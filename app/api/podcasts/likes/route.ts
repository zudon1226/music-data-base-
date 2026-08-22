import { NextResponse } from "next/server";
import { requirePodcastRequestUser } from "@/lib/podcast-route-auth";
import { getErrorMessage, getSupabaseServerClient, isUuid } from "@/lib/server-supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonResponse(body: Record<string, unknown>, status = 200) {
    return NextResponse.json(body, { status });
}

function isMissingLikesTable(error: unknown) {
    const message = getErrorMessage(error).toLowerCase();
    return message.includes("podcast_episode_likes")
        && (message.includes("does not exist") || message.includes("schema cache"));
}

export async function GET(request: Request) {
    try {
        const userId = new URL(request.url).searchParams.get("userId")?.trim() || "";
        if (!userId || !isUuid(userId)) return jsonResponse({ likedEpisodeIds: [] });
        const auth = await requirePodcastRequestUser(request, { userId }, "/api/podcasts/likes");
        if (!auth.ok) return jsonResponse({ likedEpisodeIds: [] });
        const { data, error } = await getSupabaseServerClient()
            .from("podcast_episode_likes")
            .select("episode_id")
            .eq("user_id", auth.userId);
        if (error) {
            if (isMissingLikesTable(error)) {
                return jsonResponse({ likedEpisodeIds: [], setupRequired: true });
            }
            return jsonResponse({ error: getErrorMessage(error), likedEpisodeIds: [] }, 500);
        }
        return jsonResponse({
            likedEpisodeIds: (data || [])
                .map((row) => String((row as { episode_id?: string }).episode_id || ""))
                .filter(Boolean),
        });
    }
    catch (error) {
        console.error("[api/podcasts/likes] GET failed:", error);
        return jsonResponse({ error: getErrorMessage(error), likedEpisodeIds: [] }, 500);
    }
}

export async function POST(request: Request) {
    try {
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const auth = await requirePodcastRequestUser(request, body, "/api/podcasts/likes");
        if (!auth.ok) return jsonResponse({ error: auth.error }, auth.status);
        const episodeId = String(body.episodeId || body.episode_id || "").trim();
        if (!isUuid(episodeId)) return jsonResponse({ error: "Invalid Podcast episode id." }, 400);
        const like = body.like !== false;
        const supabase = getSupabaseServerClient();
        const episode = await supabase
            .from("podcast_episodes")
            .select("id,status")
            .eq("id", episodeId)
            .maybeSingle();
        if (episode.error) return jsonResponse({ error: getErrorMessage(episode.error) }, 500);
        if (!episode.data) return jsonResponse({ error: "Podcast episode not found." }, 404);

        if (like) {
            const inserted = await supabase
                .from("podcast_episode_likes")
                .upsert(
                    { episode_id: episodeId, user_id: auth.userId },
                    { onConflict: "episode_id,user_id", ignoreDuplicates: true },
                );
            if (inserted.error) {
                if (isMissingLikesTable(inserted.error)) {
                    return jsonResponse({ error: getErrorMessage(inserted.error), setupRequired: true }, 409);
                }
                return jsonResponse({ error: getErrorMessage(inserted.error) }, 500);
            }
        }
        else {
            const removed = await supabase
                .from("podcast_episode_likes")
                .delete()
                .eq("episode_id", episodeId)
                .eq("user_id", auth.userId);
            if (removed.error) {
                if (isMissingLikesTable(removed.error)) {
                    return jsonResponse({ error: getErrorMessage(removed.error), setupRequired: true }, 409);
                }
                return jsonResponse({ error: getErrorMessage(removed.error) }, 500);
            }
        }

        const { count, error: countError } = await supabase
            .from("podcast_episode_likes")
            .select("id", { count: "exact", head: true })
            .eq("episode_id", episodeId);
        if (countError && !isMissingLikesTable(countError)) {
            return jsonResponse({ error: getErrorMessage(countError) }, 500);
        }
        return jsonResponse({
            ok: true,
            liked: like,
            likeCount: count || 0,
        });
    }
    catch (error) {
        console.error("[api/podcasts/likes] POST failed:", error);
        return jsonResponse({ error: getErrorMessage(error) }, 500);
    }
}
