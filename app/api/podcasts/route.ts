import { NextResponse } from "next/server";
import { isAdminUserId } from "@/lib/admin-auth";
import { mapPodcastRows, PODCAST_EPISODE_COLUMNS, PODCAST_SHOW_COLUMNS } from "@/lib/podcast-data";
import { requirePodcastRequestCreator } from "@/lib/podcast-route-auth";
import { getErrorMessage, getSupabaseServerClient } from "@/lib/server-supabase";
import { isEpisodeShapedShowPayload, validatePodcastOwnedStoragePath } from "@/lib/podcast-validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonResponse(body: Record<string, unknown>, status = 200) {
    return NextResponse.json(body, { status });
}

function isPodcastSetupMissing(error: unknown) {
    const message = getErrorMessage(error).toLowerCase();
    return message.includes("podcast_shows")
        && (message.includes("does not exist") || message.includes("schema cache"));
}

function cleanText(value: unknown, maxLength: number) {
    return String(value || "").trim().slice(0, maxLength);
}

function serializePublicEpisode<T extends Record<string, unknown>>(episode: T) {
    return {
        ...episode,
        mediaUrl: "",
        storagePath: "",
        artworkStoragePath: "",
    };
}

export async function GET(request: Request) {
    try {
        const url = new URL(request.url);
        const scope = url.searchParams.get("scope") === "mine" ? "mine" : "public";
        const userId = url.searchParams.get("userId")?.trim() || "";
        const type = url.searchParams.get("type")?.trim().toLowerCase();
        const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") || 60)));
        let mineIsAdmin = false;
        if (scope === "mine") {
            const auth = await requirePodcastRequestCreator(request, { userId }, "/api/podcasts");
            if (!auth.ok) return jsonResponse({ error: auth.error }, auth.status);
            mineIsAdmin = await isAdminUserId(auth.userId);
        }

        const supabase = getSupabaseServerClient();
        let showQuery = supabase
            .from("podcast_shows")
            .select(PODCAST_SHOW_COLUMNS)
            .order("published_at", { ascending: false, nullsFirst: false })
            .order("created_at", { ascending: false })
            .limit(limit);
        if (scope === "mine" && !mineIsAdmin) showQuery = showQuery.eq("user_id", userId);
        else if (scope === "public") showQuery = showQuery.eq("status", "published");
        const showResult = await showQuery;
        if (showResult.error) {
            return jsonResponse({
                error: getErrorMessage(showResult.error),
                setupRequired: isPodcastSetupMissing(showResult.error),
                shows: [],
                episodes: [],
            }, isPodcastSetupMissing(showResult.error) ? 409 : 500);
        }
        const showRows = (showResult.data || []) as unknown as Record<string, unknown>[];
        const showIds = showRows.map((show) => String(show.id || "")).filter(Boolean);
        let episodeRows: Record<string, unknown>[] = [];
        if (showIds.length > 0) {
            let episodeQuery = supabase
                .from("podcast_episodes")
                .select(PODCAST_EPISODE_COLUMNS)
                .in("podcast_id", showIds)
                .order("published_at", { ascending: false, nullsFirst: false })
                .order("created_at", { ascending: false })
                .limit(limit);
            if (scope === "mine" && !mineIsAdmin) episodeQuery = episodeQuery.eq("user_id", userId);
            else episodeQuery = episodeQuery.eq("status", "published");
            if (type === "audio" || type === "video") {
                episodeQuery = episodeQuery.eq("episode_type", type);
            }
            const episodeResult = await episodeQuery;
            if (episodeResult.error) {
                return jsonResponse({ error: getErrorMessage(episodeResult.error), shows: [], episodes: [] }, 500);
            }
            episodeRows = (episodeResult.data || []) as unknown as Record<string, unknown>[];
        }
        const mapped = await mapPodcastRows({
            showRows,
            episodeRows,
            publishedOnly: scope === "public",
        });
        const publicShows = scope === "public"
            ? mapped.shows.filter((show) => {
                if ((show.episodeCount || 0) <= 0) return false;
                if (type === "audio" || type === "video") {
                    return episodeRows.some((episode) => String(episode.podcast_id) === show.id);
                }
                return true;
            })
            : mapped.shows;
        return jsonResponse({
            shows: scope === "public"
                ? publicShows.map((show) => ({ ...show, coverStoragePath: "" }))
                : publicShows,
            episodes: scope === "public"
                ? mapped.episodes.map((episode) => serializePublicEpisode(episode as unknown as Record<string, unknown>))
                : mapped.episodes,
        });
    }
    catch (error) {
        console.error("[api/podcasts] GET failed:", error);
        return jsonResponse({ error: getErrorMessage(error), shows: [], episodes: [] }, 500);
    }
}

export async function POST(request: Request) {
    try {
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const auth = await requirePodcastRequestCreator(request, body, "/api/podcasts");
        if (!auth.ok) return jsonResponse({ error: auth.error }, auth.status);
        if (isEpisodeShapedShowPayload(body)) {
            return jsonResponse({
                error: "Episode creation must use /api/podcasts/episodes with an existing show_id. This endpoint creates a Podcast show only.",
            }, 400);
        }
        const title = cleanText(body.title, 160);
        if (!title) return jsonResponse({ error: "Podcast title is required." }, 400);
        const coverStoragePath = cleanText(body.coverStoragePath || body.cover_storage_path, 700);
        if (coverStoragePath) {
            const ownerPath = validatePodcastOwnedStoragePath(coverStoragePath, auth.userId);
            if (!ownerPath.ok) return jsonResponse({ error: ownerPath.error }, 403);
        }
        const status = body.status === "published" ? "published" : "draft";
        const now = new Date().toISOString();
        const payload = {
            user_id: auth.userId,
            title,
            description: cleanText(body.description, 4000),
            cover_image_url: cleanText(body.coverImageUrl || body.cover_image_url, 1000),
            cover_storage_path: coverStoragePath,
            category: cleanText(body.category, 100) || "Podcast",
            language_code: cleanText(body.languageCode || body.language_code, 20) || "en",
            explicit_content: Boolean(body.explicitContent ?? body.explicit_content),
            status,
            published_at: status === "published" ? now : null,
        };
        const supabase = getSupabaseServerClient();
        const result = await supabase
            .from("podcast_shows")
            .insert(payload)
            .select(PODCAST_SHOW_COLUMNS)
            .single();
        if (result.error) {
            return jsonResponse({
                error: getErrorMessage(result.error),
                setupRequired: isPodcastSetupMissing(result.error),
            }, isPodcastSetupMissing(result.error) ? 409 : 500);
        }
        const mapped = await mapPodcastRows({
            showRows: [result.data as unknown as Record<string, unknown>],
            episodeRows: [],
        });
        return jsonResponse({ ok: true, show: mapped.shows[0] }, 201);
    }
    catch (error) {
        console.error("[api/podcasts] POST failed:", error);
        return jsonResponse({ error: getErrorMessage(error) }, 500);
    }
}
