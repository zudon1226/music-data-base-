"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "./sidekick-shell.css";
import {
    SIDEKICK_HISTORY_MAX_TURNS,
    type SidekickConversationTurn,
} from "../../lib/sidekick/sidekick-conversation";

type SidekickFetchFn = (
    path: string,
    init?: RequestInit & { requireAuth?: boolean },
) => Promise<Response>;

type SidekickShellProps = {
    enabled?: boolean;
    fetchFn: SidekickFetchFn;
};

/**
 * Sidekick shell — portaled to document.body; does not alter html/body scroll ownership.
 */
export function SidekickShell({ enabled = true, fetchFn }: SidekickShellProps) {
    const titleId = useId();
    const bodyId = useId();
    const responseId = useId();
    const [open, setOpen] = useState(false);
    const [mounted, setMounted] = useState(false);
    const [draft, setDraft] = useState("");
    const [sending, setSending] = useState(false);
    const [reply, setReply] = useState("");
    const [error, setError] = useState("");
    const [turns, setTurns] = useState<SidekickConversationTurn[]>([]);
    const launcherRef = useRef<HTMLButtonElement | null>(null);
    const closeRef = useRef<HTMLButtonElement | null>(null);
    const panelRef = useRef<HTMLElement | null>(null);
    const inputRef = useRef<HTMLTextAreaElement | null>(null);

    useEffect(() => {
        const frame = window.requestAnimationFrame(() => setMounted(true));
        return () => window.cancelAnimationFrame(frame);
    }, []);

    const close = useCallback(() => {
        setDraft("");
        setOpen(false);
    }, []);

    const openPanel = useCallback(() => {
        setOpen(true);
    }, []);

    const sendMessage = useCallback(async () => {
        const message = draft.trim();
        if (!message || sending) return;
        setSending(true);
        setError("");
        setReply("");
        try {
            const historyForRequest = turns.slice(-SIDEKICK_HISTORY_MAX_TURNS);
            const response = await fetchFn("/api/sidekick/chat", {
                method: "POST",
                requireAuth: true,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ message, history: historyForRequest }),
            });
            const payload = (await response.json().catch(() => ({}))) as {
                error?: string;
                reply?: string;
            };
            if (!response.ok) {
                throw new Error(payload.error || "Sidekick request failed.");
            }
            const nextReply = typeof payload.reply === "string" ? payload.reply : "";
            setReply(nextReply);
            setTurns((previous) => {
                const next: SidekickConversationTurn[] = [
                    ...previous,
                    { role: "user", content: message },
                    { role: "assistant", content: nextReply },
                ];
                return next.slice(-SIDEKICK_HISTORY_MAX_TURNS);
            });
            setDraft("");
        }
        catch (sendError) {
            setReply("");
            setError(sendError instanceof Error ? sendError.message : "Sidekick request failed.");
        }
        finally {
            setSending(false);
        }
    }, [draft, fetchFn, sending, turns]);

    useEffect(() => {
        if (!open) return;

        const focusTimer = window.setTimeout(() => {
            inputRef.current?.focus();
        }, 0);

        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                event.preventDefault();
                close();
                return;
            }
            if (event.key !== "Tab" || !panelRef.current) return;
            const focusable = panelRef.current.querySelectorAll<HTMLElement>(
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
        };
    }, [close, open]);

    useEffect(() => {
        if (open) return;
        const restore = launcherRef.current;
        if (restore && typeof restore.focus === "function") {
            window.setTimeout(() => restore.focus(), 0);
        }
    }, [open]);

    if (!enabled || !mounted || typeof document === "undefined") {
        return null;
    }

    return createPortal(
        <>
            <button
                ref={launcherRef}
                type="button"
                className="sidekick-launcher"
                aria-label="Sidekick"
                aria-expanded={open}
                aria-controls={open ? titleId : undefined}
                onClick={() => {
                    if (open) close();
                    else openPanel();
                }}
            >
                Sidekick
            </button>

            {open ? (
                <div
                    className="sidekick-panel-backdrop"
                    role="presentation"
                    onMouseDown={(event) => {
                        if (event.target === event.currentTarget) close();
                    }}
                >
                    <section
                        ref={panelRef}
                        className="sidekick-panel"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby={titleId}
                        aria-describedby={bodyId}
                        onMouseDown={(event) => event.stopPropagation()}
                    >
                        <header className="sidekick-panel-head">
                            <div className="sidekick-panel-head-text">
                                <h2 id={titleId} className="sidekick-panel-title">
                                    Sidekick
                                </h2>
                                <p className="sidekick-panel-subtitle">
                                    Your Music Data Base assistant
                                </p>
                            </div>
                            <button
                                ref={closeRef}
                                type="button"
                                className="sidekick-panel-close"
                                aria-label="Close Sidekick"
                                onClick={close}
                            >
                                Close
                            </button>
                        </header>
                        <div id={bodyId} className="sidekick-panel-body">
                            <form
                                className="sidekick-compose"
                                onSubmit={(event) => {
                                    event.preventDefault();
                                    void sendMessage();
                                }}
                            >
                                <label className="sidekick-compose-label" htmlFor={`${bodyId}-input`}>
                                    Message
                                </label>
                                <textarea
                                    id={`${bodyId}-input`}
                                    ref={inputRef}
                                    className="sidekick-input"
                                    rows={3}
                                    value={draft}
                                    disabled={sending}
                                    placeholder="Ask Sidekick…"
                                    onChange={(event) => setDraft(event.target.value)}
                                />
                                <button
                                    type="submit"
                                    className="sidekick-send"
                                    disabled={sending || !draft.trim()}
                                    aria-busy={sending}
                                >
                                    {sending ? "Sending…" : "Send"}
                                </button>
                            </form>
                            {error ? (
                                <p className="sidekick-error" role="alert">
                                    {error}
                                </p>
                            ) : null}
                            {reply ? (
                                <div className="sidekick-reply" role="status" aria-live="polite" id={responseId}>
                                    <strong>Sidekick</strong>
                                    <p>{reply}</p>
                                </div>
                            ) : null}
                        </div>
                    </section>
                </div>
            ) : null}
        </>,
        document.body,
    );
}
