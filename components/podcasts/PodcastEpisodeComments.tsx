"use client";

import { useCallback, useEffect, useState } from "react";
import { CircleAlert, Flag, LoaderCircle, MessageSquare, Trash2 } from "lucide-react";
import { authFetch } from "@/lib/client-api-auth";
import { supabase } from "@/lib/supabase";
import { formatPodcastDate, podcastResponseError } from "./podcast-display";
import styles from "./podcasts.module.css";

const COMMENT_MAX_LENGTH = 2000;

type PodcastEpisodeComment = {
    id: string;
    episodeId: string;
    userId: string;
    body: string;
    createdAt: string;
    authorName: string;
    avatarUrl: string;
    canDelete: boolean;
    canReport: boolean;
};

type PodcastEpisodeCommentsProps = {
    episodeId: string;
    userId: string;
};

type CommentsResponse = {
    comments?: PodcastEpisodeComment[];
    error?: string;
    setupRequired?: boolean;
};

export function PodcastEpisodeComments({ episodeId, userId }: PodcastEpisodeCommentsProps) {
    const [comments, setComments] = useState<PodcastEpisodeComment[]>([]);
    const [draft, setDraft] = useState("");
    const [loading, setLoading] = useState(true);
    const [posting, setPosting] = useState(false);
    const [pendingId, setPendingId] = useState("");
    const [error, setError] = useState("");
    const [feedback, setFeedback] = useState("");
    const [setupRequired, setSetupRequired] = useState(false);

    const loadComments = useCallback(async (signal?: AbortSignal) => {
        setLoading(true);
        setError("");
        try {
            const path = userId
                ? `/api/podcasts/episodes/${encodeURIComponent(episodeId)}/comments?userId=${encodeURIComponent(userId)}`
                : `/api/podcasts/episodes/${encodeURIComponent(episodeId)}/comments`;
            const response = userId
                ? await authFetch(supabase, path, { cache: "no-store", signal })
                : await fetch(path, { cache: "no-store", signal });
            const body = (await response.json().catch(() => ({}))) as CommentsResponse;
            if (!response.ok) {
                if (body.setupRequired) {
                    setSetupRequired(true);
                    setComments([]);
                    return;
                }
                throw new Error(podcastResponseError(body, "Comments could not be loaded."));
            }
            setSetupRequired(false);
            setComments(Array.isArray(body.comments) ? body.comments : []);
        }
        catch (caught) {
            if (signal?.aborted) return;
            setComments([]);
            setError(caught instanceof Error ? caught.message : "Comments could not be loaded.");
        }
        finally {
            if (!signal?.aborted) setLoading(false);
        }
    }, [episodeId, userId]);

    useEffect(() => {
        const controller = new AbortController();
        const timer = window.setTimeout(() => void loadComments(controller.signal), 0);
        return () => {
            window.clearTimeout(timer);
            controller.abort();
        };
    }, [loadComments]);

    async function submitComment() {
        if (!userId) {
            setError("Sign in to comment.");
            return;
        }
        const body = draft.trim();
        if (!body) {
            setError("Write a comment first.");
            return;
        }
        setPosting(true);
        setError("");
        setFeedback("");
        try {
            const response = await authFetch(supabase, `/api/podcasts/episodes/${encodeURIComponent(episodeId)}/comments`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userId, body }),
                cache: "no-store",
                requireSession: true,
            });
            const result = (await response.json().catch(() => ({}))) as { comment?: PodcastEpisodeComment; error?: string };
            if (!response.ok || !result.comment) {
                throw new Error(podcastResponseError(result, "Comment could not be posted."));
            }
            setComments((current) => [result.comment as PodcastEpisodeComment, ...current]);
            setDraft("");
            setFeedback("Comment posted.");
        }
        catch (caught) {
            setError(caught instanceof Error ? caught.message : "Comment could not be posted.");
        }
        finally {
            setPosting(false);
        }
    }

    async function deleteComment(comment: PodcastEpisodeComment) {
        if (!userId || !comment.canDelete) return;
        if (!window.confirm("Delete this comment? This cannot be undone.")) return;
        setPendingId(comment.id);
        setError("");
        setFeedback("");
        try {
            const response = await authFetch(supabase, `/api/podcasts/comments/${encodeURIComponent(comment.id)}`, {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userId }),
                cache: "no-store",
                requireSession: true,
            });
            const result = (await response.json().catch(() => ({}))) as { error?: string };
            if (!response.ok) throw new Error(podcastResponseError(result, "Comment could not be deleted."));
            setComments((current) => current.filter((item) => item.id !== comment.id));
            setFeedback("Comment deleted.");
        }
        catch (caught) {
            setError(caught instanceof Error ? caught.message : "Comment could not be deleted.");
        }
        finally {
            setPendingId("");
        }
    }

    async function reportComment(comment: PodcastEpisodeComment) {
        if (!userId || !comment.canReport) return;
        const detailsInput = window.prompt("Why are you reporting this comment?", "");
        if (detailsInput === null) return;
        const details = detailsInput.trim();
        setPendingId(comment.id);
        setError("");
        setFeedback("");
        try {
            const response = await authFetch(supabase, `/api/podcasts/comments/${encodeURIComponent(comment.id)}/report`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    userId,
                    details,
                    targetUserName: comment.authorName,
                }),
                cache: "no-store",
                requireSession: true,
            });
            const result = (await response.json().catch(() => ({}))) as { error?: string };
            if (!response.ok) throw new Error(podcastResponseError(result, "Comment could not be reported."));
            setFeedback("Report sent to moderation.");
        }
        catch (caught) {
            setError(caught instanceof Error ? caught.message : "Comment could not be reported.");
        }
        finally {
            setPendingId("");
        }
    }

    return (
        <section className={styles.commentsSection} aria-labelledby="podcast-episode-comments-heading">
            <div className={styles.commentsHeading}>
                <MessageSquare size={16} aria-hidden="true" />
                <h3 id="podcast-episode-comments-heading">Comments</h3>
                <span className={styles.countPill}>{comments.length}</span>
            </div>

            {error ? (
                <div className={styles.inlineAlert} role="alert">
                    <CircleAlert size={16} aria-hidden="true" />
                    <span>{error}</span>
                    <button type="button" onClick={() => setError("")}>Dismiss</button>
                </div>
            ) : null}
            {feedback ? (
                <div className={styles.successBanner} role="status">
                    <span>{feedback}</span>
                    <button type="button" onClick={() => setFeedback("")}>Dismiss</button>
                </div>
            ) : null}

            {userId ? (
                <form
                    className={styles.commentCompose}
                    onSubmit={(event) => {
                        event.preventDefault();
                        void submitComment();
                    }}
                >
                    <label className={styles.field}>
                        <span>Add a comment</span>
                        <textarea
                            rows={3}
                            maxLength={COMMENT_MAX_LENGTH}
                            value={draft}
                            onChange={(event) => setDraft(event.target.value)}
                            placeholder="Share your thoughts on this episode"
                            disabled={posting || setupRequired}
                        />
                    </label>
                    <button type="submit" className={styles.primaryButton} disabled={posting || setupRequired || !draft.trim()}>
                        {posting
                            ? <LoaderCircle className={styles.spinner} size={16} aria-hidden="true" />
                            : <MessageSquare size={16} aria-hidden="true" />}
                        {posting ? "Posting…" : "Submit"}
                    </button>
                </form>
            ) : (
                <p className={styles.commentsHint}>Sign in to comment on this episode.</p>
            )}

            {loading ? (
                <div className={styles.commentsState} role="status">
                    <LoaderCircle className={styles.spinner} size={20} aria-hidden="true" />
                    <span>Loading comments.</span>
                </div>
            ) : null}

            {!loading && setupRequired ? (
                <p className={styles.commentsHint}>Podcast comments are not available until setup is applied.</p>
            ) : null}

            {!loading && !setupRequired && comments.length === 0 ? (
                <p className={styles.commentsEmpty}>No comments yet.</p>
            ) : null}

            {!loading && comments.length > 0 ? (
                <div className={styles.commentList}>
                    {comments.map((comment) => (
                        <article key={comment.id} className={styles.commentRow}>
                            <div
                                className={styles.commentAvatar}
                                style={comment.avatarUrl
                                    ? { backgroundImage: `url(${JSON.stringify(comment.avatarUrl)})` }
                                    : undefined}
                                aria-hidden="true"
                            >
                                {!comment.avatarUrl ? comment.authorName.slice(0, 1).toUpperCase() : null}
                            </div>
                            <div className={styles.commentCopy}>
                                <div className={styles.commentMeta}>
                                    <strong>{comment.authorName}</strong>
                                    <time dateTime={comment.createdAt}>{formatPodcastDate(comment.createdAt) || "Just now"}</time>
                                </div>
                                <p>{comment.body}</p>
                                <div className={styles.commentActions}>
                                    {comment.canDelete ? (
                                        <button
                                            type="button"
                                            className={styles.dangerTextButton}
                                            disabled={pendingId === comment.id}
                                            onClick={() => void deleteComment(comment)}
                                        >
                                            {pendingId === comment.id
                                                ? <LoaderCircle className={styles.spinner} size={14} aria-hidden="true" />
                                                : <Trash2 size={14} aria-hidden="true" />}
                                            Delete
                                        </button>
                                    ) : null}
                                    {comment.canReport ? (
                                        <button
                                            type="button"
                                            disabled={pendingId === comment.id}
                                            onClick={() => void reportComment(comment)}
                                        >
                                            {pendingId === comment.id
                                                ? <LoaderCircle className={styles.spinner} size={14} aria-hidden="true" />
                                                : <Flag size={14} aria-hidden="true" />}
                                            Report
                                        </button>
                                    ) : null}
                                </div>
                            </div>
                        </article>
                    ))}
                </div>
            ) : null}
        </section>
    );
}
