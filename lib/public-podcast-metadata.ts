import type { Metadata } from "next";
import { isCatalogItemPubliclyPlayable } from "@/lib/moderation-status.mjs";
import { mapPodcastRows, PODCAST_EPISODE_COLUMNS, PODCAST_SHOW_COLUMNS } from "@/lib/podcast-data";
import type { PodcastEpisode, PodcastShow } from "@/lib/podcast-types";
import { getPublicSiteUrl, getSupabaseServerClient, isUuid } from "@/lib/server-supabase";
import {
    buildPodcastDiscoveryMetadata as buildPodcastDiscoveryMetadataShared,
    buildPublicPodcastEpisodeMetadata as buildPublicPodcastEpisodeMetadataShared,
    buildPublicPodcastShowMetadata as buildPublicPodcastShowMetadataShared,
    buildRestrictedPodcastMetadata as buildRestrictedPodcastMetadataShared,
    cleanPodcastMetadataText,
    isUnsafePodcastMetadataMediaUrl,
    resolvePublicPodcastMetadataImageUrl as resolvePublicPodcastMetadataImageUrlShared,
} from "@/lib/public-podcast-metadata.shared.mjs";

export {
    cleanPodcastMetadataText,
    isUnsafePodcastMetadataMediaUrl,
};

export type PublicPodcastShowMetadataLoad =
    | { kind: "missing" }
    | { kind: "restricted" }
    | { kind: "public"; show: PodcastShow };

export type PublicPodcastEpisodeMetadataLoad =
    | { kind: "missing" }
    | { kind: "restricted" }
    | { kind: "public"; episode: PodcastEpisode; show: PodcastShow | null };

export function resolvePublicPodcastMetadataImageUrl(...candidates: Array<string | undefined | null>) {
    return resolvePublicPodcastMetadataImageUrlShared(getPublicSiteUrl(), ...candidates);
}

export function buildPodcastDiscoveryMetadata(): Metadata {
    return buildPodcastDiscoveryMetadataShared(getPublicSiteUrl()) as Metadata;
}

export function buildRestrictedPodcastMetadata(kind: "show" | "episode"): Metadata {
    return buildRestrictedPodcastMetadataShared(kind) as Metadata;
}

export function buildPublicPodcastShowMetadata(show: PodcastShow): Metadata {
    return buildPublicPodcastShowMetadataShared(show, getPublicSiteUrl()) as Metadata;
}

export function buildPublicPodcastEpisodeMetadata(episode: PodcastEpisode, show: PodcastShow | null): Metadata {
    return buildPublicPodcastEpisodeMetadataShared(episode, show, getPublicSiteUrl()) as Metadata;
}

export async function loadPublicPodcastShowForMetadata(showId: string): Promise<PublicPodcastShowMetadataLoad> {
    const id = decodeURIComponent(String(showId || "")).trim();
    if (!isUuid(id)) return { kind: "missing" };
    const supabase = getSupabaseServerClient();
    const showResult = await supabase
        .from("podcast_shows")
        .select(PODCAST_SHOW_COLUMNS)
        .eq("id", id)
        .maybeSingle();
    if (showResult.error || !showResult.data) return { kind: "missing" };
    const showRow = showResult.data as unknown as Record<string, unknown>;
    if (String(showRow.status || "") !== "published") return { kind: "restricted" };
    const mapped = await mapPodcastRows({ showRows: [showRow], episodeRows: [], publishedOnly: true });
    const show = mapped.shows[0];
    if (!show) return { kind: "missing" };
    return { kind: "public", show };
}

export async function loadPublicPodcastEpisodeForMetadata(episodeId: string): Promise<PublicPodcastEpisodeMetadataLoad> {
    const id = decodeURIComponent(String(episodeId || "")).trim();
    if (!isUuid(id)) return { kind: "missing" };
    const supabase = getSupabaseServerClient();
    const episodeResult = await supabase
        .from("podcast_episodes")
        .select(PODCAST_EPISODE_COLUMNS)
        .eq("id", id)
        .maybeSingle();
    if (episodeResult.error || !episodeResult.data) return { kind: "missing" };
    const episodeRow = episodeResult.data as unknown as Record<string, unknown>;
    const showResult = await supabase
        .from("podcast_shows")
        .select(PODCAST_SHOW_COLUMNS)
        .eq("id", String(episodeRow.podcast_id || ""))
        .maybeSingle();
    if (showResult.error || !showResult.data) return { kind: "missing" };
    const showRow = showResult.data as unknown as Record<string, unknown>;
    const isPublic = String(episodeRow.status || "") === "published"
        && String(showRow.status || "") === "published"
        && isCatalogItemPubliclyPlayable(episodeRow);
    if (!isPublic) return { kind: "restricted" };
    const mapped = await mapPodcastRows({
        showRows: [showRow],
        episodeRows: [episodeRow],
        publishedOnly: true,
    });
    const episode = mapped.episodes[0];
    const show = mapped.shows[0] || null;
    if (!episode) return { kind: "missing" };
    return { kind: "public", episode, show };
}