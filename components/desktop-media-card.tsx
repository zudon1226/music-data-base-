"use client";

import {
    Bell,
    BookOpen,
    Download,
    ListMusic,
    MessageCircle,
    Plus,
    Share2,
    Trash2,
} from "lucide-react";
import { useState } from "react";
import type {
    DesktopSongCardHandlers,
    DesktopSongCardModel,
    DesktopSongCardState,
    DesktopVideoCardHandlers,
    DesktopVideoCardModel,
    DesktopVideoCardState,
} from "../lib/desktop-media-card-types";
import { buildSongVideoOverflowActions } from "../lib/mobile-content-actions";
import { DesktopFloatingActionMenu } from "./desktop-floating-action-menu";
import { DesktopMediaGridCard } from "./desktop-media-grid-card";
import { DesktopMediaListRow } from "./desktop-media-list-row";

type DesktopSongMediaCardProps = {
    song: DesktopSongCardModel;
    state: DesktopSongCardState;
    handlers: DesktopSongCardHandlers;
    variant?: "default" | "library";
    layout?: "grid" | "list";
};

type DesktopVideoMediaCardProps = {
    video: DesktopVideoCardModel;
    state: DesktopVideoCardState;
    handlers: DesktopVideoCardHandlers;
    variant?: "default" | "library";
    likeLabel?: string;
    layout?: "grid" | "list";
};

function DesktopArtistNameButton({
    name,
    onOpen,
}: {
    name: string;
    onOpen: (name: string) => void;
}) {
    return (
        <button
            className="artist-link"
            onClick={(event) => {
                event.stopPropagation();
                onOpen(name);
            }}
            title={`Open ${name} profile`}
            type="button"
        >
            {name}
        </button>
    );
}

function DesktopMediaCardSecondaryActions({
    commentCount,
    canClaim,
    onOpenComments,
    onShare,
    shareLabel,
    onReport,
    onClaim,
}: {
    commentCount: number;
    canClaim: boolean;
    onOpenComments: () => void;
    onShare: () => void;
    shareLabel: string;
    onReport: () => void;
    onClaim: () => void;
}) {
    return (
        <div className="card-secondary-actions">
            <button onClick={onOpenComments} type="button">
                <MessageCircle size={14} />
                Comments {commentCount}
            </button>
            <button onClick={onShare} type="button">
                <Share2 size={14} />
                {shareLabel}
            </button>
            <button onClick={onReport} type="button">
                <Bell size={14} />
                Report
            </button>
            {canClaim ? (
                <button onClick={onClaim} type="button">
                    <BookOpen size={14} />
                    Claim
                </button>
            ) : null}
        </div>
    );
}

/** Centralized Listener/creator primary actions — stable order on every page. */
function DesktopMediaCardPrimaryActions({
    playLabel,
    isLiked,
    likeLabel,
    isFollowed,
    isSaved,
    isQueued,
    isDownloading,
    canDelete,
    deleteClassName,
    onPlay,
    onToggleLike,
    onToggleFollow,
    onToggleSave,
    onToggleQueue,
    onOpenPlaylist,
    onDownload,
    onDelete,
}: {
    playLabel: string;
    isLiked: boolean;
    likeLabel: string;
    isFollowed: boolean;
    isSaved: boolean;
    isQueued: boolean;
    isDownloading?: boolean;
    canDelete: boolean;
    deleteClassName?: string;
    onPlay: () => void;
    onToggleLike: () => void;
    onToggleFollow: () => void;
    onToggleSave: () => void;
    onToggleQueue: () => void;
    onOpenPlaylist: () => void;
    onDownload: () => void;
    onDelete: () => void;
}) {
    return (
        <>
            <button className="play-btn" onClick={onPlay} type="button">
                <span aria-hidden="true">▶</span>
                <span>{playLabel}</span>
            </button>

            <button
                className={isLiked ? "like-btn liked" : "like-btn"}
                onClick={onToggleLike}
                type="button"
            >
                <span aria-hidden="true">{isLiked ? "♥" : "♡"}</span>
                <span>{likeLabel}</span>
            </button>

            <button
                className={isFollowed ? "follow-btn followed" : "follow-btn"}
                onClick={onToggleFollow}
                type="button"
            >
                <span aria-hidden="true">{isFollowed ? "✓" : "+"}</span>
                <span>{isFollowed ? "Following" : "Follow"}</span>
            </button>

            <button
                className={isSaved ? "library-btn saved" : "library-btn"}
                onClick={onToggleSave}
                title={isSaved ? "Remove from library" : "Save to library"}
                type="button"
            >
                <span aria-hidden="true">{isSaved ? "✓" : "+"}</span>
                <span>{isSaved ? "Saved" : "Save"}</span>
            </button>

            <button
                className="playlist-btn"
                onClick={onOpenPlaylist}
                title="Add to playlist"
                type="button"
            >
                <Plus size={15} />
                <span>Playlist</span>
            </button>

            <button
                className={isQueued ? "queue-btn queued" : "queue-btn"}
                onClick={onToggleQueue}
                title={isQueued ? "Remove from queue" : "Add to queue"}
                type="button"
            >
                <ListMusic size={15} />
                <span>{isQueued ? "Remove" : "Queue"}</span>
            </button>

            <button
                className={isDownloading ? "download-btn is-busy" : "download-btn"}
                onClick={onDownload}
                disabled={Boolean(isDownloading)}
                title="Download"
                type="button"
                data-media-action="download"
                aria-label={isDownloading ? "Preparing download…" : "Download"}
            >
                <Download size={15} aria-hidden="true" />
                <span>{isDownloading ? "Preparing download…" : "Download"}</span>
            </button>

            {canDelete ? (
                <button
                    className={`danger-btn ${deleteClassName || ""}`.trim()}
                    onClick={onDelete}
                    type="button"
                >
                    <Trash2 size={15} />
                    Delete
                </button>
            ) : null}
        </>
    );
}

/** DESKTOP ONLY — unified song card with consistent actions on every page. */
export function DesktopSongMediaCard({
    song,
    state,
    handlers,
    variant = "default",
    layout = "grid",
}: DesktopSongMediaCardProps) {
    const [overflowOpen, setOverflowOpen] = useState(false);
    const [overflowTrigger, setOverflowTrigger] = useState<HTMLElement | null>(null);
    const cardClassName =
        variant === "library"
            ? "song-card library-card media-card"
            : "song-card media-card";

    if (layout === "list") {
        return (
            <>
                <DesktopMediaListRow
                    kind="song"
                    cover={song.cover}
                    title={<>{song.title}{state.verifiedBadge}</>}
                    secondary={song.artist}
                    tertiary={state.producerCredit ? `Produced by ${state.producerCredit}` : `${song.plays} plays · ${song.time}`}
                    onPlay={handlers.onPlay}
                    onOpenOverflow={(trigger) => {
                        setOverflowTrigger(trigger);
                        setOverflowOpen(true);
                    }}
                    overflowLabel={`More actions for ${song.title}`}
                />
                <DesktopFloatingActionMenu
                    open={overflowOpen}
                    anchorEl={overflowTrigger}
                    label={`More actions for ${song.title}`}
                    actions={buildSongVideoOverflowActions("song", state, handlers)}
                    onClose={() => {
                        setOverflowOpen(false);
                        setOverflowTrigger(null);
                    }}
                />
            </>
        );
    }

    return (
        <DesktopMediaGridCard
            kind="song"
            className={cardClassName}
            cover={song.cover}
            badge={song.category}
            title={
                <>
                    {song.title}
                    {state.verifiedBadge}
                </>
            }
            secondary={
                <DesktopArtistNameButton
                    name={song.artist}
                    onOpen={handlers.onOpenArtist}
                />
            }
            tertiary={
                state.producerCredit
                    ? `Produced by ${state.producerCredit} · ${song.time}`
                    : `${song.plays} plays · ${song.time}`
            }
            onPlay={handlers.onPlay}
            overflowLabel={`More actions for ${song.title}`}
            menuActions={buildSongVideoOverflowActions("song", state, handlers)}
        />
    );
}

/** DESKTOP ONLY — unified video card with consistent actions on every page. */
export function DesktopVideoMediaCard({
    video,
    state,
    handlers,
    variant = "default",
    likeLabel,
    layout = "grid",
}: DesktopVideoMediaCardProps) {
    const [overflowOpen, setOverflowOpen] = useState(false);
    const [overflowTrigger, setOverflowTrigger] = useState<HTMLElement | null>(null);
    const cardClassName =
        variant === "library"
            ? "video-card library-card media-card"
            : "video-card media-card";

    if (layout === "list") {
        return (
            <>
                <DesktopMediaListRow
                    kind="video"
                    cover={video.cover}
                    title={<>{video.title}{state.verifiedBadge}</>}
                    secondary={video.creator}
                    tertiary={`${video.views} views · ${video.uploaded}`}
                    onPlay={handlers.onPlay}
                    onOpenOverflow={(trigger) => {
                        setOverflowTrigger(trigger);
                        setOverflowOpen(true);
                    }}
                    overflowLabel={`More actions for ${video.title}`}
                />
                <DesktopFloatingActionMenu
                    open={overflowOpen}
                    anchorEl={overflowTrigger}
                    label={`More actions for ${video.title}`}
                    actions={buildSongVideoOverflowActions("video", state, handlers)}
                    onClose={() => {
                        setOverflowOpen(false);
                        setOverflowTrigger(null);
                    }}
                />
            </>
        );
    }

    return (
        <DesktopMediaGridCard
            kind="video"
            className={cardClassName}
            cover={video.cover}
            badge={
                state.mobileIncompatible
                    ? "Conversion required"
                    : video.category
            }
            title={
                <>
                    {video.title}
                    {state.verifiedBadge}
                </>
            }
            secondary={
                <DesktopArtistNameButton
                    name={video.creator}
                    onOpen={handlers.onOpenArtist}
                />
            }
            tertiary={`${video.views} views · ${video.uploaded}`}
            onPlay={handlers.onPlay}
            overflowLabel={`More actions for ${video.title}`}
            menuActions={buildSongVideoOverflowActions("video", state, handlers)}
        />
    );
}

export type { DesktopSongCardHandlers, DesktopVideoCardHandlers };
