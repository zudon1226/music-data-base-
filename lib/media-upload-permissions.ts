/**
 * Music vs video upload entitlements by account_type / user_roles.
 * Video-only Creator is distinct from Artist (music publisher).
 */

export {
    MUSIC_UPLOAD_ACCOUNT_TYPES,
    VIDEO_UPLOAD_ACCOUNT_TYPES,
    VIDEO_ONLY_CREATOR_ACCOUNT_TYPES,
    VIDEO_ONLY_CREATOR_ROLE_TOKENS,
    MUSIC_UPLOAD_ROLE_TOKENS,
    normalizeMediaAccountType,
    accountTypeAllowsMusicUpload,
    accountTypeAllowsVideoUpload,
    isVideoOnlyCreatorAccountType,
    roleTokenAllowsMusicUpload,
    roleTokenAllowsVideoUpload,
    MUSIC_UPLOAD_DENIED_MESSAGE,
    VIDEO_UPLOAD_DENIED_MESSAGE,
} from "@/lib/media-upload-permissions.shared.mjs";