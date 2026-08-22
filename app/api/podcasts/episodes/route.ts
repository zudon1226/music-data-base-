import { NextResponse } from "next/server";
import { requirePodcastOwner } from "@/lib/podcast-access";
import { mapPodcastRows, PODCAST_EPISODE_COLUMNS, PODCAST_SHOW_COLUMNS } from "@/lib/podcast-data";
import { requirePodcastRequestCreator } from "@/lib/podcast-route-auth";
import { verifyPodcastStoredMedia } from "@/lib/podcast-storage-verification";
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

function positiveInteger(value: unknown, required: boolean) {
    if (value == null || value === "") return required ? null : 0;
    const number = Number(value);
    return Number.isInteger(number) && number >= 1 ? number : null;
}

export async function POST(request: Request) {
    try {
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const auth = await requirePodcastRequestCreator(
            request,
            body,
            "/api/podcasts/episodes",
            { requireUploadUnlocked: true },
        );
        if (!auth.ok) return jsonResponse({ error: auth.error }, auth.status);
        const podcastId = cleanText(body.podcastId || body.podcast_id, 100);
        if (!isUuid(podcastId)) return jsonResponse({ error: "Choose a valid Podcast show." }, 400);
        const supabase = getSupabaseServerClient();
        const showResult = await supabase
            .from("podcast_shows")
            .select(PODCAST_SHOW_COLUMNS)
            .eq("id", podcastId)
            .maybeSingle();
        if (showResult.error) return jsonResponse({ error: getErrorMessage(showResult.error) }, 500);
        if (!showResult.data) return jsonResponse({ error: "Podcast show not found." }, 404);
        const showRow = showResult.data as unknown as Record<string, unknown>;
        const owner = await requirePodcastOwner(auth.userId, showRow.user_id);
        if (!owner.ok) return jsonResponse({ error: owner.error }, owner.status);

        const title = cleanText(body.title, 200);
        if (!title) return jsonResponse({ error: "Episode title is required." }, 400);
        const episodeNumber = positiveInteger(body.episodeNumber ?? body.episode_number, true);
        const seasonValue = body.seasonNumber ?? body.season_number;
        const seasonNumber = seasonValue == null || seasonValue === ""
            ? null
            : positiveInteger(seasonValue, false);
        if (!episodeNumber) return jsonResponse({ error: "Episode number must be 1 or greater." }, 400);
        if (seasonValue != null && seasonValue !== "" && !seasonNumber) {
            return jsonResponse({ error: "Season number must be 1 or greater." }, 400);
        }
        const episodeType = body.episodeType === "video" || body.episode_type === "video" ? "video" : "audio";
        const storagePath = cleanText(body.storagePath || body.storage_path, 700);
        const fileName = cleanText(body.fileName || body.file_name, 300);
        const contentType = cleanText(body.mimeType || body.mime_type, 150);
        const fileSize = Number(body.fileSize ?? body.file_size ?? 0);
        const verification = await verifyPodcastStoredMedia({
            supabase,
            userId: String(showRow.user_id),
            episodeType,
            storagePath,
            fileName,
            contentType,
            fileSize,
        });
        if (!verification.ok) return jsonResponse({ error: verification.error, verification }, 400);

        const artworkStoragePath = cleanText(body.artworkStoragePath || body.artwork_storage_path, 700);
        if (artworkStoragePath) {
            const artworkOwner = validatePodcastOwnedStoragePath(
                artworkStoragePath,
                String(showRow.user_id),
            );
            if (!artworkOwner.ok) return jsonResponse({ error: artworkOwner.error }, 403);
        }
        const status = body.status === "published" ? "published" : "draft";
        const now = new Date().toISOString();
        const rawDurationSeconds = Number(body.durationSeconds ?? body.duration_seconds ?? 0);
        const durationSeconds = Number.isFinite(rawDurationSeconds) && rawDurationSeconds > 0
            ? Math.round(rawDurationSeconds)
            : null;
        const payload = {
            podcast_id: podcastId,
            user_id: String(showRow.user_id),
            title,
            description: cleanText(body.description, 8000),
            episode_number: episodeNumber,
            season_number: seasonNumber,
            episode_type: episodeType,
            media_url: "",
            storage_path: verification.storagePath,
            artwork_url: cleanText(body.artworkUrl || body.artwork_url, 1000),
            artwork_storage_path: artworkStoragePath,
            thumbnail_url: cleanText(body.thumbnailUrl || body.thumbnail_url, 1000),
            duration_seconds: durationSeconds,
            file_name: fileName,
            file_size: fileSize,
            mime_type: verification.mimeType,
            container: verification.container,
            video_codec: verification.videoCodec,
            audio_codec: verification.audioCodec,
            mobile_compatible: verification.mobileCompatible,
            compatibility_status: verification.compatibilityStatus,
            compatibility_reason: verification.compatibilityReason,
            status,
            published_at: status === "published" ? now : null,
        };
        const episodeResult = await supabase
            .from("podcast_episodes")
            .insert(payload)
            .select(PODCAST_EPISODE_COLUMNS)
            .single();
        if (episodeResult.error) {
            return jsonResponse({ error: getErrorMessage(episodeResult.error) }, 500);
        }
        const mapped = await mapPodcastRows({
            showRows: [showRow],
            episodeRows: [episodeResult.data as unknown as Record<string, unknown>],
        });
        return jsonResponse({ ok: true, episode: mapped.episodes[0] }, 201);
    }
    catch (error) {
        console.error("[api/podcasts/episodes] POST failed:", error);
        return jsonResponse({ error: getErrorMessage(error) }, 500);
    }
}
