/** DESKTOP ONLY — shared media card models and action handler contracts. */

import type { ReactNode } from "react";

export type DesktopSongCardModel = {
    id: string;
    title: string;
    artist: string;
    category: string;
    time: string;
    plays: number;
    likes: number;
    uploaded: string;
    cover: string;
    mediaKind?: "audio" | "video";
};

export type DesktopVideoCardModel = {
    id: string;
    title: string;
    creator: string;
    category: string;
    cover: string;
    uploaded: string;
    views: string | number;
    likes?: string | number;
    likedByUser?: boolean;
};

export type DesktopSongCardState = {
    isLiked: boolean;
    isSaved: boolean;
    isFollowed: boolean;
    isQueued: boolean;
    canDelete: boolean;
    /** Copyright Claim — creator/owner only; never for Listeners. */
    canClaim: boolean;
    producerCredit: string | null;
    commentCount: number;
    verifiedBadge?: ReactNode;
};

export type DesktopVideoCardState = {
    isLiked: boolean;
    isSaved: boolean;
    isFollowed: boolean;
    isQueued: boolean;
    canDelete: boolean;
    /** Copyright Claim — creator/owner only; never for Listeners. */
    canClaim: boolean;
    commentCount: number;
    verifiedBadge?: ReactNode;
    mobileIncompatible?: boolean;
    mobileCompatibilityWarning?: string | null;
};

export type DesktopSongCardHandlers = {
    onPlay: () => void;
    onToggleLike: () => void;
    onToggleFollow: () => void;
    onToggleSave: () => void;
    /** Add when not queued; remove when already queued. */
    onToggleQueue: () => void;
    onOpenPlaylist: () => void;
    onDelete: () => void;
    onOpenComments: () => void;
    onShare: () => void;
    onReport: () => void;
    onClaim: () => void;
    onOpenArtist: (name: string) => void;
};

export type DesktopVideoCardHandlers = {
    onPlay: () => void;
    onToggleLike: () => void;
    onToggleFollow: () => void;
    onToggleSave: () => void;
    /** Add when not queued; remove when already queued. */
    onToggleQueue: () => void;
    onOpenPlaylist: () => void;
    onDelete: () => void;
    onOpenComments: () => void;
    onShare: () => void;
    onReport: () => void;
    onClaim: () => void;
    onOpenArtist: (name: string) => void;
};
