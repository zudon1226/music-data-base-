"use client";

import { createPortal } from "react-dom";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { MobileContentAction } from "../lib/mobile-content-actions";
import { sanitizeMobileContentActions } from "../lib/mobile-content-actions";
import {
    claimDesktopGridMenu,
    releaseDesktopGridMenu,
} from "../lib/desktop-grid-menu-registry";
import "./desktop-floating-action-menu.css";

export type DesktopFloatingActionMenuProps = {
    open: boolean;
    anchorEl: HTMLElement | null;
    label?: string;
    actions: MobileContentAction[];
    menuId?: string;
    onClose: () => void;
};

const MENU_WIDTH = 208;
const VIEWPORT_PAD = 12;
const MENU_Z = 200;

/**
 * Shared desktop floating overflow menu for Grid and List.
 * Portaled to document.body; anchored to the clicked three-dot trigger.
 * Does not change card/row geometry. Pages supply their own action lists.
 */
export function DesktopFloatingActionMenu({
    open,
    anchorEl,
    label = "More actions",
    actions,
    menuId,
    onClose,
}: DesktopFloatingActionMenuProps) {
    const generatedId = useId();
    const resolvedId = menuId || generatedId;
    const menuRef = useRef<HTMLDivElement | null>(null);
    const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
    const safeActions = sanitizeMobileContentActions(actions);

    useLayoutEffect(() => {
        if (!open || !anchorEl) {
            setPos(null);
            return;
        }

        const place = () => {
            if (!anchorEl.isConnected) {
                onClose();
                return;
            }
            const rect = anchorEl.getBoundingClientRect();
            if (rect.width === 0 && rect.height === 0) {
                onClose();
                return;
            }
            const menuEl = menuRef.current;
            const menuHeight =
                menuEl?.offsetHeight || Math.min(12 + safeActions.length * 38, window.innerHeight - VIEWPORT_PAD * 2);
            const menuWidth = Math.min(MENU_WIDTH, window.innerWidth - VIEWPORT_PAD * 2);

            let top = rect.bottom + 6;
            let left = rect.right - menuWidth;

            if (left < VIEWPORT_PAD) left = VIEWPORT_PAD;
            if (left + menuWidth > window.innerWidth - VIEWPORT_PAD) {
                left = Math.max(VIEWPORT_PAD, window.innerWidth - menuWidth - VIEWPORT_PAD);
            }
            if (top + menuHeight > window.innerHeight - VIEWPORT_PAD) {
                top = Math.max(VIEWPORT_PAD, rect.top - menuHeight - 6);
            }
            /* Hard clamp so the panel stays visible even if the trigger scrolled off-screen. */
            const maxTop = Math.max(VIEWPORT_PAD, window.innerHeight - menuHeight - VIEWPORT_PAD);
            const maxLeft = Math.max(VIEWPORT_PAD, window.innerWidth - menuWidth - VIEWPORT_PAD);
            top = Math.min(Math.max(VIEWPORT_PAD, top), maxTop);
            left = Math.min(Math.max(VIEWPORT_PAD, left), maxLeft);

            setPos({ top, left });
        };

        place();
        const raf = window.requestAnimationFrame(place);
        window.addEventListener("resize", place);
        window.addEventListener("scroll", place, true);
        return () => {
            window.cancelAnimationFrame(raf);
            window.removeEventListener("resize", place);
            window.removeEventListener("scroll", place, true);
        };
    }, [open, anchorEl, safeActions.length, onClose]);

    useEffect(() => {
        if (!open) {
            releaseDesktopGridMenu(onClose);
            return;
        }
        claimDesktopGridMenu(onClose);

        const onPointerDown = (event: PointerEvent) => {
            const target = event.target;
            if (!(target instanceof Node)) return;
            if (menuRef.current?.contains(target)) return;
            if (anchorEl?.contains(target)) return;
            onClose();
        };
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                event.preventDefault();
                onClose();
                window.setTimeout(() => anchorEl?.focus?.(), 0);
            }
        };

        document.addEventListener("pointerdown", onPointerDown, true);
        window.addEventListener("keydown", onKeyDown);
        return () => {
            document.removeEventListener("pointerdown", onPointerDown, true);
            window.removeEventListener("keydown", onKeyDown);
            releaseDesktopGridMenu(onClose);
        };
    }, [open, onClose, anchorEl]);

    if (!open || !anchorEl || typeof document === "undefined" || safeActions.length === 0) {
        return null;
    }

    const width = Math.min(MENU_WIDTH, typeof window !== "undefined" ? window.innerWidth - VIEWPORT_PAD * 2 : MENU_WIDTH);

    return createPortal(
        <div
            ref={menuRef}
            id={resolvedId}
            className="desktop-floating-action-menu"
            data-desktop-floating-action-menu="true"
            role="menu"
            aria-label={label}
            style={{
                position: "fixed",
                top: pos ? pos.top : -9999,
                left: pos ? pos.left : -9999,
                width,
                maxWidth: "calc(100vw - 24px)",
                zIndex: MENU_Z,
                visibility: pos ? "visible" : "hidden",
            }}
            onClick={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
        >
            {safeActions.map((action) => (
                <button
                    key={`${action.id}-${action.label}`}
                    type="button"
                    role="menuitem"
                    className={
                        action.destructive
                            ? "desktop-floating-action-menu__item desktop-floating-action-menu__item--danger"
                            : "desktop-floating-action-menu__item"
                    }
                    disabled={action.disabled}
                    onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        onClose();
                        action.onClick();
                    }}
                >
                    {action.label}
                </button>
            ))}
        </div>,
        document.body,
    );
}

/** @deprecated Alias — same shared floating menu. */
export const DesktopGridCardMenu = DesktopFloatingActionMenu;
export type DesktopGridCardMenuProps = DesktopFloatingActionMenuProps;
