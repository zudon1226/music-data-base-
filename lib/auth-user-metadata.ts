export const ALLOWED_AUTH_USER_METADATA_KEYS = [
    "displayName",
    "role",
    "avatarUrl",
    "email_verified",
    "phone_verified",
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
    metadata: Record<string, unknown> | null | undefined,
): Record<string, string | boolean> {
    const source = metadata || {};
    const displayName = cleanString(source.displayName)
        || cleanString(source.display_name)
        || cleanString(source.full_name)
        || cleanString(source.name);
    const role = cleanString(source.role)
        || cleanString(source.accountRole)
        || cleanString(source.account_type)
        || "listener";
    const avatarUrl = cleanString(source.avatarUrl) || cleanString(source.avatar_url);

    const sanitized: Record<string, string | boolean> = {};
    if (displayName) {
        sanitized.displayName = displayName;
    }
    if (role) {
        sanitized.role = role.toLowerCase();
    }
    if (avatarUrl) {
        sanitized.avatarUrl = avatarUrl;
    }
    if (typeof source.email_verified === "boolean") {
        sanitized.email_verified = source.email_verified;
    }
    if (typeof source.phone_verified === "boolean") {
        sanitized.phone_verified = source.phone_verified;
    }
    return sanitized;
}

export function buildSignupUserMetadata(input: { displayName: string }) {
    const displayName = cleanString(input.displayName);
    return sanitizeAuthUserMetadata({
        displayName,
        role: "listener",
    });
}

export function hasForbiddenAuthMetadata(metadata: Record<string, unknown> | null | undefined) {
    if (!metadata) {
        return false;
    }
    return FORBIDDEN_AUTH_USER_METADATA_KEYS.some((key) => key in metadata);
}
