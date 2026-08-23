import { NextResponse } from "next/server";
import {
    isPodcastCommentSetupMissing,
    loadPodcastCommentAuthors,
    PODCAST_COMMENT_REPORT_PREFIX,
    podcastCommentTitle,
} from "@/lib/podcast-comments";
import { requirePodcastRequestUser } from "@/lib/podcast-route-auth";
import { getErrorMessage, getSupabaseServerClient, isUuid } from "@/lib/server-supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonResponse(body: Record<string, unknown>, status = 200) {
    return NextResponse.json(body, { status });
}

function isDuplicateReport(error: unknown) {
    const message = getErrorMessage(error).toLowerCase();
    return message.includes("moderation_reports_comment_reporter_uidx")
        || message.includes("duplicate key")
        || message.includes("unique constraint");
}

export async function POST(
    request: Request,
    context: { params: Promise<{ id: string }> },
) {
    try {
        const { id } = await context.params;
        if (!isUuid(id)) return jsonResponse({ error: "Invalid Podcast comment id." }, 400);
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const auth = await requirePodcastRequestUser(request, body, "/api/podcasts/comments/report");
        if (!auth.ok) return jsonResponse({ error: auth.error }, auth.status);

        const supabase = getSupabaseServerClient();
        const existing = await supabase
            .from("podcast_episode_comments")
            .select("id,user_id,body,episode_id")
            .eq("id", id)
            .maybeSingle();
        if (existing.error) {
            return jsonResponse({
                error: getErrorMessage(existing.error),
                setupRequired: isPodcastCommentSetupMissing(existing.error),
            }, isPodcastCommentSetupMissing(existing.error) ? 409 : 500);
        }
        if (!existing.data) return jsonResponse({ error: "Podcast comment not found." }, 404);
        if (String(existing.data.user_id || "") === auth.userId) {
            return jsonResponse({ error: "You cannot report your own comment." }, 403);
        }

        const episode = await supabase
            .from("podcast_episodes")
            .select("id,title")
            .eq("id", String(existing.data.episode_id || ""))
            .maybeSingle();
        const details = String(body.details || body.reason || "").trim().slice(0, 500);
        const episodeId = String(episode.data?.id || existing.data.episode_id || "");
        const reason = [
            PODCAST_COMMENT_REPORT_PREFIX,
            `episode:${episodeId}`,
            `comment:${id}`,
            details,
        ].filter(Boolean).join(" | ");
        const authors = await loadPodcastCommentAuthors([auth.userId, String(existing.data.user_id || "")]);
        const reporterName = String(body.reporterName || "").trim().slice(0, 120)
            || authors.get(auth.userId)?.name
            || "";
        const targetUserName = String(body.targetUserName || "").trim().slice(0, 120)
            || authors.get(String(existing.data.user_id || ""))?.name
            || "";

        const inserted = await supabase
            .from("moderation_reports")
            .insert({
                reporter_id: auth.userId,
                reporter_name: reporterName,
                item_type: "comment",
                item_id: id,
                item_title: podcastCommentTitle(
                    String(existing.data.body || ""),
                    String(episode.data?.title || ""),
                    episodeId,
                ),
                reason,
                status: "open",
                target_user_id: String(existing.data.user_id || ""),
                target_user_name: targetUserName,
            })
            .select("id,item_type,item_id,item_title,reason,status,created_at")
            .single();
        if (inserted.error) {
            if (isDuplicateReport(inserted.error)) {
                return jsonResponse({ error: "You already reported this comment." }, 409);
            }
            return jsonResponse({ error: getErrorMessage(inserted.error) }, 500);
        }
        return jsonResponse({ ok: true, report: inserted.data }, 201);
    }
    catch (error) {
        console.error("[api/podcasts/comments/:id/report] POST failed:", error);
        return jsonResponse({ error: getErrorMessage(error) }, 500);
    }
}
