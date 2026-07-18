"use client";

import {
    Bell,
    BookOpen,
    Film,
    ListMusic,
    MessageCircle,
    Plus,
    Share2,
    Trash2,
} from "lucide-react";
import type {
    DesktopSongCardHandlers,
    DesktopSongCardModel,
    DesktopSongCardState,
    DesktopVideoCardHandlers,
    DesktopVideoCardModel,
    DesktopVideoCardState,
} from "../lib/desktop-media-card-types";

type DesktopSongMediaCardProps = {
    song: DesktopSongCardModel;
    state: DesktopSongCardState;
    handlers: DesktopSongCardHandlers;
    variant?: "default" | "library";
};

type DesktopVideoMediaCardProps = {
    video: DesktopVideoCardModel;
    state: DesktopVideoCardState;
    handlers: DesktopVideoCardHandlers;
    variant?: "default" | "library";
    likeLabel?: string;
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
    onOpenComments,
    onShare,
    shareLabel,
    onReport,
    onClaim,
}: {
    commentCount: number;
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
            <button onClick={onClaim} type="button">
                <BookOpen size={14} />
                Claim
            </button>
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
    canDelete,
    deleteClassName,
    onPlay,
    onToggleLike,
    onToggleFollow,
    onToggleSave,
    onToggleQueue,
    onOpenPlaylist,
    onDelete,
}: {
    playLabel: string;
    isLiked: boolean;
    likeLabel: string;
    isFollowed: boolean;
    isSaved: boolean;
    isQueued: boolean;
    canDelete: boolean;
    deleteClassName?: string;
    onPlay: () => void;
    onToggleLike: () => void;
    onToggleFollow: () => void;
    onToggleSave: () => void;
    onToggleQueue: () => void;
    onOpenPlaylist: () => void;
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
                <span aria-hidden="true">{isFollowed ? "✓" : "👤"}</span>
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
}: DesktopSongMediaCardProps) {
    const cardClassName =
        variant === "library"
            ? "song-card library-card media-card"
            : "song-card media-card";

    return (
        <article className={cardClassName}>
            <div className="cover-wrap">
                <img className="cover" src={song.cover} alt="" />
                <span className="badge">{song.category}</span>
                <span className="duration">{song.time}</span>
                <div className="card-header-actions">
                    <button
                        className={state.isQueued ? "card-icon-btn queued" : "card-icon-btn"}
                        onClick={handlers.onToggleQueue}
                        title={state.isQueued ? "Remove from queue" : "Add to queue"}
                        type="button"
                    >
                        <ListMusic size={15} />
                    </button>
                </div>
            </div>

            <div className="song-body media-card-content">
                <div className="song-head">
                    <img src={song.cover} alt="" />
                    <div>
                        <h3 className="media-card-title">
                            {song.title}
                            {state.verifiedBadge}
                        </h3>
                        <p className="media-card-artist">
                            <DesktopArtistNameButton
                                name={song.artist}
                                onOpen={handlers.onOpenArtist}
                            />
                        </p>
                    </div>
                </div>

                <p className="desc">
                    {state.producerCredit
                        ? `Produced by ${state.producerCredit}`
                        : "No producer assigned."}
                </p>

                <div className="stats">
                    <span>{song.mediaKind === "video" ? "video" : "audio"}</span>
                    <span>{song.plays} plays</span>
                    <span>{song.likes + (state.isLiked ? 1 : 0)} likes</span>
                    <span>{song.uploaded}</span>
                </div>

                <div className="card-actions media-card-actions">
                    <DesktopMediaCardPrimaryActions
                        playLabel={song.mediaKind === "video" ? "Open" : "Play"}
                        isLiked={state.isLiked}
                        likeLabel={state.isLiked ? "Liked" : "Like"}
                        isFollowed={state.isFollowed}
                        isSaved={state.isSaved}
                        isQueued={state.isQueued}
                        canDelete={state.canDelete}
                        deleteClassName={variant === "library" ? "library-song-delete-btn" : undefined}
                        onPlay={handlers.onPlay}
                        onToggleLike={handlers.onToggleLike}
                        onToggleFollow={handlers.onToggleFollow}
                        onToggleSave={handlers.onToggleSave}
                        onToggleQueue={handlers.onToggleQueue}
                        onOpenPlaylist={handlers.onOpenPlaylist}
                        onDelete={handlers.onDelete}
                    />
                </div>

                <DesktopMediaCardSecondaryActions
                    commentCount={state.commentCount}
                    onOpenComments={handlers.onOpenComments}
                    onShare={handlers.onShare}
                    shareLabel="Share Song"
                    onReport={handlers.onReport}
                    onClaim={handlers.onClaim}
                />
            </div>
        </article>
    );
}

/** DESKTOP ONLY — unified video card with consistent actions on every page. */
export function DesktopVideoMediaCard({
    video,
    state,
    handlers,
    variant = "default",
    likeLabel,
}: DesktopVideoMediaCardProps) {
    const cardClassName =
        variant === "library"
            ? "video-card library-card media-card"
            : "video-card media-card";

    return (
        <article className={cardClassName}>
            <div className="video-cover-wrap">
                <button className="video-cover" onClick={handlers.onPlay} type="button">
                    <img src={video.cover} alt="" />
                    <span>{video.category}</span>
                    <Film size={34} />
                </button>
                {state.mobileIncompatible ? (
                    <span className="video-compat-badge">Conversion required</span>
                ) : null}
            </div>

            <div className="video-card-body media-card-content">
                <div className="card-meta">
                    <h3 className="media-card-title">
                        {video.title}
                        {state.verifiedBadge}
                    </h3>
                    <p className="media-card-artist">
                        <DesktopArtistNameButton
                            name={video.creator}
                            onOpen={handlers.onOpenArtist}
                        />
                    </p>
                </div>

                <div className="stats">
                    <span>{video.views} views</span>
                    <span>{video.likes || 0} likes</span>
                    <span>{video.uploaded}</span>
                </div>

                {state.mobileCompatibilityWarning ? (
                    <p className="video-compat-warning">{state.mobileCompatibilityWarning}</p>
                ) : null}

                <div className="card-actions media-card-actions">
                    <DesktopMediaCardPrimaryActions
                        playLabel="Play"
                        isLiked={state.isLiked}
                        likeLabel={likeLabel || (state.isLiked ? "Liked" : "Like")}
                        isFollowed={state.isFollowed}
                        isSaved={state.isSaved}
                        isQueued={state.isQueued}
                        canDelete={state.canDelete}
                        onPlay={handlers.onPlay}
                        onToggleLike={handlers.onToggleLike}
                        onToggleFollow={handlers.onToggleFollow}
                        onToggleSave={handlers.onToggleSave}
                        onToggleQueue={handlers.onToggleQueue}
                        onOpenPlaylist={handlers.onOpenPlaylist}
                        onDelete={handlers.onDelete}
                    />
                </div>

                <DesktopMediaCardSecondaryActions
                    commentCount={state.commentCount}
                    onOpenComments={handlers.onOpenComments}
                    onShare={handlers.onShare}
                    shareLabel="Share Video"
                    onReport={handlers.onReport}
                    onClaim={handlers.onClaim}
                />
            </div>
        </article>
    );
}

export type { DesktopSongCardHandlers, DesktopVideoCardHandlers };
