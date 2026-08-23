import { NextResponse } from "next/server";
import { isAdminUserId } from "@/lib/admin-auth";
import {
    cleanPodcastCommentBody,
    isPodcastCommentSetupMissing,
    loadPodcastCommentAuthors,
    mapPodcastCommentRow,
} from "@/lib/podcast-comments";
import { requirePodcastRequestUser } from "@/lib/podcast-route-auth";
import { getErrorMessage, getSupabaseServerClient, isUuid } from "@/lib/server-supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COMMENT_COLUMNS = "id,episode_id,user_id,body,created_at,updated_at";

function jsonResponse(body: Record<string, unknown>, status = 200) {
    return NextResponse.json(body, { status });
}

async function optionalViewer(request: Request) {
    const userId = new URL(request.url).searchParams.get("userId")?.trim() || "";
    if (!isUuid(userId)) return { userId: "", isAdmin: false };
    const auth = await requirePodcastRequestUser(request, { userId }, "/api/podcasts/episodes/comments");
    if (!auth.ok) return { userId: "", isAdmin: false };
    return { userId: auth.userId, isAdmin: await isAdminUserId(auth.userId) };
}

async function loadPublishedEpisode(episodeId: string) {
    return getSupabaseServerClient()
        .from("podcast_episodes")
        .select("id,title,status,user_id")
        .eq("id", episodeId)
        .maybeSingle();
}

export async function GET(
    request: Request,
    context: { params: Promise<{ id: string }> },
) {
    try {
        const { id } = await context.params;
        if (!isUuid(id)) return jsonResponse({ error: "Invalid Podcast episode id.", comments: [] }, 400);
        const episodeResult = await loadPublishedEpisode(id);
        if (episodeResult.error) {
            return jsonResponse({
                error: getErrorMessage(episodeResult.error),
                setupRequired: isPodcastCommentSetupMissing(episodeResult.error),
                comments: [],
            }, isPodcastCommentSetupMissing(episodeResult.error) ? 409 : 500);
        }
        if (!episodeResult.data) return jsonResponse({ error: "Podcast episode not found.", comments: [] }, 404);
        if (String(episodeResult.data.status || "") !== "published") {
            const viewer = await optionalViewer(request);
            const ownerId = String(episodeResult.data.user_id || "");
            if (!viewer.isAdmin && viewer.userId !== ownerId) {
                return jsonResponse({ comments: [], episodeId: id });
            }
        }

        const supabase = getSupabaseServerClient();
        const commentsResult = await supabase
            .from("podcast_episode_comments")
            .select(COMMENT_COLUMNS)
            .eq("episode_id", id)
            .order("created_at", { ascending: false })
            .limit(200);
        if (commentsResult.error) {
            return jsonResponse({
                error: getErrorMessage(commentsResult.error),
                setupRequired: isPodcastCommentSetupMissing(commentsResult.error),
                comments: [],
            }, isPodcastCommentSetupMissing(commentsResult.error) ? 409 : 500);
        }

        const rows = (commentsResult.data || []) as Record<string, unknown>[];
        const authors = await loadPodcastCommentAuthors(rows.map((row) => String(row.user_id || "")));
        const viewer = await optionalViewer(request);
        return jsonResponse({
            comments: rows.map((row) => mapPodcastCommentRow(
                row,
                authors.get(String(row.user_id || "")),
                viewer.userId,
                viewer.isAdmin,
            )),
        });
    }
    catch (error) {
        console.error("[api/podcasts/episodes/:id/comments] GET failed:", error);
        return jsonResponse({ error: getErrorMessage(error), comments: [] }, 500);
    }
}

export async function POST(
    request: Request,
    context: { params: Promise<{ id: string }> },
) {
    try {
        const { id } = await context.params;
        if (!isUuid(id)) return jsonResponse({ error: "Invalid Podcast episode id." }, 400);
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const auth = await requirePodcastRequestUser(request, body, "/api/podcasts/episodes/comments");
        if (!auth.ok) return jsonResponse({ error: auth.error }, auth.status);

        const text = cleanPodcastCommentBody(body.body ?? body.text ?? body.comment);
        if (!text) return jsonResponse({ error: "Write a comment first." }, 400);

        const episodeResult = await loadPublishedEpisode(id);
        if (episodeResult.error) {
            return jsonResponse({
                error: getErrorMessage(episodeResult.error),
                setupRequired: isPodcastCommentSetupMissing(episodeResult.error),
            }, isPodcastCommentSetupMissing(episodeResult.error) ? 409 : 500);
        }
        if (!episodeResult.data || String(episodeResult.data.status || "") !== "published") {
            return jsonResponse({ error: "Podcast episode not found." }, 404);
        }

        const supabase = getSupabaseServerClient();
        const inserted = await supabase
            .from("podcast_episode_comments")
            .insert({
                episode_id: id,
                user_id: auth.userId,
                body: text,
            })
            .select(COMMENT_COLUMNS)
            .single();
        if (inserted.error) {
            return jsonResponse({
                error: getErrorMessage(inserted.error),
                setupRequired: isPodcastCommentSetupMissing(inserted.error),
            }, isPodcastCommentSetupMissing(inserted.error) ? 409 : 500);
        }

        const authors = await loadPodcastCommentAuthors([auth.userId]);
        return jsonResponse({
            ok: true,
            comment: mapPodcastCommentRow(
                inserted.data as unknown as Record<string, unknown>,
                authors.get(auth.userId),
                auth.userId,
                false,
            ),
        }, 201);
    }
    catch (error) {
        console.error("[api/podcasts/episodes/:id/comments] POST failed:", error);
        return jsonResponse({ error: getErrorMessage(error) }, 500);
    }
}
