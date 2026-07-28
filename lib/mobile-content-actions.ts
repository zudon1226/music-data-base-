/**
 * Mobile overflow action catalogs — wrappers around existing page handlers only.
 * No duplicated business logic; unauthorized actions are omitted (not disabled).
 */

export type MobileContentActionId =
    | "play"
    | "play-next"
    | "add-queue"
    | "remove-queue"
    | "playlist"
    | "save"
    | "unsave"
    | "like"
    | "unlike"
    | "follow"
    | "unfollow"
    | "download"
    | "share"
    | "comments"
    | "report"
    | "claim"
    | "edit"
    | "delete"
    | "profile"
    | "shuffle"
    | "details"
    | "hide"
    | "remove-device";

export type MobileContentAction = {
    id: MobileContentActionId;
    label: string;
    onClick: () => void;
    destructive?: boolean;
    disabled?: boolean;
};

export type MobileContentSheetMeta = {
    kind: "song" | "video" | "album" | "playlist" | "artist" | "producer" | "vault" | "ringtone";
    id: string;
    title: string;
    subtitle: string;
    cover: string;
    liked?: boolean;
};

export type OpenMobileContentActionsInput = {
    id: string;
    type: MobileContentSheetMeta["kind"];
    title: string;
    creator: string;
    artworkUrl: string;
    source?: string;
    state?: {
        liked?: boolean;
        saved?: boolean;
        queued?: boolean;
    };
    actions: MobileContentAction[];
    trigger?: HTMLElement | null;
};

/** Content-type labels that must never appear as action rows. */
const CONTENT_TYPE_ACTION_LABELS = new Set([
    "album",
    "song",
    "video",
    "playlist",
    "ringtone",
    "artist",
    "producer",
    "beat",
    "queue",
    "vault",
]);

/**
 * Central sanitizer for mobile action-sheet payloads.
 * Drops empty rows and placeholder content-type labels.
 */
export function sanitizeMobileContentActions(actions: MobileContentAction[]): MobileContentAction[] {
    const seen = new Set<string>();
    const next: MobileContentAction[] = [];
    for (const action of actions) {
        if (!action || typeof action.onClick !== "function") continue;
        const label = String(action.label || "").trim();
        if (!label) continue;
        if (CONTENT_TYPE_ACTION_LABELS.has(label.toLowerCase())) continue;
        const key = `${action.id}::${label.toLowerCase()}`;
        if (seen.has(key)) continue;
        seen.add(key);
        next.push({ ...action, label });
    }
    return next;
}

type ToggleFlags = {
    isQueued?: boolean;
    isSaved?: boolean;
    isLiked?: boolean;
    isFollowed?: boolean;
    canDelete?: boolean;
    canClaim?: boolean;
    canEdit?: boolean;
    canDownload?: boolean;
    isDownloading?: boolean;
};

export function buildSongVideoOverflowActions(
    kind: "song" | "video",
    flags: ToggleFlags,
    handlers: {
        onPlay?: () => void;
        onPlayNext?: () => void;
        onToggleQueue?: () => void;
        onOpenPlaylist?: () => void;
        onToggleSave?: () => void;
        onToggleLike?: () => void;
        onToggleFollow?: () => void;
        onDownload?: () => void;
        onShare?: () => void;
        onDetails?: () => void;
        onOpenComments?: () => void;
        onReport?: () => void;
        onClaim?: () => void;
        onEdit?: () => void;
        onDelete?: () => void;
    },
): MobileContentAction[] {
    const actions: MobileContentAction[] = [];
    if (handlers.onPlay) {
        actions.push({ id: "play", label: kind === "video" ? "Play video" : "Play", onClick: handlers.onPlay });
    }
    if (handlers.onPlayNext) {
        actions.push({ id: "play-next", label: "Play Next", onClick: handlers.onPlayNext });
    }
    if (handlers.onToggleQueue) {
        actions.push({
            id: flags.isQueued ? "remove-queue" : "add-queue",
            label: flags.isQueued ? "Remove from Queue" : "Add to Queue",
            onClick: handlers.onToggleQueue,
        });
    }
    if (handlers.onOpenPlaylist) {
        actions.push({ id: "playlist", label: "Add to Playlist", onClick: handlers.onOpenPlaylist });
    }
    if (handlers.onToggleSave) {
        actions.push({
            id: flags.isSaved ? "unsave" : "save",
            label: flags.isSaved ? "Remove from Library" : "Save to Library",
            onClick: handlers.onToggleSave,
        });
    }
    if (handlers.onToggleLike) {
        actions.push({
            id: flags.isLiked ? "unlike" : "like",
            label: flags.isLiked ? "Unlike" : "Like",
            onClick: handlers.onToggleLike,
        });
    }
    if (handlers.onToggleFollow) {
        actions.push({
            id: flags.isFollowed ? "unfollow" : "follow",
            label: flags.isFollowed ? "Unfollow" : "Follow",
            onClick: handlers.onToggleFollow,
        });
    }
    if (handlers.onDownload && flags.canDownload !== false) {
        actions.push({
            id: "download",
            label: flags.isDownloading ? "Preparing download…" : "Download",
            onClick: handlers.onDownload,
            disabled: Boolean(flags.isDownloading),
        });
    }
    if (handlers.onShare) {
        actions.push({ id: "share", label: "Share", onClick: handlers.onShare });
    }
    if (handlers.onDetails) {
        actions.push({ id: "details", label: "View Details", onClick: handlers.onDetails });
    }
    if (handlers.onOpenComments) {
        actions.push({ id: "comments", label: "Comments", onClick: handlers.onOpenComments });
    }
    if (handlers.onReport) {
        actions.push({ id: "report", label: "Report", onClick: handlers.onReport });
    }
    if (handlers.onClaim && flags.canClaim) {
        actions.push({ id: "claim", label: "Claim", onClick: handlers.onClaim });
    }
    if (handlers.onEdit && flags.canEdit) {
        actions.push({ id: "edit", label: "Edit", onClick: handlers.onEdit });
    }
    if (handlers.onDelete && flags.canDelete) {
        actions.push({ id: "delete", label: "Delete", onClick: handlers.onDelete, destructive: true });
    }
    return actions;
}

export function buildAlbumOverflowActions(flags: ToggleFlags, handlers: {
    onViewSongs?: () => void;
    onPlay?: () => void;
    onPlayNext?: () => void;
    onToggleQueue?: () => void;
    onOpenPlaylist?: () => void;
    onToggleSave?: () => void;
    onShare?: () => void;
    onOpenComments?: () => void;
    onReport?: () => void;
    onClaim?: () => void;
    onEdit?: () => void;
    onDelete?: () => void;
}): MobileContentAction[] {
    const actions: MobileContentAction[] = [];
    if (handlers.onViewSongs) {
        actions.push({ id: "details", label: "View album songs", onClick: handlers.onViewSongs });
    }
    actions.push(...buildSongVideoOverflowActions("song", flags, {
        ...handlers,
        onToggleLike: undefined,
        onToggleFollow: undefined,
        onDownload: undefined,
    }).map((action) => {
        if (action.id === "play") return { ...action, label: "Play Album" };
        if (action.id === "playlist") return { ...action, label: "Save album songs to playlist" };
        if (action.id === "save") return { ...action, label: "Save Album" };
        if (action.id === "unsave") return { ...action, label: "Remove Album" };
        return action;
    }));
    return actions;
}

export function buildPlaylistOverflowActions(handlers: {
    onOpen?: () => void;
    onPlay?: () => void;
    onShuffle?: () => void;
    onAddSongs?: () => void;
    onAddToQueue?: () => void;
    onShare?: () => void;
    onDownload?: () => void;
    onRename?: () => void;
    onDelete?: () => void;
}): MobileContentAction[] {
    const actions: MobileContentAction[] = [];
    if (handlers.onPlay) {
        actions.push({ id: "play", label: "Play playlist", onClick: handlers.onPlay });
    }
    if (handlers.onShuffle) {
        actions.push({ id: "shuffle", label: "Shuffle", onClick: handlers.onShuffle });
    }
    if (handlers.onAddToQueue) {
        actions.push({ id: "add-queue", label: "Add To Queue", onClick: handlers.onAddToQueue });
    }
    if (handlers.onOpen) {
        actions.push({ id: "profile", label: "Open playlist", onClick: handlers.onOpen });
    }
    if (handlers.onAddSongs) {
        actions.push({ id: "playlist", label: "Add songs", onClick: handlers.onAddSongs });
    }
    if (handlers.onShare) {
        actions.push({ id: "share", label: "Share", onClick: handlers.onShare });
    }
    if (handlers.onDownload) {
        actions.push({ id: "download", label: "Download", onClick: handlers.onDownload });
    }
    if (handlers.onRename) {
        actions.push({ id: "edit", label: "Rename", onClick: handlers.onRename });
    }
    if (handlers.onDelete) {
        actions.push({ id: "delete", label: "Delete playlist", onClick: handlers.onDelete, destructive: true });
    }
    return actions;
}

export function buildDownloadVaultOverflowActions(handlers: {
    onRedownload?: () => void;
    onDetails?: () => void;
    onPlay?: () => void;
    onRemoveDevice?: () => void;
    onHideFromVault?: () => void;
    onReport?: () => void;
}): MobileContentAction[] {
    const actions: MobileContentAction[] = [];
    if (handlers.onRedownload) {
        actions.push({ id: "download", label: "Re-download", onClick: handlers.onRedownload });
    }
    if (handlers.onDetails) {
        actions.push({ id: "details", label: "View item details", onClick: handlers.onDetails });
    }
    if (handlers.onPlay) {
        actions.push({ id: "play", label: "Play / preview", onClick: handlers.onPlay });
    }
    if (handlers.onRemoveDevice) {
        actions.push({ id: "remove-device", label: "Remove from this device", onClick: handlers.onRemoveDevice });
    }
    if (handlers.onHideFromVault) {
        actions.push({ id: "hide", label: "Hide from Vault", onClick: handlers.onHideFromVault, destructive: true });
    }
    if (handlers.onReport) {
        actions.push({ id: "report", label: "Report download problem", onClick: handlers.onReport });
    }
    return actions;
}

export function buildArtistOverflowActions(flags: ToggleFlags, handlers: {
    onProfile?: () => void;
    onToggleFollow?: () => void;
    onShare?: () => void;
    onReport?: () => void;
}): MobileContentAction[] {
    const actions: MobileContentAction[] = [];
    if (handlers.onProfile) {
        actions.push({ id: "profile", label: "Open Profile", onClick: handlers.onProfile });
    }
    if (handlers.onToggleFollow) {
        actions.push({
            id: flags.isFollowed ? "unfollow" : "follow",
            label: flags.isFollowed ? "Unfollow" : "Follow",
            onClick: handlers.onToggleFollow,
        });
    }
    if (handlers.onShare) {
        actions.push({ id: "share", label: "Share", onClick: handlers.onShare });
    }
    if (handlers.onReport) {
        actions.push({ id: "report", label: "Report", onClick: handlers.onReport });
    }
    return actions;
}

export function buildRingtoneOverflowActions(handlers: {
    onPreview?: () => void;
    onFavorite?: () => void;
    onUnfavorite?: () => void;
    onDetails?: () => void;
    onPurchase?: () => void;
    onDownloadIphone?: () => void;
    onDownloadAndroid?: () => void;
    onShare?: () => void;
    onReport?: () => void;
    onEdit?: () => void;
    onDuplicate?: () => void;
    onArchive?: () => void;
    onDelete?: () => void;
}): MobileContentAction[] {
    const actions: MobileContentAction[] = [];
    if (handlers.onPreview) {
        actions.push({ id: "play", label: "Preview", onClick: handlers.onPreview });
    }
    if (handlers.onFavorite) {
        actions.push({ id: "like", label: "Favorite", onClick: handlers.onFavorite });
    }
    if (handlers.onUnfavorite) {
        actions.push({ id: "unlike", label: "Unfavorite", onClick: handlers.onUnfavorite });
    }
    if (handlers.onDetails) {
        actions.push({ id: "details", label: "View details", onClick: handlers.onDetails });
    }
    if (handlers.onPurchase) {
        actions.push({ id: "save", label: "Purchase", onClick: handlers.onPurchase });
    }
    if (handlers.onDownloadIphone) {
        actions.push({ id: "download", label: "Download for iPhone", onClick: handlers.onDownloadIphone });
    }
    if (handlers.onDownloadAndroid) {
        actions.push({ id: "download", label: "Download for Android", onClick: handlers.onDownloadAndroid });
    }
    if (handlers.onShare) {
        actions.push({ id: "share", label: "Share", onClick: handlers.onShare });
    }
    if (handlers.onReport) {
        actions.push({ id: "report", label: "Report", onClick: handlers.onReport });
    }
    if (handlers.onEdit) {
        actions.push({ id: "edit", label: "Edit", onClick: handlers.onEdit });
    }
    if (handlers.onDuplicate) {
        actions.push({ id: "playlist", label: "Duplicate", onClick: handlers.onDuplicate });
    }
    if (handlers.onArchive) {
        actions.push({ id: "hide", label: "Archive", onClick: handlers.onArchive, destructive: true });
    }
    if (handlers.onDelete) {
        actions.push({ id: "delete", label: "Delete", onClick: handlers.onDelete, destructive: true });
    }
    return actions;
}
