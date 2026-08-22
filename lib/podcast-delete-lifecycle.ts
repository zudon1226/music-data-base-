import { getErrorMessage, getSupabaseServerClient, isUuid } from "@/lib/server-supabase";
import {
    getPodcastBucket,
    PODCAST_COVERS_BUCKET,
    validatePodcastOwnedStoragePath,
} from "@/lib/podcast-validation";
import type { PodcastEpisodeType } from "@/lib/podcast-types";

type StorageObject = { bucket: string; path: string };

function uniqueStorageObjects(items: StorageObject[]) {
    return [
        ...new Map(
            items
                .filter((item) => item.path)
                .map((item) => [`${item.bucket}:${item.path}`, item]),
        ).values(),
    ];
}

async function removeStorageObjects(items: StorageObject[]) {
    const supabase = getSupabaseServerClient();
    const byBucket = new Map<string, string[]>();
    for (const item of uniqueStorageObjects(items)) {
        const paths = byBucket.get(item.bucket) || [];
        paths.push(item.path);
        byBucket.set(item.bucket, paths);
    }
    const removed: string[] = [];
    for (const [bucket, paths] of byBucket) {
        if (paths.length === 0) continue;
        const result = await supabase.storage.from(bucket).remove(paths);
        if (result.error) {
            throw new Error(`Podcast storage cleanup failed in ${bucket}: ${getErrorMessage(result.error)}`);
        }
        removed.push(...paths.map((path) => `${bucket}:${path}`));
    }
    return removed;
}

function collectEpisodeStorage(
    episode: Record<string, unknown>,
    ownerId: string,
): StorageObject[] {
    const objects: StorageObject[] = [];
    const mediaPath = String(episode.storage_path || "").trim();
    const episodeType: PodcastEpisodeType = episode.episode_type === "video" ? "video" : "audio";
    if (mediaPath && validatePodcastOwnedStoragePath(mediaPath, ownerId).ok) {
        objects.push({ bucket: getPodcastBucket(episodeType), path: mediaPath });
    }
    const artworkPath = String(episode.artwork_storage_path || "").trim();
    if (artworkPath && validatePodcastOwnedStoragePath(artworkPath, ownerId).ok) {
        objects.push({ bucket: PODCAST_COVERS_BUCKET, path: artworkPath });
    }
    return objects;
}

async function cleanupPodcastReferences(showId: string, episodeIds: string[], cleanupShow: boolean) {
    const supabase = getSupabaseServerClient();
    if (cleanupShow) {
        const showSaves = await supabase
            .from("library_saves")
            .delete()
            .eq("item_type", "podcast_show")
            .eq("item_id", showId);
        if (showSaves.error) throw showSaves.error;
    }
        if (episodeIds.length > 0) {
        const episodeSaves = await supabase
            .from("library_saves")
            .delete()
            .eq("item_type", "podcast_episode")
            .in("item_id", episodeIds);
        if (episodeSaves.error) throw episodeSaves.error;
        const episodeLikes = await supabase
            .from("podcast_episode_likes")
            .delete()
            .in("episode_id", episodeIds);
        if (episodeLikes.error && !String(episodeLikes.error.message || "").includes("does not exist")) {
            throw episodeLikes.error;
        }
        const recent = await supabase
            .from("user_recently_played")
            .delete()
            .eq("media_type", "podcast_episode")
            .in("media_id", episodeIds);
        if (recent.error) throw recent.error;
    }
}

export async function deletePodcastEpisodePermanently(input: {
    episode: Record<string, unknown>;
}) {
    const episodeId = String(input.episode.id || "");
    const ownerId = String(input.episode.user_id || "");
    if (!isUuid(episodeId) || !isUuid(ownerId)) {
        return { ok: false as const, status: 400, error: "Invalid podcast episode." };
    }
    try {
        const removedStorage = await removeStorageObjects(collectEpisodeStorage(input.episode, ownerId));
        const supabase = getSupabaseServerClient();
        const deleted = await supabase
            .from("podcast_episodes")
            .delete()
            .eq("id", episodeId)
            .eq("user_id", ownerId);
        if (deleted.error) throw deleted.error;
        await cleanupPodcastReferences(String(input.episode.podcast_id || ""), [episodeId], false);
        return { ok: true as const, status: 200, removedStorage };
    }
    catch (error) {
        return { ok: false as const, status: 500, error: getErrorMessage(error) };
    }
}

export async function deletePodcastShowPermanently(input: {
    show: Record<string, unknown>;
    confirmedEpisodeCount: number | null;
}) {
    const showId = String(input.show.id || "");
    const ownerId = String(input.show.user_id || "");
    if (!isUuid(showId) || !isUuid(ownerId)) {
        return { ok: false as const, status: 400, error: "Invalid podcast show." };
    }
    try {
        const supabase = getSupabaseServerClient();
        const episodeResult = await supabase
            .from("podcast_episodes")
            .select("id,podcast_id,user_id,episode_type,storage_path,artwork_storage_path")
            .eq("podcast_id", showId);
        if (episodeResult.error) throw episodeResult.error;
        const episodes = (episodeResult.data || []) as Record<string, unknown>[];
        if (
            input.confirmedEpisodeCount == null
            || !Number.isInteger(input.confirmedEpisodeCount)
            || input.confirmedEpisodeCount !== episodes.length
        ) {
            return {
                ok: false as const,
                status: 409,
                code: "EPISODE_COUNT_CONFIRMATION_REQUIRED",
                error: `Confirm deletion of this show and its ${episodes.length} episode${episodes.length === 1 ? "" : "s"}.`,
                episodeCount: episodes.length,
            };
        }

        const objects = episodes.flatMap((episode) => (
            collectEpisodeStorage(episode, String(episode.user_id || ownerId))
        ));
        const coverPath = String(input.show.cover_storage_path || "").trim();
        if (coverPath && validatePodcastOwnedStoragePath(coverPath, ownerId).ok) {
            objects.push({ bucket: PODCAST_COVERS_BUCKET, path: coverPath });
        }
        const removedStorage = await removeStorageObjects(objects);
        const deleted = await supabase
            .from("podcast_shows")
            .delete()
            .eq("id", showId)
            .eq("user_id", ownerId);
        if (deleted.error) throw deleted.error;
        await cleanupPodcastReferences(
            showId,
            episodes.map((episode) => String(episode.id || "")).filter(Boolean),
            true,
        );
        return {
            ok: true as const,
            status: 200,
            episodeCount: episodes.length,
            removedStorage,
        };
    }
    catch (error) {
        return { ok: false as const, status: 500, error: getErrorMessage(error) };
    }
}
