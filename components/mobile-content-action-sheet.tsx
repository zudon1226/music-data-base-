"use client";

import { Heart, X } from "lucide-react";
import { useEffect, useId, useRef } from "react";
import {
    sanitizeMobileContentActions,
    type MobileContentAction,
    type MobileContentSheetMeta,
} from "../lib/mobile-content-actions";

type MobileContentActionSheetProps = {
    open: boolean;
    meta: MobileContentSheetMeta | null;
    actions: MobileContentAction[];
    onClose: () => void;
    restoreFocusEl?: HTMLElement | null;
};

export function MobileContentActionSheet({
    open,
    meta,
    actions,
    onClose,
    restoreFocusEl,
}: MobileContentActionSheetProps) {
    const titleId = useId();
    const sheetRef = useRef<HTMLDivElement | null>(null);
    const closeBtnRef = useRef<HTMLButtonElement | null>(null);
    const previousFocusRef = useRef<HTMLElement | null>(null);
    const scrollLockRef = useRef<{ y: number; htmlOverflow: string; bodyOverflow: string; bodyPosition: string; bodyTop: string; bodyWidth: string } | null>(null);

    useEffect(() => {
        if (!open) return;
        previousFocusRef.current = (restoreFocusEl
            || (document.activeElement instanceof HTMLElement ? document.activeElement : null));

        const y = window.scrollY || document.documentElement.scrollTop || 0;
        scrollLockRef.current = {
            y,
            htmlOverflow: document.documentElement.style.overflow,
            bodyOverflow: document.body.style.overflow,
            bodyPosition: document.body.style.position,
            bodyTop: document.body.style.top,
            bodyWidth: document.body.style.width,
        };
        document.documentElement.style.overflow = "hidden";
        document.body.style.overflow = "hidden";
        document.body.style.position = "fixed";
        document.body.style.top = `-${y}px`;
        document.body.style.width = "100%";

        const focusTimer = window.setTimeout(() => {
            closeBtnRef.current?.focus();
        }, 0);

        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                event.preventDefault();
                onClose();
                return;
            }
            if (event.key !== "Tab" || !sheetRef.current) return;
            const focusable = sheetRef.current.querySelectorAll<HTMLElement>(
                'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
            );
            if (focusable.length === 0) return;
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            }
            else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        };
        window.addEventListener("keydown", onKeyDown);
        return () => {
            window.clearTimeout(focusTimer);
            window.removeEventListener("keydown", onKeyDown);
            const lock = scrollLockRef.current;
            if (lock) {
                document.documentElement.style.overflow = lock.htmlOverflow;
                document.body.style.overflow = lock.bodyOverflow;
                document.body.style.position = lock.bodyPosition;
                document.body.style.top = lock.bodyTop;
                document.body.style.width = lock.bodyWidth;
                window.scrollTo(0, lock.y);
                scrollLockRef.current = null;
            }
            const restore = previousFocusRef.current;
            if (restore && typeof restore.focus === "function") {
                window.setTimeout(() => restore.focus(), 0);
            }
        };
    }, [open, onClose, restoreFocusEl]);

    if (!open || !meta) return null;

    const safeActions = sanitizeMobileContentActions(actions);
    const primaryActions = safeActions.filter((action) => !action.destructive);
    const destructiveActions = safeActions.filter((action) => action.destructive);

    return (
        <div
            className="mobile-action-sheet-backdrop"
            data-mobile-action-sheet="true"
            role="presentation"
            onClick={onClose}
        >
            <div
                ref={sheetRef}
                className="mobile-action-sheet"
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                onClick={(event) => event.stopPropagation()}
            >
                <div className="mobile-action-sheet-grab" aria-hidden="true" />
                <header className="mobile-action-sheet-head">
                    <img src={meta.cover} alt="" width={48} height={48} />
                    <div className="mobile-action-sheet-meta">
                        <strong id={titleId}>{meta.title}</strong>
                        <span>{meta.subtitle}</span>
                        {typeof meta.liked === "boolean" ? (
                            <span className="mobile-action-sheet-liked">
                                <Heart size={12} aria-hidden="true" />
                                {meta.liked ? "Liked" : "Not liked"}
                            </span>
                        ) : null}
                    </div>
                    <button
                        ref={closeBtnRef}
                        className="mobile-action-sheet-close"
                        onClick={onClose}
                        type="button"
                        aria-label="Close actions"
                    >
                        <X size={18} aria-hidden="true" />
                    </button>
                </header>

                <div className="mobile-action-sheet-body">
                    {primaryActions.length > 0 ? (
                        <ul className="mobile-action-sheet-list">
                            {primaryActions.map((action) => (
                                <li key={`${action.id}-${action.label}`}>
                                    <button
                                        type="button"
                                        data-action-id={action.id}
                                        disabled={action.disabled}
                                        onClick={() => {
                                            action.onClick();
                                            if (action.id !== "delete") onClose();
                                        }}
                                    >
                                        {action.label}
                                    </button>
                                </li>
                            ))}
                        </ul>
                    ) : null}
                    {destructiveActions.length > 0 ? (
                        <ul className="mobile-action-sheet-list is-destructive">
                            {destructiveActions.map((action) => (
                                <li key={`${action.id}-${action.label}`}>
                                    <button
                                        type="button"
                                        data-action-id={action.id}
                                        className="is-destructive"
                                        disabled={action.disabled}
                                        onClick={() => {
                                            action.onClick();
                                            onClose();
                                        }}
                                    >
                                        {action.label}
                                    </button>
                                </li>
                            ))}
                        </ul>
                    ) : null}
                </div>
            </div>
        </div>
    );
}
