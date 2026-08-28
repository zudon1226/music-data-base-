import { getSupabaseServerClient } from "@/lib/server-supabase";
import {
    mapPodcastEpisodeRow,
    mapPodcastShowRow,
    type PodcastEpisode,
    type PodcastShow,
} from "@/lib/podcast-types";

export const PODCAST_SHOW_COLUMNS = [
    "id",
    "user_id",
    "title",
    "description",
    "cover_image_url",
    "cover_storage_path",
    "category",
    "language_code",
    "explicit_content",
    "status",
    "published_at",
    "created_at",
    "updated_at",
].join(",");

export const PODCAST_EPISODE_COLUMNS = [
    "id",
    "podcast_id",
    "user_id",
    "title",
    "description",
    "episode_number",
    "season_number",
    "episode_type",
    "media_url",
    "storage_path",
    "artwork_url",
    "artwork_storage_path",
    "thumbnail_url",
    "duration_seconds",
    "file_name",
    "file_size",
    "mime_type",
    "container",
    "video_codec",
    "audio_codec",
    "mobile_compatible",
    "compatibility_status",
    "compatibility_reason",
    "status",
    "play_count",
    "view_count",
    "published_at",
    "created_at",
    "updated_at",
].join(",");

export async function loadPodcastCreatorNames(userIds: string[]) {
    const uniqueIds = [...new Set(userIds.filter(Boolean))];
    const names = new Map<string, string>();
    if (uniqueIds.length === 0) return names;
    const supabase = getSupabaseServerClient();
    const [byId, byUserId] = await Promise.all([
        supabase.from("profiles").select("id,user_id,display_name,name,username").in("id", uniqueIds),
        supabase.from("profiles").select("id,user_id,display_name,name,username").in("user_id", uniqueIds),
    ]);
    for (const row of [...(byId.data || []), ...(byUserId.data || [])] as Record<string, unknown>[]) {
        const id = String(row.user_id || row.id || "");
        const name = String(row.display_name || row.name || row.username || "").trim();
        if (id && name) names.set(id, name);
    }
    return names;
}

export async function mapPodcastRows(input: {
    showRows: Record<string, unknown>[];
    episodeRows: Record<string, unknown>[];
    publishedOnly?: boolean;
}) {
    const creatorNames = await loadPodcastCreatorNames(input.showRows.map((row) => String(row.user_id || "")));
    const showIds = input.showRows.map((row) => String(row.id || "")).filter(Boolean);
    const episodeCounts = await loadPodcastShowEpisodeCounts(showIds, {
        publishedOnly: input.publishedOnly,
    });
    const shows = input.showRows.map((row) => {
        const mapped = mapPodcastShowRow({
            ...row,
            creator_name: creatorNames.get(String(row.user_id || "")) || "",
        });
        mapped.episodeCount = episodeCounts.get(String(row.id || "")) || 0;
        return mapped;
    });
    const showMap = new Map(shows.map((show) => [show.id, show]));
    const episodes = input.episodeRows.map((row) => mapPodcastEpisodeRow(row, showMap.get(String(row.podcast_id || ""))));

    const supabase = getSupabaseServerClient();
    const episodeIds = episodes.map((episode) => episode.id).filter(Boolean);

    if (episodeIds.length > 0) {
        const { data: likeRows, error: likeError } = await supabase
            .from("podcast_episode_likes")
            .select("episode_id")
            .in("episode_id", episodeIds);
        if (!likeError) {
            const likeCounts = new Map<string, number>();
            for (const row of likeRows || []) {
                const id = String((row as { episode_id?: string }).episode_id || "");
                if (!id) continue;
                likeCounts.set(id, (likeCounts.get(id) || 0) + 1);
            }
            for (const episode of episodes) {
                episode.likeCount = likeCounts.get(episode.id) || 0;
            }
        }
    }

    if (showIds.length > 0) {
        const { data: followRows, error: followError } = await supabase
            .from("podcast_show_follows")
            .select("show_id")
            .in("show_id", showIds);
        if (!followError) {
            const followerCounts = new Map<string, number>();
            for (const row of followRows || []) {
                const id = String((row as { show_id?: string }).show_id || "");
                if (!id) continue;
                followerCounts.set(id, (followerCounts.get(id) || 0) + 1);
            }
            for (const show of shows) {
                show.followerCount = followerCounts.get(show.id) || 0;
            }
        }
    }

    return { shows, episodes };
}

export async function loadPodcastShowEpisodeCounts(
    showIds: string[],
    options: { publishedOnly?: boolean; episodeType?: "audio" | "video" } = {},
) {
    const uniqueIds = [...new Set(showIds.filter(Boolean))];
    const counts = new Map<string, number>();
    if (uniqueIds.length === 0) return counts;
    const supabase = getSupabaseServerClient();
    let query = supabase.from("podcast_episodes").select("podcast_id").in("podcast_id", uniqueIds);
    if (options.publishedOnly) query = query.eq("status", "published");
    if (options.episodeType) query = query.eq("episode_type", options.episodeType);
    const { data } = await query;
    for (const row of data || []) {
        const id = String((row as { podcast_id?: string }).podcast_id || "");
        if (!id) continue;
        counts.set(id, (counts.get(id) || 0) + 1);
    }
    return counts;
}

export function attachPodcastShow(
    episode: PodcastEpisode,
    shows: PodcastShow[],
) {
    const show = shows.find((candidate) => candidate.id === episode.podcastId);
    return show
        ? {
            ...episode,
            podcastTitle: show.title,
            creatorName: show.creatorName || episode.creatorName,
            artworkUrl: episode.artworkUrl || show.coverImageUrl,
            thumbnailUrl: episode.thumbnailUrl || episode.artworkUrl || show.coverImageUrl,
        }
        : episode;
}
