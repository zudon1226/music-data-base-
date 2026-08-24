import { NextResponse } from "next/server";
import { requirePodcastOwner } from "@/lib/podcast-access";
import { mapPodcastRows, PODCAST_EPISODE_COLUMNS, PODCAST_SHOW_COLUMNS } from "@/lib/podcast-data";
import { deletePodcastEpisodePermanently } from "@/lib/podcast-delete-lifecycle";
import { notifyPodcastFollowersOfPublishedEpisode } from "@/lib/podcast-notifications";
import { requirePodcastRequestCreator, requirePodcastRequestUser } from "@/lib/podcast-route-auth";
import { getErrorMessage, getSupabaseServerClient, isUuid } from "@/lib/server-supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonResponse(body: Record<string, unknown>, status = 200) {
    return NextResponse.json(body, { status });
}

function cleanText(value: unknown, maxLength: number) {
    return String(value || "").trim().slice(0, maxLength);
}

async function loadEpisode(episodeId: string) {
    return getSupabaseServerClient()
        .from("podcast_episodes")
        .select(PODCAST_EPISODE_COLUMNS)
        .eq("id", episodeId)
        .maybeSingle();
}

export async function GET(
    request: Request,
    context: { params: Promise<{ id: string }> },
) {
    try {
        const { id } = await context.params;
        if (!isUuid(id)) return jsonResponse({ error: "Invalid Podcast episode id." }, 400);
        const episodeResult = await loadEpisode(id);
        if (episodeResult.error) return jsonResponse({ error: getErrorMessage(episodeResult.error) }, 500);
        if (!episodeResult.data) return jsonResponse({ error: "Podcast episode not found." }, 404);
        const episodeRow = episodeResult.data as unknown as Record<string, unknown>;
        const supabase = getSupabaseServerClient();
        const showResult = await supabase
            .from("podcast_shows")
            .select(PODCAST_SHOW_COLUMNS)
            .eq("id", String(episodeRow.podcast_id || ""))
            .maybeSingle();
        if (showResult.error) return jsonResponse({ error: getErrorMessage(showResult.error) }, 500);
        if (!showResult.data) return jsonResponse({ error: "Podcast show not found." }, 404);
        const showRow = showResult.data as unknown as Record<string, unknown>;
        const isPublic = episodeRow.status === "published" && showRow.status === "published";
        let canManage = false;
        if (!isPublic) {
            const userId = new URL(request.url).searchParams.get("userId")?.trim() || "";
            const auth = await requirePodcastRequestUser(request, { userId }, `/api/podcasts/episodes/${id}`);
            if (!auth.ok) return jsonResponse({ error: "Podcast episode not found." }, 404);
            canManage = await requirePodcastOwner(auth.userId, episodeRow.user_id).then((result) => result.ok);
            if (!canManage) return jsonResponse({ error: "Podcast episode not found." }, 404);
        }
        const mapped = await mapPodcastRows({
            showRows: [showRow],
            episodeRows: [episodeRow],
        });
        const episode = mapped.episodes[0];
        const show = mapped.shows[0];
        if (!episode || !show) return jsonResponse({ error: "Podcast episode not found." }, 404);
        return jsonResponse({
            episode: canManage
                ? episode
                : {
                    ...episode,
                    mediaUrl: "",
                    storagePath: "",
                    artworkStoragePath: "",
                },
            show: canManage ? show : { ...show, coverStoragePath: "" },
            canManage,
        });
    }
    catch (error) {
        console.error("[api/podcasts/episodes/:id] GET failed:", error);
        return jsonResponse({ error: getErrorMessage(error) }, 500);
    }
}

export async function PATCH(
    request: Request,
    context: { params: Promise<{ id: string }> },
) {
    try {
        const { id } = await context.params;
        if (!isUuid(id)) return jsonResponse({ error: "Invalid Podcast episode id." }, 400);
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const auth = await requirePodcastRequestCreator(request, body, `/api/podcasts/episodes/${id}`);
        if (!auth.ok) return jsonResponse({ error: auth.error }, auth.status);
        const episodeResult = await loadEpisode(id);
        if (episodeResult.error) return jsonResponse({ error: getErrorMessage(episodeResult.error) }, 500);
        if (!episodeResult.data) return jsonResponse({ error: "Podcast episode not found." }, 404);
        const episodeRow = episodeResult.data as unknown as Record<string, unknown>;
        const previousStatus = String(episodeRow.status || "");
        const owner = await requirePodcastOwner(auth.userId, episodeRow.user_id);
        if (!owner.ok) return jsonResponse({ error: owner.error }, owner.status);

        const updates: Record<string, unknown> = {};
        if ("title" in body) {
            const title = cleanText(body.title, 200);
            if (!title) return jsonResponse({ error: "Episode title is required." }, 400);
            updates.title = title;
        }
        if ("description" in body) updates.description = cleanText(body.description, 8000);
        if ("episodeNumber" in body || "episode_number" in body) {
            const number = Number(body.episodeNumber ?? body.episode_number);
            if (!Number.isInteger(number) || number < 1) {
                return jsonResponse({ error: "Episode number must be 1 or greater." }, 400);
            }
            updates.episode_number = number;
        }
        if ("seasonNumber" in body || "season_number" in body) {
            const raw = body.seasonNumber ?? body.season_number;
            if (raw == null || raw === "") updates.season_number = null;
            else {
                const number = Number(raw);
                if (!Number.isInteger(number) || number < 1) {
                    return jsonResponse({ error: "Season number must be 1 or greater." }, 400);
                }
                updates.season_number = number;
            }
        }
        if ("artworkUrl" in body || "artwork_url" in body) {
            updates.artwork_url = cleanText(body.artworkUrl || body.artwork_url, 1000);
        }
        if ("thumbnailUrl" in body || "thumbnail_url" in body) {
            updates.thumbnail_url = cleanText(body.thumbnailUrl || body.thumbnail_url, 1000);
        }
        if ("status" in body) {
            const status = body.status === "published" ? "published" : body.status === "archived" ? "archived" : "draft";
            updates.status = status;
            updates.published_at = status === "published"
                ? String(episodeRow.published_at || new Date().toISOString())
                : null;
        }
        const supabase = getSupabaseServerClient();
        const updated = await supabase
            .from("podcast_episodes")
            .update(updates)
            .eq("id", id)
            .select(PODCAST_EPISODE_COLUMNS)
            .single();
        if (updated.error) return jsonResponse({ error: getErrorMessage(updated.error) }, 500);
        const updatedRow = updated.data as unknown as Record<string, unknown>;
        const showResult = await supabase
            .from("podcast_shows")
            .select(PODCAST_SHOW_COLUMNS)
            .eq("id", String(updatedRow.podcast_id))
            .maybeSingle();
        if (showResult.error || !showResult.data) {
            return jsonResponse({ error: getErrorMessage(showResult.error || "Podcast show not found.") }, 500);
        }
        const mapped = await mapPodcastRows({
            showRows: [showResult.data as unknown as Record<string, unknown>],
            episodeRows: [updatedRow],
        });
        const episode = mapped.episodes[0];
        const updatedStatus = String(updatedRow.status || episode?.status || "");
        if (previousStatus !== "published" && updatedStatus === "published" && episode) {
            try {
                await notifyPodcastFollowersOfPublishedEpisode({
                    episodeId: episode.id,
                    showTitle: episode.podcastTitle || String((showResult.data as { title?: string }).title || "Podcast"),
                    episodeTitle: episode.title,
                    episodeType: episode.episodeType,
                    creatorUserId: String((showResult.data as { user_id?: string }).user_id || episode.userId),
                });
            } catch (notifyError) {
                console.warn("[api/podcasts/episodes/:id] follower notifications failed:", notifyError);
            }
        }
        return jsonResponse({ ok: true, episode });
    }
    catch (error) {
        console.error("[api/podcasts/episodes/:id] PATCH failed:", error);
        return jsonResponse({ error: getErrorMessage(error) }, 500);
    }
}

export async function DELETE(
    request: Request,
    context: { params: Promise<{ id: string }> },
) {
    try {
        const { id } = await context.params;
        if (!isUuid(id)) return jsonResponse({ error: "Invalid Podcast episode id." }, 400);
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const auth = await requirePodcastRequestCreator(request, body, `/api/podcasts/episodes/${id}`);
        if (!auth.ok) return jsonResponse({ error: auth.error }, auth.status);
        const episodeResult = await loadEpisode(id);
        if (episodeResult.error) return jsonResponse({ error: getErrorMessage(episodeResult.error) }, 500);
        if (!episodeResult.data) return jsonResponse({ error: "Podcast episode not found." }, 404);
        const episodeRow = episodeResult.data as unknown as Record<string, unknown>;
        const owner = await requirePodcastOwner(auth.userId, episodeRow.user_id);
        if (!owner.ok) return jsonResponse({ error: owner.error }, owner.status);
        const result = await deletePodcastEpisodePermanently({
            episode: episodeRow,
        });
        if (!result.ok) return jsonResponse({ error: result.error }, result.status);
        return jsonResponse({ ok: true, removedStorage: result.removedStorage });
    }
    catch (error) {
        console.error("[api/podcasts/episodes/:id] DELETE failed:", error);
        return jsonResponse({ error: getErrorMessage(error) }, 500);
    }
}
