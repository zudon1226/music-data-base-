export type MixtapeStatus = "draft" | "published" | "archived";
export type MixtapeTrackStatus = "draft" | "processing" | "published" | "archived";
export type MixtapeModerationState = "clear" | "takedown_pending" | "removed";

export type MixtapeCategory = {
    id: string;
    slug: string;
    label: string;
    sortOrder: number;
    isActive: boolean;
};

export type Mixtape = {
    id: string;
    userId: string;
    title: string;
    description: string;
    categoryId: string | null;
    categorySlug?: string;
    categoryLabel?: string;
    genre: string;
    explicitContent: boolean;
    coverImageUrl: string;
    coverStoragePath: string;
    status: MixtapeStatus;
    moderationState: MixtapeModerationState;
    isFeatured: boolean;
    releaseDate: string | null;
    publishedAt: string | null;
    playCount: number;
    favoriteCount: number;
    createdAt: string;
    updatedAt: string;
    creatorName?: string;
    trackCount?: number;
};

export type MixtapeTrack = {
    id: string;
    mixtapeId: string;
    userId: string;
    position: number;
    title: string;
    description: string;
    storagePath: string;
    mediaUrl: string;
    fileName: string;
    fileSize: number | null;
    mimeType: string;
    durationSeconds: number | null;
    status: MixtapeTrackStatus;
    moderationState: MixtapeModerationState;
    playCount: number;
    publishedAt: string | null;
    createdAt: string;
    updatedAt: string;
    mixtapeTitle?: string;
    creatorName?: string;
    coverImageUrl?: string;
};

export type MixtapePlaybackRequest = {
    track: MixtapeTrack;
    context: MixtapeTrack[];
    playableUrl?: string;
    playbackSessionId?: string;
    startPosition?: number;
};

export type MixtapeInput = {
    title: string;
    description: string;
    categoryId?: string | null;
    genre?: string;
    explicitContent?: boolean;
    coverImageUrl?: string;
    coverStoragePath?: string;
    releaseDate?: string | null;
    status: "draft" | "published";
};

export type MixtapeTrackInput = {
    mixtapeId: string;
    title: string;
    description: string;
    position: number;
    storagePath: string;
    fileName?: string;
    fileSize?: number | null;
    mimeType?: string;
    durationSeconds?: number | null;
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

export function mapMixtapeCategoryRow(row: Record<string, unknown>): MixtapeCategory {
    return {
        id: text(row.id),
        slug: text(row.slug),
        label: text(row.label),
        sortOrder: Math.max(0, numberOrNull(row.sort_order) || 0),
        isActive: row.is_active !== false,
    };
}

export function mapMixtapeRow(row: Record<string, unknown>): Mixtape {
    const rawStatus = text(row.status);
    const status: MixtapeStatus = rawStatus === "published" || rawStatus === "archived" ? rawStatus : "draft";
    const moderation = text(row.moderation_state);
    const moderationState: MixtapeModerationState = moderation === "takedown_pending" || moderation === "removed"
        ? moderation
        : "clear";
    return {
        id: text(row.id),
        userId: text(row.user_id),
        title: text(row.title, "Untitled mixtape"),
        description: text(row.description),
        categoryId: row.category_id ? text(row.category_id) : null,
        categorySlug: text(row.category_slug),
        categoryLabel: text(row.category_label),
        genre: text(row.genre),
        explicitContent: Boolean(row.explicit_content),
        coverImageUrl: text(row.cover_image_url),
        coverStoragePath: text(row.cover_storage_path),
        status,
        moderationState,
        isFeatured: Boolean(row.is_featured),
        releaseDate: row.release_date ? text(row.release_date) : null,
        publishedAt: row.published_at ? text(row.published_at) : null,
        playCount: Math.max(0, numberOrNull(row.play_count) || 0),
        favoriteCount: Math.max(0, numberOrNull(row.favorite_count) || 0),
        createdAt: text(row.created_at),
        updatedAt: text(row.updated_at),
        creatorName: text(row.creator_name),
        trackCount: numberOrNull(row.track_count) ?? undefined,
    };
}

export function mapMixtapeTrackRow(
    row: Record<string, unknown>,
    mixtape?: Mixtape | null,
): MixtapeTrack {
    const rawStatus = text(row.status);
    const status: MixtapeTrackStatus = rawStatus === "processing"
        || rawStatus === "published"
        || rawStatus === "archived"
        ? rawStatus
        : "draft";
    const moderation = text(row.moderation_state);
    const moderationState: MixtapeModerationState = moderation === "takedown_pending" || moderation === "removed"
        ? moderation
        : "clear";
    return {
        id: text(row.id),
        mixtapeId: text(row.mixtape_id),
        userId: text(row.user_id),
        position: Math.max(1, numberOrNull(row.position) || 1),
        title: text(row.title, "Untitled track"),
        description: text(row.description),
        storagePath: text(row.storage_path),
        mediaUrl: text(row.media_url),
        fileName: text(row.file_name),
        fileSize: numberOrNull(row.file_size),
        mimeType: text(row.mime_type),
        durationSeconds: numberOrNull(row.duration_seconds),
        status,
        moderationState,
        playCount: Math.max(0, numberOrNull(row.play_count) || 0),
        publishedAt: row.published_at ? text(row.published_at) : null,
        createdAt: text(row.created_at),
        updatedAt: text(row.updated_at),
        mixtapeTitle: mixtape?.title || text(row.mixtape_title),
        creatorName: mixtape?.creatorName || text(row.creator_name),
        coverImageUrl: mixtape?.coverImageUrl || text(row.cover_image_url),
    };
}