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
    const state = String(value ?? "clear").trim() || "clear";
    return CATALOG_HOLD_STATES.includes(state) ? state : "clear";
}

export function isCatalogItemPubliclyPlayable(record, options = {}) {
    const state = normalizeCatalogModerationState(record?.moderation_state);
    if (state === "clear") return true;
    const viewerUserId = String(options.viewerUserId || "").trim();
    const ownerIds = [
        options.ownerUserId,
        record?.user_id,
        record?.userId,
        ...(Array.isArray(options.ownerUserIds) ? options.ownerUserIds : []),
    ].map((id) => String(id || "").trim()).filter(Boolean);
    if (options.allowOwner && viewerUserId && ownerIds.includes(viewerUserId)) {
        return true;
    }
    if (options.isAdmin) return true;
    return false;
}

export function filterPublicCatalogRows(rows, options = {}) {
    return (Array.isArray(rows) ? rows : []).filter((row) => isCatalogItemPubliclyPlayable(row, options));
}

export function isModerationHoldColumnError(error) {
    const message = String(error?.message || error || "").toLowerCase();
    return message.includes("moderation_state");
}
