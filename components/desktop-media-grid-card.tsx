"use client";

import { MoreHorizontal, Play } from "lucide-react";
import {
    useCallback,
    useId,
    useRef,
    useState,
    type ReactNode,
} from "react";
import type { MobileContentAction } from "../lib/mobile-content-actions";
import { DesktopFloatingActionMenu } from "./desktop-floating-action-menu";
import "./desktop-media-grid-card.css";
import "./card-system/card-system.css";
import "./mobile-compact-layout.css";

export type DesktopMediaGridCardProps = {
    kind: string;
    cover: string;
    title: ReactNode;
    secondary: ReactNode;
    tertiary?: ReactNode;
    className?: string;
    badge?: ReactNode;
    showPlay?: boolean;
    onPlay?: () => void;
    onOpen?: () => void;
    menuActions?: MobileContentAction[];
    overflowLabel?: string;
    /** Card-system family tag. Defaults to media; use ringtone for ringtone grids. */
    cardFamily?: "media" | "ringtone";
};

/**
 * THE shared Desktop Grid media card — artwork, copy, hover Play/⋯, overflow menu.
 * List View must use DesktopMediaListRow instead.
 */
export function DesktopMediaGridCard({
    kind,
    cover,
    title,
    secondary,
    tertiary,
    className = "",
    badge,
    showPlay = true,
    onPlay,
    onOpen,
    menuActions,
    overflowLabel,
    cardFamily = "media",
}: DesktopMediaGridCardProps) {
    const [hovered, setHovered] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);
    const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
    const moreRef = useRef<HTMLButtonElement | null>(null);
    const menuId = useId();
    const closeMenu = useCallback(() => {
        setMenuOpen(false);
        setMenuAnchor(null);
    }, []);
    const label =
        overflowLabel ||
        `More actions for ${typeof title === "string" ? title : "item"}`;
    const openPrimary = onOpen || onPlay;
    const actions = menuActions || [];
    const showOverflow = actions.length > 0;
    const controlsVisible = hovered || menuOpen;
    const family = kind === "ringtone" ? "ringtone" : cardFamily;

    return (
        <article
            className={["desktop-media-grid-card", "cs-media-card", className].filter(Boolean).join(" ")}
            data-card-family={family}
            data-desktop-media-card={kind}
            data-desktop-layout="grid"
            data-desktop-media-grid-card="true"
            data-desktop-grid-card="true"
            data-desktop-compact-grid="true"
            data-grid-card-hover={controlsVisible ? "true" : "false"}
            data-grid-menu-open={menuOpen ? "true" : "false"}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => {
                if (!menuOpen) setHovered(false);
            }}
        >
            <div className="desktop-media-grid-card__art">
                <button
                    className="desktop-media-grid-card__art-btn"
                    type="button"
                    aria-label={typeof title === "string" ? title : "Open"}
                    onClick={() => openPrimary?.()}
                >
                    <img className="desktop-media-grid-card__img" src={cover} alt="" />
                </button>
                {badge ? (
                    <span className="desktop-media-grid-card__badge">{badge}</span>
                ) : null}
                {showPlay && onPlay ? (
                    <button
                        className="desktop-media-grid-card__play"
                        type="button"
                        aria-label="Play"
                        tabIndex={controlsVisible ? 0 : -1}
                        onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            onPlay();
                        }}
                    >
                        <Play size={15} fill="currentColor" aria-hidden="true" />
                    </button>
                ) : null}
                {showOverflow ? (
                    <button
                        ref={moreRef}
                        className="desktop-media-grid-card__more"
                        data-desktop-overflow-trigger="true"
                        type="button"
                        aria-label={label}
                        aria-haspopup="menu"
                        aria-expanded={menuOpen}
                        aria-controls={menuOpen ? menuId : undefined}
                        tabIndex={controlsVisible ? 0 : -1}
                        onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            setHovered(true);
                            setMenuOpen((open) => {
                                const next = !open;
                                setMenuAnchor(next ? event.currentTarget : null);
                                return next;
                            });
                        }}
                    >
                        <MoreHorizontal size={16} aria-hidden="true" />
                    </button>
                ) : null}
            </div>
            <div className="desktop-media-grid-card__copy">
                <h3 className="desktop-media-grid-card__title media-card-title">{title}</h3>
                <p className="desktop-media-grid-card__secondary media-card-artist">{secondary}</p>
                <small className="desktop-media-grid-card__meta">
                    {tertiary || "\u00a0"}
                </small>
            </div>
            <DesktopFloatingActionMenu
                open={menuOpen}
                anchorEl={menuAnchor || moreRef.current}
                label={label}
                actions={actions}
                menuId={menuId}
                onClose={closeMenu}
            />
        </article>
    );
}

/** @deprecated Use DesktopMediaGridCard — kept as a thin alias during migration. */
export {
    DesktopMediaGridCard as DesktopCompactGridCard,
    type DesktopMediaGridCardProps as DesktopCompactGridCardProps,
};
