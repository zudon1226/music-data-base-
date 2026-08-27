export type PodcastEpisodeType = "audio" | "video";
export type PodcastStatus = "draft" | "processing" | "published" | "archived";
export type PodcastTab = "All" | "Audio" | "Video";

export type PodcastShow = {
    id: string;
    userId: string;
    title: string;
    description: string;
    coverImageUrl: string;
    coverStoragePath: string;
    category: string;
    languageCode: string;
    explicitContent: boolean;
    status: Exclude<PodcastStatus, "processing">;
    publishedAt: string | null;
    createdAt: string;
    updatedAt: string;
    creatorName?: string;
    episodeCount?: number;
    followerCount?: number;
};

export type PodcastEpisode = {
    id: string;
    podcastId: string;
    userId: string;
    podcastTitle: string;
    creatorName: string;
    title: string;
    description: string;
    episodeNumber: number;
    seasonNumber: number | null;
    episodeType: PodcastEpisodeType;
    mediaUrl: string;
    storagePath: string;
    artworkUrl: string;
    artworkStoragePath: string;
    thumbnailUrl: string;
    durationSeconds: number | null;
    fileName: string;
    fileSize: number | null;
    mimeType: string;
    container: string;
    videoCodec: string;
    audioCodec: string;
    mobileCompatible: boolean | null;
    compatibilityStatus: string;
    compatibilityReason: string;
    status: PodcastStatus;
    playCount: number;
    viewCount: number;
    likeCount?: number;
    publishedAt: string | null;
    createdAt: string;
    updatedAt: string;
};

export type PodcastPlaybackRequest = {
    episode: PodcastEpisode;
    context: PodcastEpisode[];
    playableUrl?: string;
    countMetric?: boolean;
    startPosition?: number;
};

export type PodcastSaveType = "podcast_show" | "podcast_episode";

export type PodcastShowInput = {
    title: string;
    description: string;
    coverImageUrl?: string;
    coverStoragePath?: string;
    category: string;
    languageCode: string;
    explicitContent: boolean;
    status: "draft" | "published";
};

export type PodcastEpisodeInput = {
    podcastId: string;
    title: string;
    description: string;
    episodeNumber: number;
    seasonNumber: number | null;
    episodeType: PodcastEpisodeType;
    storagePath: string;
    artworkUrl?: string;
    artworkStoragePath?: string;
    thumbnailUrl?: string;
    durationSeconds?: number | null;
    fileName?: string;
    fileSize?: number | null;
    mimeType?: string;
    container?: string;
    videoCodec?: string;
    audioCodec?: string;
    mobileCompatible?: boolean | null;
    compatibilityStatus?: string;
    compatibilityReason?: string;
    status: "draft" | "published";
};

function text(value: unknown, fallback = "") {
    return typeof value === "string" ? value : value == null ? fallback : String(value);
}

function numberOrNull(value: unknown) {
    if (value == null || value === "") return null;
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
}

export function mapPodcastShowRow(row: Record<string, unknown>): PodcastShow {
    return {
        id: text(row.id),
        userId: text(row.user_id),
        title: text(row.title, "Untitled podcast"),
        description: text(row.description),
        coverImageUrl: text(row.cover_image_url),
        coverStoragePath: text(row.cover_storage_path),
        category: text(row.category, "Podcast"),
        languageCode: text(row.language_code, "en"),
        explicitContent: Boolean(row.explicit_content),
        status: row.status === "published" || row.status === "archived" ? row.status : "draft",
        publishedAt: row.published_at ? text(row.published_at) : null,
        createdAt: text(row.created_at),
        updatedAt: text(row.updated_at),
        creatorName: text(row.creator_name),
        episodeCount: numberOrNull(row.episode_count) ?? undefined,
    };
}

export function mapPodcastEpisodeRow(
    row: Record<string, unknown>,
    show?: PodcastShow | null,
): PodcastEpisode {
    const episodeType: PodcastEpisodeType = row.episode_type === "video" ? "video" : "audio";
    const rawStatus = text(row.status);
    const status: PodcastStatus = rawStatus === "processing"
        || rawStatus === "published"
        || rawStatus === "archived"
        ? rawStatus
        : "draft";
    return {
        id: text(row.id),
        podcastId: text(row.podcast_id),
        userId: text(row.user_id),
        podcastTitle: show?.title || text(row.podcast_title, "Podcast"),
        creatorName: show?.creatorName || text(row.creator_name),
        title: text(row.title, "Untitled episode"),
        description: text(row.description),
        episodeNumber: Math.max(1, numberOrNull(row.episode_number) || 1),
        seasonNumber: numberOrNull(row.season_number),
        episodeType,
        mediaUrl: text(row.media_url),
        storagePath: text(row.storage_path),
        artworkUrl: text(row.artwork_url) || show?.coverImageUrl || "",
        artworkStoragePath: text(row.artwork_storage_path),
        thumbnailUrl: text(row.thumbnail_url) || text(row.artwork_url) || show?.coverImageUrl || "",
        durationSeconds: numberOrNull(row.duration_seconds),
        fileName: text(row.file_name),
        fileSize: numberOrNull(row.file_size),
        mimeType: text(row.mime_type),
        container: text(row.container),
        videoCodec: text(row.video_codec),
        audioCodec: text(row.audio_codec),
        mobileCompatible: row.mobile_compatible == null ? null : Boolean(row.mobile_compatible),
        compatibilityStatus: text(row.compatibility_status),
        compatibilityReason: text(row.compatibility_reason),
        status,
        playCount: Math.max(0, numberOrNull(row.play_count) || 0),
        viewCount: Math.max(0, numberOrNull(row.view_count) || 0),
        likeCount: Math.max(0, numberOrNull(row.like_count) || numberOrNull(row.likes) || 0),
        publishedAt: row.published_at ? text(row.published_at) : null,
        createdAt: text(row.created_at),
        updatedAt: text(row.updated_at),
    };
}
