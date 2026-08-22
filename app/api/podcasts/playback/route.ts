import { NextResponse } from "next/server";
import { requirePodcastOwner } from "@/lib/podcast-access";
import { mapPodcastRows, PODCAST_EPISODE_COLUMNS, PODCAST_SHOW_COLUMNS } from "@/lib/podcast-data";
import { requirePodcastRequestUser } from "@/lib/podcast-route-auth";
import { getErrorMessage, getSupabaseServerClient, isUuid } from "@/lib/server-supabase";
import { getPodcastBucket, validatePodcastOwnedStoragePath } from "@/lib/podcast-validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonResponse(body: Record<string, unknown>, status = 200) {
    return NextResponse.json(body, { status });
}

export async function POST(request: Request) {
    try {
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const episodeId = String(body.episodeId || body.episode_id || "").trim();
        if (!isUuid(episodeId)) return jsonResponse({ error: "Invalid Podcast episode id." }, 400);
        const supabase = getSupabaseServerClient();
        const episodeResult = await supabase
            .from("podcast_episodes")
            .select(PODCAST_EPISODE_COLUMNS)
            .eq("id", episodeId)
            .maybeSingle();
        if (episodeResult.error) return jsonResponse({ error: getErrorMessage(episodeResult.error) }, 500);
        if (!episodeResult.data) return jsonResponse({ error: "Podcast episode not found." }, 404);
        const episodeRow = episodeResult.data as unknown as Record<string, unknown>;
        const showResult = await supabase
            .from("podcast_shows")
            .select(PODCAST_SHOW_COLUMNS)
            .eq("id", String(episodeRow.podcast_id))
            .maybeSingle();
        if (showResult.error) return jsonResponse({ error: getErrorMessage(showResult.error) }, 500);
        if (!showResult.data) return jsonResponse({ error: "Podcast show not found." }, 404);
        const showRow = showResult.data as unknown as Record<string, unknown>;
        const publicPlayback = episodeRow.status === "published" && showRow.status === "published";
        if (!publicPlayback) {
            const auth = await requirePodcastRequestUser(request, body, "/api/podcasts/playback");
            if (!auth.ok) return jsonResponse({ error: auth.error }, auth.status);
            const owner = await requirePodcastOwner(auth.userId, episodeRow.user_id);
            if (!owner.ok) return jsonResponse({ error: "Podcast episode not found." }, 404);
        }
        const episodeType = episodeRow.episode_type === "video" ? "video" : "audio";
        if (body.metricOnly === true) {
            if (!publicPlayback) {
                return jsonResponse({ error: "Podcast playback metrics are only recorded for published episodes." }, 409);
            }
            const metric = episodeType === "video" ? "view_count" : "play_count";
            const increment = await supabase.rpc("increment_podcast_episode_metric", {
                target_episode_id: episodeId,
                metric_name: metric,
            });
            if (increment.error) {
                console.warn("[api/podcasts/playback] metric increment failed:", increment.error);
            }
            return jsonResponse({ ok: true, counted: true, metric });
        }
        const storagePath = String(episodeRow.storage_path || "").trim();
        if (!storagePath) return jsonResponse({ error: "Podcast episode media is not ready." }, 409);
        const storageOwner = validatePodcastOwnedStoragePath(storagePath, String(episodeRow.user_id || ""));
        if (!storageOwner.ok) {
            return jsonResponse({ error: "Podcast episode media path is invalid." }, 409);
        }
        const bucket = getPodcastBucket(episodeType);
        const signed = await supabase.storage.from(bucket).createSignedUrl(storagePath, 60 * 60);
        if (signed.error || !signed.data?.signedUrl) {
            return jsonResponse({ error: "Podcast playback URL could not be created." }, 500);
        }
        const mapped = await mapPodcastRows({
            showRows: [showRow],
            episodeRows: [episodeRow],
        });
        const episode = mapped.episodes[0];
        return jsonResponse({
            ok: true,
            signedUrl: signed.data.signedUrl,
            expiresIn: 3600,
            bucket,
            episode: {
                ...episode,
                mediaUrl: "",
                storagePath: "",
                artworkStoragePath: "",
            },
        });
    }
    catch (error) {
        console.error("[api/podcasts/playback] POST failed:", error);
        return jsonResponse({ error: getErrorMessage(error) }, 500);
    }
}
