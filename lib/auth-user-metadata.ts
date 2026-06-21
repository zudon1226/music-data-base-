export const ALLOWED_AUTH_USER_METADATA_KEYS = [
    "displayName",
    "role",
    "avatarUrl",
] as const;

export const FORBIDDEN_AUTH_USER_METADATA_KEYS = [
    "musicData",
    "songs",
    "videos",
    "playlists",
    "libraryIds",
    "likedIds",
    "queueIds",
    "followedIds",
    "followedArtistIds",
    "artistProfiles",
    "recentlyPlayed",
    "currentSongId",
    "activePlaylistId",
    "accountRole",
] as const;

export type MinimalAuthUserMetadata = {
    displayName?: string;
    role?: string;
    avatarUrl?: string;
};

function cleanString(value: unknown) {
    return typeof value === "string" ? value.trim() : "";
}

export function sanitizeAuthUserMetadata(
    input: Record<string, unknown> | null | undefined,
): Record<string, string> {
    const source = input || {};
    const sanitized: Record<string, string> = {};
    const displayName = cleanString(source.displayName)
        || cleanString(source.display_name)
        || cleanString(source.full_name)
        || cleanString(source.name);
    const role = (cleanString(source.role)
        || cleanString(source.accountRole)
        || cleanString(source.account_type)
        || "listener").toLowerCase();
    const avatarUrl = cleanString(source.avatarUrl) || cleanString(source.avatar_url);

    if (displayName) {
        sanitized.displayName = displayName;
    }
    if (role) {
        sanitized.role = role;
    }
    if (avatarUrl) {
        sanitized.avatarUrl = avatarUrl;
    }
    return sanitized;
}

export function buildSignupUserMetadata(input: { displayName: string }) {
    return sanitizeAuthUserMetadata({
        displayName: input.displayName,
        role: "listener",
    });
}

export function hasForbiddenAuthMetadata(metadata: Record<string, unknown> | null | undefined) {
    if (!metadata) {
        return false;
    }
    return FORBIDDEN_AUTH_USER_METADATA_KEYS.some((key) => key in metadata);
}

export function authMetadataNeedsRepair(metadata: Record<string, unknown> | null | undefined) {
    if (!metadata) {
        return false;
    }
    if (hasForbiddenAuthMetadata(metadata)) {
        return true;
    }
    return JSON.stringify(metadata).length > 1000;
}
