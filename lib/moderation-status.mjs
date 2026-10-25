/** Shared moderation status, transitions, and catalog-hold rules. */

export const MODERATION_STATUSES = [
    "open",
    "reviewing",
    "takedown_pending",
    "removed",
    "dismissed",
    "resolved",
];

export const MODERATION_ITEM_TYPES = [
    "song",
    "video",
    "album",
    "comment",
    "artist",
    "producer",
    "beat",
    "playlist",
    "podcast_episode",
];

export const CATALOG_TAKEDOWN_ITEM_TYPES = {
    song: "songs",
    video: "videos",
    album: "albums",
    podcast_episode: "podcast_episodes",
};

export const CATALOG_HOLD_STATES = ["clear", "takedown_pending", "removed"];

/** Non-catalog hold values returned when moderation_state is present but not a known hold state. */
export const CATALOG_MODERATION_UNKNOWN = "unknown";

const ALLOWED_TRANSITIONS = {
    open: ["reviewing", "takedown_pending", "removed", "dismissed", "resolved"],
    reviewing: ["open", "takedown_pending", "removed", "dismissed", "resolved"],
    takedown_pending: ["reviewing", "removed", "dismissed", "resolved"],
    removed: ["reviewing", "dismissed", "resolved"],
    dismissed: ["open", "reviewing"],
    resolved: ["open", "reviewing"],
};

export function isModerationStatus(value) {
    return MODERATION_STATUSES.includes(String(value || "").trim());
}

export function isModerationItemType(value) {
    return MODERATION_ITEM_TYPES.includes(String(value || "").trim());
}

export function catalogTableForItemType(itemType) {
    return CATALOG_TAKEDOWN_ITEM_TYPES[String(itemType || "").trim()] || "";
}

export function canTransitionModerationStatus(fromStatus, toStatus) {
    const from = String(fromStatus || "").trim();
    const to = String(toStatus || "").trim();
    if (!isModerationStatus(from) || !isModerationStatus(to)) return false;
    if (from === to) return true;
    return (ALLOWED_TRANSITIONS[from] || []).includes(to);
}

export function catalogHoldFromReportStatuses(statuses) {
    const list = Array.isArray(statuses) ? statuses.map((status) => String(status || "").trim()) : [];
    if (list.includes("removed")) return "removed";
    if (list.includes("takedown_pending")) return "takedown_pending";
    return "clear";
}

export function normalizeCatalogModerationState(value) {
    if (value == null) return CATALOG_MODERATION_UNKNOWN;
    const state = String(value).trim();
    if (!state) return CATALOG_MODERATION_UNKNOWN;
    if (CATALOG_HOLD_STATES.includes(state)) return state;
    return CATALOG_MODERATION_UNKNOWN;
}

/** True when the row/object includes moderation_state. Null and "" are present, but they are not clear. */
export function isCatalogModerationStatePresent(record) {
    return Boolean(record && typeof record === "object" && Object.prototype.hasOwnProperty.call(record, "moderation_state"));
}

/**
 * Normal playback, public catalog, and paid download require the literal "clear" state.
 * The database default in 202610172000 writes that literal at insert time. A missing
 * property, null, or empty value is not treated as that default.
 */
export function isCatalogItemPubliclyPlayable(record) {
    if (!isCatalogModerationStatePresent(record)) return false;
    return normalizeCatalogModerationState(record.moderation_state) === "clear";
}

/** Private library/saves UI may surface non-clear items to owners/admins without granting playback. */
export function isCatalogItemVisibleInPrivateLibrary(record, options = {}) {
    const state = normalizeCatalogModerationState(record?.moderation_state);
    if (state === "clear") return true;
    if (state === CATALOG_MODERATION_UNKNOWN) {
        return Boolean(options.isAdmin);
    }
    if (state === "removed") {
        return Boolean(options.isAdmin);
    }
    if (state === "takedown_pending") {
        if (options.isAdmin) return true;
        const viewerUserId = String(options.viewerUserId || "").trim();
        const ownerIds = [
            options.ownerUserId,
            record?.user_id,
            record?.userId,
            ...(Array.isArray(options.ownerUserIds) ? options.ownerUserIds : []),
        ].map((id) => String(id || "").trim()).filter(Boolean);
        return Boolean(options.allowOwner && viewerUserId && ownerIds.includes(viewerUserId));
    }
    return false;
}

const NON_PLAYABLE_MEDIA_KEYS = [
    "audio",
    "audio_path",
    "audioPath",
    "audio_url",
    "audioUrl",
    "file_url",
    "fileUrl",
    "playableUrl",
    "public_url",
    "publicUrl",
    "storage_path",
    "storagePath",
    "url",
    "video_url",
    "videoUrl",
];

/** Drop direct playback fields when the row is not explicitly clear. Metadata stays. */
export function redactNonPlayableCatalogMedia(record) {
    if (!record || typeof record !== "object") return record;
    if (!isCatalogModerationStatePresent(record) || isCatalogItemPubliclyPlayable(record)) {
        return record;
    }
    const next = { ...record };
    for (const key of NON_PLAYABLE_MEDIA_KEYS) {
        if (Object.prototype.hasOwnProperty.call(next, key)) next[key] = "";
    }
    return next;
}

export function filterPublicCatalogRows(rows) {
    return (Array.isArray(rows) ? rows : []).filter((row) => isCatalogItemPubliclyPlayable(row));
}

export function isModerationHoldColumnError(error) {
    const message = String(error?.message || error || "").toLowerCase();
    return message.includes("moderation_state");
}
