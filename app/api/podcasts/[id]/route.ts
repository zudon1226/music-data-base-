import { NextResponse } from "next/server";
import { requirePodcastOwner } from "@/lib/podcast-access";
import { mapPodcastRows, PODCAST_EPISODE_COLUMNS, PODCAST_SHOW_COLUMNS } from "@/lib/podcast-data";
import { deletePodcastShowPermanently } from "@/lib/podcast-delete-lifecycle";
import { requirePodcastRequestCreator, requirePodcastRequestUser } from "@/lib/podcast-route-auth";
import { getErrorMessage, getSupabaseServerClient, isUuid } from "@/lib/server-supabase";
import { validatePodcastOwnedStoragePath } from "@/lib/podcast-validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonResponse(body: Record<string, unknown>, status = 200) {
    return NextResponse.json(body, { status });
}

function cleanText(value: unknown, maxLength: number) {
    return String(value || "").trim().slice(0, maxLength);
}

async function loadShow(showId: string) {
    return getSupabaseServerClient()
        .from("podcast_shows")
        .select(PODCAST_SHOW_COLUMNS)
        .eq("id", showId)
        .maybeSingle();
}

export async function GET(
    request: Request,
    context: { params: Promise<{ id: string }> },
) {
    try {
        const { id } = await context.params;
        if (!isUuid(id)) return jsonResponse({ error: "Invalid podcast id." }, 400);
        const showResult = await loadShow(id);
        if (showResult.error) return jsonResponse({ error: getErrorMessage(showResult.error) }, 500);
        if (!showResult.data) return jsonResponse({ error: "Podcast not found." }, 404);
        const showRow = showResult.data as unknown as Record<string, unknown>;
        const isPublic = showRow.status === "published";
        let canManage = false;
        if (!isPublic || new URL(request.url).searchParams.get("scope") === "mine") {
            const userId = new URL(request.url).searchParams.get("userId")?.trim() || "";
            const auth = await requirePodcastRequestUser(request, { userId }, `/api/podcasts/${id}`);
            if (!auth.ok) return jsonResponse({ error: auth.error }, auth.status);
            canManage = await requirePodcastOwner(auth.userId, showRow.user_id).then((result) => result.ok);
            if (!isPublic && !canManage) return jsonResponse({ error: "Podcast not found." }, 404);
        }
        const supabase = getSupabaseServerClient();
        let episodeQuery = supabase
            .from("podcast_episodes")
            .select(PODCAST_EPISODE_COLUMNS)
            .eq("podcast_id", id)
            .order("season_number", { ascending: false, nullsFirst: false })
            .order("episode_number", { ascending: false });
        if (!canManage) episodeQuery = episodeQuery.eq("status", "published");
        const episodeResult = await episodeQuery;
        if (episodeResult.error) return jsonResponse({ error: getErrorMessage(episodeResult.error) }, 500);
        const mapped = await mapPodcastRows({
            showRows: [showRow],
            episodeRows: (episodeResult.data || []) as unknown as Record<string, unknown>[],
        });
        return jsonResponse({
            show: canManage
                ? mapped.shows[0]
                : { ...mapped.shows[0], coverStoragePath: "" },
            episodes: canManage
                ? mapped.episodes
                : mapped.episodes.map((episode) => ({
                    ...episode,
                    mediaUrl: "",
                    storagePath: "",
                    artworkStoragePath: "",
                })),
            canManage,
        });
    }
    catch (error) {
        console.error("[api/podcasts/:id] GET failed:", error);
        return jsonResponse({ error: getErrorMessage(error) }, 500);
    }
}

export async function PATCH(
    request: Request,
    context: { params: Promise<{ id: string }> },
) {
    try {
        const { id } = await context.params;
        if (!isUuid(id)) return jsonResponse({ error: "Invalid podcast id." }, 400);
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const auth = await requirePodcastRequestCreator(request, body, `/api/podcasts/${id}`);
        if (!auth.ok) return jsonResponse({ error: auth.error }, auth.status);
        const showResult = await loadShow(id);
        if (showResult.error) return jsonResponse({ error: getErrorMessage(showResult.error) }, 500);
        if (!showResult.data) return jsonResponse({ error: "Podcast not found." }, 404);
        const showRow = showResult.data as unknown as Record<string, unknown>;
        const owner = await requirePodcastOwner(auth.userId, showRow.user_id);
        if (!owner.ok) return jsonResponse({ error: owner.error }, owner.status);

        const updates: Record<string, unknown> = {};
        if ("title" in body) {
            const title = cleanText(body.title, 160);
            if (!title) return jsonResponse({ error: "Podcast title is required." }, 400);
            updates.title = title;
        }
        if ("description" in body) updates.description = cleanText(body.description, 4000);
        if ("category" in body) updates.category = cleanText(body.category, 100) || "Podcast";
        if ("languageCode" in body || "language_code" in body) {
            updates.language_code = cleanText(body.languageCode || body.language_code, 20) || "en";
        }
        if ("explicitContent" in body || "explicit_content" in body) {
            updates.explicit_content = Boolean(body.explicitContent ?? body.explicit_content);
        }
        if ("coverImageUrl" in body || "cover_image_url" in body) {
            updates.cover_image_url = cleanText(body.coverImageUrl || body.cover_image_url, 1000);
        }
        if ("coverStoragePath" in body || "cover_storage_path" in body) {
            const path = cleanText(body.coverStoragePath || body.cover_storage_path, 700);
            if (path && !validatePodcastOwnedStoragePath(path, String(showRow.user_id)).ok) {
                return jsonResponse({ error: "Podcast cover path is not owned by the show creator." }, 403);
            }
            updates.cover_storage_path = path;
        }
        if ("status" in body) {
            const status = body.status === "published" ? "published" : body.status === "archived" ? "archived" : "draft";
            updates.status = status;
            updates.published_at = status === "published"
                ? String(showRow.published_at || new Date().toISOString())
                : null;
        }
        const result = await getSupabaseServerClient()
            .from("podcast_shows")
            .update(updates)
            .eq("id", id)
            .select(PODCAST_SHOW_COLUMNS)
            .single();
        if (result.error) return jsonResponse({ error: getErrorMessage(result.error) }, 500);
        const mapped = await mapPodcastRows({
            showRows: [result.data as unknown as Record<string, unknown>],
            episodeRows: [],
        });
        return jsonResponse({ ok: true, show: mapped.shows[0] });
    }
    catch (error) {
        console.error("[api/podcasts/:id] PATCH failed:", error);
        return jsonResponse({ error: getErrorMessage(error) }, 500);
    }
}

export async function DELETE(
    request: Request,
    context: { params: Promise<{ id: string }> },
) {
    try {
        const { id } = await context.params;
        if (!isUuid(id)) return jsonResponse({ error: "Invalid podcast id." }, 400);
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const auth = await requirePodcastRequestCreator(request, body, `/api/podcasts/${id}`);
        if (!auth.ok) return jsonResponse({ error: auth.error }, auth.status);
        const showResult = await loadShow(id);
        if (showResult.error) return jsonResponse({ error: getErrorMessage(showResult.error) }, 500);
        if (!showResult.data) return jsonResponse({ error: "Podcast not found." }, 404);
        const showRow = showResult.data as unknown as Record<string, unknown>;
        const owner = await requirePodcastOwner(auth.userId, showRow.user_id);
        if (!owner.ok) return jsonResponse({ error: owner.error }, owner.status);
        const rawCount = body.confirmEpisodeCount ?? body.confirm_episode_count;
        const confirmedEpisodeCount = rawCount === "" || rawCount == null ? null : Number(rawCount);
        const result = await deletePodcastShowPermanently({
            show: showRow,
            confirmedEpisodeCount,
        });
        if (!result.ok) return jsonResponse({ ...result }, result.status);
        return jsonResponse({ ...result });
    }
    catch (error) {
        console.error("[api/podcasts/:id] DELETE failed:", error);
        return jsonResponse({ error: getErrorMessage(error) }, 500);
    }
}
