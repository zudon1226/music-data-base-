import { NextResponse } from "next/server";
import { isAdminUserId } from "@/lib/admin-auth";
import { isPodcastCommentSetupMissing } from "@/lib/podcast-comments";
import { requirePodcastRequestUser } from "@/lib/podcast-route-auth";
import { getErrorMessage, getSupabaseServerClient, isUuid } from "@/lib/server-supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonResponse(body: Record<string, unknown>, status = 200) {
    return NextResponse.json(body, { status });
}

export async function DELETE(
    request: Request,
    context: { params: Promise<{ id: string }> },
) {
    try {
        const { id } = await context.params;
        if (!isUuid(id)) return jsonResponse({ error: "Invalid Podcast comment id." }, 400);
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const auth = await requirePodcastRequestUser(request, body, "/api/podcasts/comments");
        if (!auth.ok) return jsonResponse({ error: auth.error }, auth.status);

        const supabase = getSupabaseServerClient();
        const existing = await supabase
            .from("podcast_episode_comments")
            .select("id,user_id,episode_id")
            .eq("id", id)
            .maybeSingle();
        if (existing.error) {
            return jsonResponse({
                error: getErrorMessage(existing.error),
                setupRequired: isPodcastCommentSetupMissing(existing.error),
            }, isPodcastCommentSetupMissing(existing.error) ? 409 : 500);
        }
        if (!existing.data) return jsonResponse({ error: "Podcast comment not found." }, 404);

        const ownerId = String(existing.data.user_id || "");
        const isOwner = ownerId === auth.userId;
        const isAdmin = await isAdminUserId(auth.userId);
        if (!isOwner && !isAdmin) {
            return jsonResponse({ error: "You can only delete your own comments." }, 403);
        }

        const removed = await supabase
            .from("podcast_episode_comments")
            .delete()
            .eq("id", id);
        if (removed.error) return jsonResponse({ error: getErrorMessage(removed.error) }, 500);
        return jsonResponse({ ok: true, deleted: true, id });
    }
    catch (error) {
        console.error("[api/podcasts/comments/:id] DELETE failed:", error);
        return jsonResponse({ error: getErrorMessage(error) }, 500);
    }
}
