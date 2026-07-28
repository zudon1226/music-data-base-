"use client";

import { MoreHorizontal, Play } from "lucide-react";
import type { KeyboardEvent, MouseEvent, ReactNode } from "react";
import { useMobileDisplayMode } from "../lib/mobile-display-mode";

export type MobileMediaCardKind =
    | "song"
    | "video"
    | "album"
    | "playlist"
    | "ringtone"
    | "purchased-ringtone"
    | "queue"
    | "recent"
    | "vault"
    | "creator"
    | "artist"
    | "producer"
    | "beat";

export type MobileMediaCardProps = {
    kind: MobileMediaCardKind;
    title: string;
    subtitle?: ReactNode;
    meta?: ReactNode;
    /** Prefer separate clamped chips over one joined "a · b" string. */
    metaParts?: Array<string | null | undefined>;
    cover: string;
    className?: string;
    /** square art (default) | 16:9 video thumb | grid tile */
    artVariant?: "square" | "video" | "tile";
    /** When omitted, uses shared MobileDisplayModeContext. */
    layout?: "list" | "grid";
    /** When true with video art, artwork itself is the play control. Kept for API compat. */
    playOnArt?: boolean;
    showPlay?: boolean;
    onPlay?: () => void;
    /** Primary card-body navigation (e.g. open album detail). Play/overflow must not trigger this. */
    onOpen?: () => void;
    onOpenOverflow?: (trigger: HTMLElement) => void;
    overflowLabel?: string;
    leading?: ReactNode;
    active?: boolean;
};

function normalizeMetaParts(metaParts?: Array<string | null | undefined>, meta?: ReactNode): string[] {
    if (Array.isArray(metaParts)) {
        return metaParts.map((part) => String(part || "").trim()).filter(Boolean);
    }
    if (typeof meta === "string") {
        return meta
            .split(/\s*[·|•]\s*/)
            .map((part) => part.trim())
            .filter(Boolean);
    }
    return [];
}

function stopAndRun(event: MouseEvent, fn?: () => void) {
    event.preventDefault();
    event.stopPropagation();
    fn?.();
}

/**
 * Universal compact mobile media card — Library song-row / cover-tile design language.
 * Desktop surfaces must not use this; callers gate with useMobileCompactLayout().
 */
export function MobileMediaCard({
    kind,
    title,
    subtitle,
    meta,
    metaParts,
    cover,
    className = "",
    artVariant = "square",
    layout: layoutProp,
    showPlay = true,
    onPlay,
    onOpen,
    onOpenOverflow,
    overflowLabel,
    leading,
    active = false,
}: MobileMediaCardProps) {
    // playOnArt remains on the props type for caller compatibility; video thumbs always play on art.
    const contextLayout = useMobileDisplayMode();
    const layout = layoutProp ?? contextLayout;

    const resolvedArt: "square" | "video" | "tile" =
        layout === "grid"
            ? "tile"
            : artVariant === "video"
                ? "video"
                : artVariant === "tile"
                    ? "tile"
                    : "square";

    const isTile = resolvedArt === "tile";
    const isVideo = resolvedArt === "video";
    const isPlaylist = kind === "playlist";
    const isAlbumTile = isTile && kind === "album";
    const parts = normalizeMetaParts(metaParts, meta);
    const hasSubtitle = subtitle != null && subtitle !== "";
    const hasMeta = parts.length > 0 || (meta != null && meta !== "" && typeof meta !== "string");
    const openLabel = `Open ${title}`;

    const rowClass = [
        "mobile-media-card",
        `mobile-media-card--${kind}`,
        isVideo ? "mobile-video-row" : "",
        isTile ? "mobile-media-card--tile" : "mobile-song-row",
        isAlbumTile || (isTile && kind === "album") ? "mobile-album-tile" : "",
        !isTile && kind === "album" ? "mobile-album-row" : "",
        isPlaylist ? "playlist-tile media-card" : "",
        onOpen ? "is-openable" : "",
        active ? "is-active active" : "",
        className,
    ].filter(Boolean).join(" ");

    const onCardKeyDown = onOpen
        ? (event: KeyboardEvent<HTMLElement>) => {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            event.stopPropagation();
            onOpen();
        }
        : undefined;

    const overflowButton = onOpenOverflow ? (
        <button
            className={isAlbumTile || (isTile && !isPlaylist) ? "mobile-album-tile-more mobile-compact-more" : "mobile-compact-more"}
            data-mobile-overflow-trigger="true"
            data-mobile-song-overflow={kind === "song" || kind === "queue" || kind === "recent" ? "true" : undefined}
            onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onOpenOverflow(event.currentTarget);
            }}
            type="button"
            aria-label={overflowLabel || `More actions for ${title}`}
            aria-haspopup="dialog"
        >
            <MoreHorizontal size={isTile ? 16 : 18} aria-hidden="true" />
        </button>
    ) : null;

    const playButton = showPlay && onPlay && !isVideo ? (
        <button
            className="mobile-compact-play"
            onClick={(event) => stopAndRun(event, onPlay)}
            type="button"
            aria-label={`Play ${title}`}
        >
            <Play size={16} fill="currentColor" aria-hidden="true" />
        </button>
    ) : null;

    const metaNode = parts.length > 0 ? (
        <small className="mobile-media-card-meta" data-meta-parts={String(parts.length)}>
            {parts.map((part) => (
                <span className="mobile-media-card-meta-part" key={`${kind}-${part}`}>
                    {part}
                </span>
            ))}
        </small>
    ) : hasMeta ? (
        <small className="mobile-media-card-meta">{meta}</small>
    ) : null;

    const copy = (
        <div
            className={isTile ? "mobile-album-tile-copy mobile-compact-copy mobile-media-card-text" : "mobile-compact-copy mobile-media-card-text"}
            data-mobile-card-text="true"
        >
            <strong className="media-card-title">{title || "\u00A0"}</strong>
            {hasSubtitle ? (
                <span className="media-card-artist">{subtitle}</span>
            ) : null}
            {metaNode}
        </div>
    );

    // Grid cover tiles (albums, songs, ringtones, playlists in grid, etc.)
    if (isTile) {
        const artOpensDetail = Boolean(onOpen);
        return (
            <article
                className={rowClass}
                data-compact-mobile-card={kind}
                data-shared-mobile-card="true"
                data-mobile-album-tile={
                    kind === "album"
                    || kind === "playlist"
                    || kind === "ringtone"
                    || kind === "purchased-ringtone"
                    || kind === "song"
                    || kind === "beat"
                    || kind === "video"
                        ? "true"
                        : undefined
                }
                data-mobile-layout="grid"
                onClick={onOpen}
                onKeyDown={onCardKeyDown}
                role={onOpen ? "button" : undefined}
                tabIndex={onOpen ? 0 : undefined}
                aria-label={onOpen ? openLabel : undefined}
            >
                <div className="mobile-album-tile-art-wrap">
                    {artOpensDetail ? (
                        <button
                            className="mobile-album-tile-art-btn"
                            onClick={(event) => stopAndRun(event, onOpen)}
                            type="button"
                            aria-label={openLabel}
                        >
                            <img className="mobile-album-tile-art mobile-compact-art" src={cover} alt="" width={120} height={120} />
                        </button>
                    ) : onPlay ? (
                        <button
                            className="mobile-album-tile-art-btn"
                            onClick={(event) => stopAndRun(event, onPlay)}
                            type="button"
                            aria-label={`Play ${title}`}
                        >
                            <img className="mobile-album-tile-art mobile-compact-art" src={cover} alt="" width={120} height={120} />
                        </button>
                    ) : (
                        <img className="mobile-album-tile-art mobile-compact-art" src={cover} alt="" width={120} height={120} />
                    )}
                    {artOpensDetail && showPlay && onPlay ? (
                        <button
                            className="mobile-album-tile-play mobile-compact-play"
                            onClick={(event) => stopAndRun(event, onPlay)}
                            type="button"
                            aria-label={`Play ${title}`}
                        >
                            <Play size={14} fill="currentColor" aria-hidden="true" />
                        </button>
                    ) : null}
                    {overflowButton}
                </div>
                {copy}
            </article>
        );
    }

    // Playlist list rows — art + text must stay horizontal (never vertical letters)
    if (isPlaylist) {
        return (
            <article
                className={rowClass}
                data-compact-mobile-card="playlist"
                data-shared-mobile-card="true"
                data-mobile-song-row="true"
                data-mobile-layout="list"
                onClick={onOpen}
                onKeyDown={onCardKeyDown}
                role={onOpen ? "button" : undefined}
                tabIndex={onOpen ? 0 : undefined}
                aria-label={onOpen ? openLabel : undefined}
            >
                <div className="playlist-tile-main">
                    <img className="mobile-compact-art" src={cover} alt="" width={64} height={64} />
                    {copy}
                </div>
                <div className="mobile-compact-controls" data-playlist-controls="true">
                    {playButton}
                    {overflowButton}
                </div>
            </article>
        );
    }

    // Video compact rows
    if (isVideo) {
        return (
            <article
                className={rowClass}
                data-compact-mobile-card={kind}
                data-shared-mobile-card="true"
                data-mobile-video-row="true"
                data-mobile-layout="list"
                onClick={onOpen}
                onKeyDown={onCardKeyDown}
                role={onOpen ? "button" : undefined}
                tabIndex={onOpen ? 0 : undefined}
                aria-label={onOpen ? openLabel : undefined}
            >
                {leading ? <div className="mobile-media-card-leading">{leading}</div> : null}
                {onPlay ? (
                    <button
                        className="mobile-compact-video-thumb"
                        onClick={(event) => stopAndRun(event, onPlay)}
                        type="button"
                        aria-label={`Play ${title}`}
                    >
                        <img src={cover} alt="" width={148} height={84} />
                        <span className="mobile-compact-video-play" aria-hidden="true">
                            <Play size={18} fill="currentColor" />
                        </span>
                    </button>
                ) : (
                    <img src={cover} alt="" width={148} height={84} />
                )}
                {copy}
                <div className="mobile-compact-controls">
                    {overflowButton}
                </div>
            </article>
        );
    }

    // Standard compact list rows (songs, queue, recent, vault, creators, beats, albums list)
    return (
        <article
            className={rowClass}
            data-compact-mobile-card={kind}
            data-shared-mobile-card="true"
            data-mobile-song-row="true"
            data-mobile-album-row={kind === "album" ? "true" : undefined}
            data-mobile-creator-row={kind === "creator" || kind === "artist" || kind === "producer" ? "true" : undefined}
            data-mobile-layout="list"
            onClick={onOpen}
            onKeyDown={onCardKeyDown}
            role={onOpen ? "button" : undefined}
            tabIndex={onOpen ? 0 : undefined}
            aria-label={onOpen ? openLabel : undefined}
        >
            {leading ? <div className="mobile-media-card-leading">{leading}</div> : null}
            <img className="mobile-compact-art" src={cover} alt="" width={56} height={56} />
            {copy}
            <div className="mobile-compact-controls">
                {playButton}
                {overflowButton}
            </div>
        </article>
    );
}
