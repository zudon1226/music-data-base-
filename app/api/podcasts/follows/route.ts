import { NextResponse } from "next/server";
import {
    canFollowPodcastShow,
    isMissingPodcastShowFollowsTable,
    isPodcastShowFollowUuid,
    mapPodcastShowFollowShowIds,
} from "@/lib/podcast-show-follows";
import { requirePodcastRequestUser } from "@/lib/podcast-route-auth";
import { getErrorMessage, getSupabaseServerClient, isUuid } from "@/lib/server-supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonResponse(body: Record<string, unknown>, status = 200) {
    return NextResponse.json(body, { status });
}

async function countShowFollowers(showId: string) {
    const { count, error } = await getSupabaseServerClient()
        .from("podcast_show_follows")
        .select("id", { count: "exact", head: true })
        .eq("show_id", showId);
    if (error) {
        if (isMissingPodcastShowFollowsTable(error)) return { ok: true as const, count: 0 };
        return { ok: false as const, error: getErrorMessage(error) };
    }
    return { ok: true as const, count: count || 0 };
}

export async function GET(request: Request) {
    try {
        const params = new URL(request.url).searchParams;
        const userId = params.get("userId")?.trim() || "";
        const showId = params.get("showId")?.trim() || params.get("show_id")?.trim() || "";
        if (!userId || !isUuid(userId)) {
            return jsonResponse({ followedShowIds: [], isFollowing: false });
        }
        const auth = await requirePodcastRequestUser(request, { userId }, "/api/podcasts/follows");
        if (!auth.ok) return jsonResponse({ followedShowIds: [], isFollowing: false });

        const { data, error } = await getSupabaseServerClient()
            .from("podcast_show_follows")
            .select("show_id")
            .eq("user_id", auth.userId);
        if (error) {
            if (isMissingPodcastShowFollowsTable(error)) {
                return jsonResponse({ followedShowIds: [], isFollowing: false, setupRequired: true });
            }
            return jsonResponse({ error: getErrorMessage(error), followedShowIds: [], isFollowing: false }, 500);
        }

        const followedShowIds = mapPodcastShowFollowShowIds(data);
        const isFollowing = Boolean(showId && isPodcastShowFollowUuid(showId) && followedShowIds.includes(showId));
        return jsonResponse({ followedShowIds, isFollowing });
    }
    catch (error) {
        console.error("[api/podcasts/follows] GET failed:", error);
        return jsonResponse({ error: getErrorMessage(error), followedShowIds: [], isFollowing: false }, 500);
    }
}

export async function POST(request: Request) {
    try {
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const auth = await requirePodcastRequestUser(request, body, "/api/podcasts/follows");
        if (!auth.ok) return jsonResponse({ error: auth.error }, auth.status);
        const showId = String(body.showId || body.show_id || "").trim();
        if (!isUuid(showId)) return jsonResponse({ error: "Invalid Podcast show id." }, 400);
        const follow = body.follow !== false;
        const supabase = getSupabaseServerClient();
        const show = await supabase
            .from("podcast_shows")
            .select("id,user_id,status")
            .eq("id", showId)
            .maybeSingle();
        if (show.error) return jsonResponse({ error: getErrorMessage(show.error) }, 500);
        if (!show.data) return jsonResponse({ error: "Podcast show not found." }, 404);
        const ownerId = String((show.data as { user_id?: string }).user_id || "");
        const status = String((show.data as { status?: string }).status || "");
        if (!canFollowPodcastShow({ viewerUserId: auth.userId, ownerUserId: ownerId })) {
            return jsonResponse({ error: "You cannot follow your own podcast." }, 403);
        }
        if (follow && status !== "published") {
            return jsonResponse({ error: "Podcast show not found." }, 404);
        }

        if (follow) {
            const inserted = await supabase
                .from("podcast_show_follows")
                .upsert(
                    { show_id: showId, user_id: auth.userId },
                    { onConflict: "show_id,user_id", ignoreDuplicates: true },
                );
            if (inserted.error) {
                if (isMissingPodcastShowFollowsTable(inserted.error)) {
                    return jsonResponse({ error: getErrorMessage(inserted.error), setupRequired: true }, 409);
                }
                return jsonResponse({ error: getErrorMessage(inserted.error) }, 500);
            }
        }
        else {
            const removed = await supabase
                .from("podcast_show_follows")
                .delete()
                .eq("show_id", showId)
                .eq("user_id", auth.userId);
            if (removed.error) {
                if (isMissingPodcastShowFollowsTable(removed.error)) {
                    return jsonResponse({ error: getErrorMessage(removed.error), setupRequired: true }, 409);
                }
                return jsonResponse({ error: getErrorMessage(removed.error) }, 500);
            }
        }

        const counted = await countShowFollowers(showId);
        if (!counted.ok) return jsonResponse({ error: counted.error }, 500);
        return jsonResponse({
            ok: true,
            isFollowing: follow,
            followerCount: counted.count,
        });
    }
    catch (error) {
        console.error("[api/podcasts/follows] POST failed:", error);
        return jsonResponse({ error: getErrorMessage(error) }, 500);
    }
}
