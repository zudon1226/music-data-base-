/**
 * Server-side podcast follower notifications.
 * Recipients are resolved from podcast_show_follows at publish time.
 * Duplicate protection uses notifications_user_event_key_uidx via event_key
 * podcast_episode_published:{episodeId} (one row per recipient + episode).
 */

import { podcastEpisodePath } from "@/lib/podcast-routes";
import { getErrorMessage, getSupabaseServerClient, isUuid } from "@/lib/server-supabase";

export const PODCAST_EPISODE_PUBLISHED_KIND = "podcast_episode_published";
export const PODCAST_EPISODE_ITEM_TYPE = "podcast_episode";

export function podcastEpisodePublishedEventKey(episodeId: string) {
    return `podcast_episode_published:${episodeId}`;
}

function compactNotificationBody(showTitle: string, episodeTitle: string, episodeType: string) {
    const show = String(showTitle || "Podcast").trim().slice(0, 80) || "Podcast";
    const episode = String(episodeTitle || "Untitled episode").trim().slice(0, 120) || "Untitled episode";
    const media = episodeType === "video" ? "video" : "audio";
    return `${show} — ${episode} (${media})`.slice(0, 1000);
}

function isUniqueViolation(message: string) {
    return /duplicate|unique/i.test(message);
}

export async function notifyPodcastFollowersOfPublishedEpisode(input: {
    episodeId: string;
    showTitle: string;
    episodeTitle: string;
    episodeType: "audio" | "video" | string;
    creatorUserId: string;
}) {
    const episodeId = String(input.episodeId || "").trim();
    const creatorUserId = String(input.creatorUserId || "").trim();
    if (!isUuid(episodeId) || !isUuid(creatorUserId)) {
        return { ok: false as const, error: "Invalid podcast notification input." };
    }

    try {
        const supabase = getSupabaseServerClient();
        const episodeRow = await supabase
            .from("podcast_episodes")
            .select("podcast_id")
            .eq("id", episodeId)
            .maybeSingle();
        if (episodeRow.error) {
            console.warn("[podcast-notifications]", getErrorMessage(episodeRow.error));
            return { ok: false as const, error: getErrorMessage(episodeRow.error) };
        }
        const showId = String((episodeRow.data as { podcast_id?: string } | null)?.podcast_id || "").trim();
        if (!isUuid(showId)) {
            return { ok: false as const, error: "Invalid podcast notification input." };
        }

        const followers = await supabase
            .from("podcast_show_follows")
            .select("user_id")
            .eq("show_id", showId);

        if (followers.error) {
            console.warn("[podcast-notifications]", getErrorMessage(followers.error));
            return { ok: false as const, error: getErrorMessage(followers.error) };
        }

        const recipientIds = [...new Set(
            (followers.data || [])
                .map((row) => String((row as { user_id?: string }).user_id || "").trim())
                .filter((id) => isUuid(id) && id !== creatorUserId),
        )];

        if (recipientIds.length === 0) {
            return { ok: true as const, notified: 0, duplicates: 0 };
        }

        const eventKey = podcastEpisodePublishedEventKey(episodeId);
        const href = podcastEpisodePath(episodeId);
        const title = "New podcast episode";
        const body = compactNotificationBody(input.showTitle, input.episodeTitle, input.episodeType);

        let notified = 0;
        let duplicates = 0;
        for (const userId of recipientIds) {
            const inserted = await supabase.from("notifications").insert({
                user_id: userId,
                title,
                body,
                kind: PODCAST_EPISODE_PUBLISHED_KIND,
                href,
                item_id: episodeId,
                item_type: PODCAST_EPISODE_ITEM_TYPE,
                event_key: eventKey,
                read: false,
            }).select("id").maybeSingle();

            if (!inserted.error) {
                notified += 1;
                continue;
            }
            if (isUniqueViolation(inserted.error.message || "")) {
                duplicates += 1;
                continue;
            }
            console.warn("[podcast-notifications]", getErrorMessage(inserted.error));
        }

        return { ok: true as const, notified, duplicates };
    } catch (error) {
        console.warn("[podcast-notifications]", getErrorMessage(error));
        return { ok: false as const, error: getErrorMessage(error) };
    }
}
