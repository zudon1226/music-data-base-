export const ALLOWED_AUTH_USER_METADATA_KEYS = [
    "displayName",
    "role",
    "avatarUrl",
] as const;

/** Keys GoTrue may mirror into user_metadata; ignore for size/forbidden checks. */
export const AUTH_SYSTEM_USER_METADATA_KEYS = [
    "email",
    "email_verified",
    "phone_verified",
    "sub",
    "iss",
    "aud",
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
    return FORBIDDEN_AUTH_USER_METADATA_KEYS.some((key) => key in metadata && metadata[key] != null);
}

export const MAX_AUTH_USER_METADATA_BYTES = 1000;

export function measureAuthUserMetadataBytes(metadata: Record<string, unknown> | null | undefined) {
    return new TextEncoder().encode(JSON.stringify(metadata || {})).length;
}

function isAllowedOrSystemMetadataKey(key: string) {
    return (ALLOWED_AUTH_USER_METADATA_KEYS as readonly string[]).includes(key)
        || (AUTH_SYSTEM_USER_METADATA_KEYS as readonly string[]).includes(key);
}

export function authMetadataNeedsRepair(metadata: Record<string, unknown> | null | undefined) {
    if (!metadata) {
        return false;
    }
    if (hasForbiddenAuthMetadata(metadata)) {
        return true;
    }
    if (Object.keys(metadata).some((key) => !isAllowedOrSystemMetadataKey(key) && metadata[key] != null)) {
        return true;
    }
    return measureAuthUserMetadataBytes(metadata) > MAX_AUTH_USER_METADATA_BYTES;
}

/**
 * Admin updateUserById merges user_metadata. Explicitly null every non-allowed key
 * so oversized legacy fields (especially musicData) are removed from the JWT.
 */
export function buildAuthUserMetadataAdminPatch(
    currentMetadata: Record<string, unknown> | null | undefined,
    nextMinimal: Record<string, string>,
): Record<string, string | null> {
    const patch: Record<string, string | null> = { ...nextMinimal };
    for (const key of Object.keys(currentMetadata || {})) {
        if (!(ALLOWED_AUTH_USER_METADATA_KEYS as readonly string[]).includes(key)) {
            patch[key] = null;
        }
    }
    for (const key of FORBIDDEN_AUTH_USER_METADATA_KEYS) {
        patch[key] = null;
    }
    return patch;
}

/** Reject any attempt to persist non-scalar / oversized Auth metadata. */
export function assertSafeAuthUserMetadata(metadata: Record<string, unknown>) {
    if (hasForbiddenAuthMetadata(metadata)) {
        throw new Error("Auth user_metadata must not contain application collections or state.");
    }
    const sanitized = sanitizeAuthUserMetadata(metadata);
    const bytes = measureAuthUserMetadataBytes(sanitized);
    if (bytes > MAX_AUTH_USER_METADATA_BYTES) {
        throw new Error("Auth user_metadata exceeds the maximum allowed size.");
    }
    return sanitized;
}
