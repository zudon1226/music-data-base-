/** @typedef {import("./podcast-types").PodcastEpisode} PodcastEpisode */
/** @typedef {import("./podcast-types").PodcastShow} PodcastShow */

export const BRAND_LOGO_PATH = "/music-data-base-logo.png";
export const META_DESCRIPTION_MAX = 320;
export const META_TITLE_MAX = 120;

export function cleanPodcastMetadataText(value, maxLength) {
    return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

/** Reject storage paths, signed URLs, and other non-public preview media. */
export function isUnsafePodcastMetadataMediaUrl(value) {
    const trimmed = value.trim().toLowerCase();
    if (!trimmed) return true;
    if (trimmed.includes("storage_path") || trimmed.includes("/object/sign/")) return true;
    if (/[?&](token|signature|X-Amz-Signature)=/i.test(trimmed)) return true;
    if (/^podcast-(audio|video)\//.test(trimmed)) return true;
    return false;
}

export function resolvePublicPodcastMetadataImageUrl(siteUrl, ...candidates) {
    for (const candidate of candidates) {
        const url = String(candidate || "").trim();
        if (!url || isUnsafePodcastMetadataMediaUrl(url)) continue;
        if (url.startsWith("http://") || url.startsWith("https://")) return url;
        if (url.startsWith("/")) return `${siteUrl}${url}`;
    }
    return `${siteUrl}${BRAND_LOGO_PATH}`;
}

export function podcastShowPath(showId) {
    return `/podcast/${encodeURIComponent(showId)}`;
}

export function podcastEpisodePath(episodeId) {
    return `/podcast/episode/${encodeURIComponent(episodeId)}`;
}

export function buildPodcastDiscoveryMetadata(siteUrl) {
    const canonical = `${siteUrl}/podcast`;
    const title = "Podcasts | Music Data Base";
    const description = "Discover and listen to public podcasts and video shows on Music Data Base.";
    const image = `${siteUrl}${BRAND_LOGO_PATH}`;
    return {
        title,
        description,
        alternates: { canonical },
        openGraph: {
            title,
            description,
            type: "website",
            url: canonical,
            siteName: "Music Data Base",
            images: [{ url: image, alt: "Music Data Base Podcasts" }],
        },
        twitter: {
            card: "summary_large_image",
            title,
            description,
            images: [image],
        },
    };
}

export function buildRestrictedPodcastMetadata(kind) {
    const title = kind === "episode"
        ? "Podcast Episode | Music Data Base"
        : "Podcast Show | Music Data Base";
    const description = "Listen to podcasts on Music Data Base.";
    return {
        title,
        description,
        robots: { index: false, follow: false },
    };
}

export function buildPublicPodcastShowMetadata(show, siteUrl) {
    const showTitle = cleanPodcastMetadataText(show.title, META_TITLE_MAX) || "Podcast Show";
    const title = `${showTitle} | Music Data Base`;
    const description = cleanPodcastMetadataText(show.description, META_DESCRIPTION_MAX)
        || `Listen to ${showTitle} on Music Data Base.`;
    const canonical = `${siteUrl}${podcastShowPath(show.id)}`;
    const image = resolvePublicPodcastMetadataImageUrl(siteUrl, show.coverImageUrl);
    return {
        title,
        description,
        alternates: { canonical },
        openGraph: {
            title,
            description,
            type: "website",
            url: canonical,
            siteName: "Music Data Base",
            images: [{ url: image, alt: showTitle }],
        },
        twitter: {
            card: "summary_large_image",
            title,
            description,
            images: [image],
        },
    };
}

export function buildPublicPodcastEpisodeMetadata(episode, show, siteUrl) {
    const episodeTitle = cleanPodcastMetadataText(episode.title, META_TITLE_MAX) || "Podcast Episode";
    const showTitle = cleanPodcastMetadataText(episode.podcastTitle || show?.title, 80);
    const title = showTitle
        ? `${episodeTitle} — ${showTitle} | Music Data Base`
        : `${episodeTitle} | Music Data Base`;
    const episodeDescription = cleanPodcastMetadataText(episode.description, META_DESCRIPTION_MAX);
    const description = episodeDescription
        || (showTitle
            ? `Listen to ${episodeTitle} from ${showTitle} on Music Data Base.`
            : `Listen to ${episodeTitle} on Music Data Base.`);
    const canonical = `${siteUrl}${podcastEpisodePath(episode.id)}`;
    const image = resolvePublicPodcastMetadataImageUrl(
        siteUrl,
        episode.thumbnailUrl,
        episode.artworkUrl,
        show?.coverImageUrl,
    );
    const openGraphType = episode.episodeType === "video" ? "video.other" : "music.song";
    return {
        title,
        description,
        alternates: { canonical },
        openGraph: {
            title,
            description,
            type: openGraphType,
            url: canonical,
            siteName: "Music Data Base",
            images: [{ url: image, alt: episodeTitle }],
        },
        twitter: {
            card: "summary_large_image",
            title,
            description,
            images: [image],
        },
    };
}