export const MUSIC_UPLOAD_ACCOUNT_TYPES = new Set([
    "artist",
    "founding_artist",
    "artist_pro",
    "producer",
    "founding_producer",
    "producer_pro",
    "admin",
]);

export const VIDEO_UPLOAD_ACCOUNT_TYPES = new Set([
    ...MUSIC_UPLOAD_ACCOUNT_TYPES,
    "creator",
    "founding_creator",
]);

export const VIDEO_ONLY_CREATOR_ACCOUNT_TYPES = new Set([
    "creator",
    "founding_creator",
]);

export const VIDEO_ONLY_CREATOR_ROLE_TOKENS = new Set([
    "creator",
    "founding_creator",
]);

export const MUSIC_UPLOAD_ROLE_TOKENS = new Set([
    "artist",
    "founding_artist",
    "artist_pro",
    "producer",
    "founding_producer",
    "producer_pro",
    "admin",
]);

export function normalizeMediaAccountType(value) {
    return String(value || "").trim().toLowerCase();
}

export function accountTypeAllowsMusicUpload(accountType) {
    return MUSIC_UPLOAD_ACCOUNT_TYPES.has(normalizeMediaAccountType(accountType));
}

export function accountTypeAllowsVideoUpload(accountType) {
    return VIDEO_UPLOAD_ACCOUNT_TYPES.has(normalizeMediaAccountType(accountType));
}

export function isVideoOnlyCreatorAccountType(accountType) {
    return VIDEO_ONLY_CREATOR_ACCOUNT_TYPES.has(normalizeMediaAccountType(accountType));
}

export function roleTokenAllowsMusicUpload(role) {
    const clean = String(role || "").trim().toLowerCase();
    return MUSIC_UPLOAD_ROLE_TOKENS.has(clean);
}

export function roleTokenAllowsVideoUpload(role) {
    const clean = String(role || "").trim().toLowerCase();
    return roleTokenAllowsMusicUpload(clean)
        || VIDEO_ONLY_CREATOR_ROLE_TOKENS.has(clean);
}

export const MUSIC_UPLOAD_DENIED_MESSAGE =
    "Music and audio uploads are available for Artist and Producer accounts only. Video Creators may upload videos only.";

export const VIDEO_UPLOAD_DENIED_MESSAGE =
    "Video uploads require a Video Creator, Artist, or Producer account.";