"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";
import type {
    TestAccountDependencyPreview,
    TestAccountReviewLabel,
    TestAccountReviewList,
    TestAccountReviewRow,
} from "../lib/test-account-cleanup";
import { testConfidenceClass } from "../lib/test-account-cleanup";
import { useTranslation } from "../lib/i18n/provider";

type TestAccountCleanupCenterProps = {
    userId: string;
    accessToken: string;
    refreshToken: string;
};

function formatWhen(value: string | null) {
    if (!value) return "—";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function PreviewPanel({ preview }: { preview: TestAccountDependencyPreview | null }) {
    const { t } = useTranslation();
    if (!preview) return null;
    return (
        <div className="cleanup-preview-panel">
            <h4>{t("testAccountCleanup.dependencyPreview")}</h4>
            <ul className="cleanup-preview-list">
                <li>Auth user: {preview.authUser.email}</li>
                <li>Profile rows: {preview.profileRows}</li>
                <li>Founding member: {preview.foundingMember ? "Yes" : "No"}</li>
                <li>User roles: {preview.userRoles}</li>
                <li>Playlists: {preview.playlists} ({preview.playlistItems} items)</li>
                <li>Songs owned: {preview.songsOwned}</li>
                <li>Videos owned: {preview.videosOwned}</li>
                <li>Albums owned: {preview.albumsOwned}</li>
                <li>Song likes: {preview.songLikes}</li>
                <li>Video likes: {preview.videoLikes}</li>
                <li>Artist follows: {preview.artistFollows}</li>
                <li>Library saves: {preview.librarySaves}</li>
                <li>Queue items: {preview.queueItems}</li>
                <li>Sales cart items: {preview.salesCartItems}</li>
                <li>Marketplace preorders: {preview.marketplacePreorders}</li>
                <li>Payouts: {preview.payouts}</li>
                <li>Private storage objects: {preview.privateStorageObjects}</li>
            </ul>
            {preview.blockReasons.length > 0 ? (
                <div className="cleanup-block-reasons">
                    <strong>Deletion blocks</strong>
                    <ul>
                        {preview.blockReasons.map((reason) => <li key={reason}>{reason}</li>)}
                    </ul>
                </div>
            ) : null}
            <p className={preview.safeToDelete ? "cleanup-safe-yes" : "cleanup-safe-no"}>
                {preview.safeToDelete ? t("testAccountCleanup.safeToDelete") : t("testAccountCleanup.blocked")}
            </p>
        </div>
    );
}

export function TestAccountCleanupCenter({
    userId,
    accessToken,
    refreshToken,
}: TestAccountCleanupCenterProps) {
    const { t } = useTranslation();
    const [review, setReview] = useState<TestAccountReviewList | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [message, setMessage] = useState("");
    const [selectedUserId, setSelectedUserId] = useState("");
    const [preview, setPreview] = useState<TestAccountDependencyPreview | null>(null);
    const [confirmChecked, setConfirmChecked] = useState(false);
    const [confirmText, setConfirmText] = useState("");
    const [actionLoading, setActionLoading] = useState("");

    const selectedAccount = useMemo(
        () => review?.accounts.find((account) => account.userId === selectedUserId) || null,
        [review, selectedUserId],
    );

    const authBody = useCallback((extra: Record<string, unknown> = {}) => ({
        ...extra,
        userId,
        sessionUserId: userId,
        accessToken,
        sessionAccessToken: accessToken,
        refreshToken,
        sessionRefreshToken: refreshToken,
    }), [accessToken, refreshToken, userId]);

    const loadReview = useCallback(async () => {
        if (!userId || !accessToken) return;
        setLoading(true);
        setError("");
        try {
            const response = await fetch(`/api/launch/test-account-cleanup?userId=${encodeURIComponent(userId)}`, {
                headers: { Authorization: `Bearer ${accessToken}` },
                cache: "no-store",
            });
            const json = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(json.error || "Unable to load test account review list.");
            setReview(json.review || null);
        }
        catch (loadError) {
            setError(loadError instanceof Error ? loadError.message : "Unable to load test account review list.");
        }
        finally {
            setLoading(false);
        }
    }, [accessToken, userId]);

    useEffect(() => {
        void loadReview();
    }, [loadReview]);

    const runAction = useCallback(async (action: "dry-run" | "delete" | "set-label", extra: Record<string, unknown> = {}) => {
        if (!selectedUserId) {
            setError("Select an account to review first.");
            return;
        }
        setActionLoading(action);
        setError("");
        setMessage("");
        try {
            const response = await fetch("/api/launch/test-account-cleanup", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(authBody({
                    action,
                    targetUserId: selectedUserId,
                    ...extra,
                })),
            });
            const json = await response.json().catch(() => ({}));
            if (!response.ok && !json.result) {
                throw new Error(json.error || "Cleanup action failed.");
            }
            if (json.result?.preview) setPreview(json.result.preview);
            setMessage(json.result?.message || json.error || "Action completed.");
            if (action === "delete" && json.ok) {
                setSelectedUserId("");
                setPreview(null);
                setConfirmChecked(false);
                setConfirmText("");
                await loadReview();
            }
            if (action === "set-label" && json.ok) {
                await loadReview();
            }
        }
        catch (actionError) {
            setError(actionError instanceof Error ? actionError.message : "Cleanup action failed.");
        }
        finally {
            setActionLoading("");
        }
    }, [accessToken, authBody, loadReview, selectedUserId]);

    const setLabel = useCallback(async (label: TestAccountReviewLabel) => {
        await runAction("set-label", { label });
    }, [runAction]);

    return (
        <div className="test-account-cleanup-center">
            <div className="cleanup-toolbar">
                <p>Review likely automated/test accounts, run dry-run previews, and delete one confirmed disposable account at a time.</p>
                <button type="button" onClick={() => void loadReview()} disabled={loading}>
                    <RefreshCw size={15}/>
                    {loading ? t("platformControlCenter.refreshing") : t("testAccountCleanup.refreshReviewList")}
                </button>
            </div>

            {error ? <div className="upload-error"><p>{error}</p></div> : null}
            {message ? <div className="cleanup-message"><p>{message}</p></div> : null}

            <div className="cleanup-table-wrap">
                <table className="cleanup-review-table">
                    <thead>
                        <tr>
                            <th>Select</th>
                            <th>Display name</th>
                            <th>Email</th>
                            <th>User ID</th>
                            <th>Created</th>
                            <th>Confirmed</th>
                            <th>Last sign-in</th>
                            <th>Role</th>
                            <th>Approval</th>
                            <th>Uploads</th>
                            <th>Playlists</th>
                            <th>Followers</th>
                            <th>Confidence</th>
                            <th>Reasons</th>
                            <th>Protected</th>
                        </tr>
                    </thead>
                    <tbody>
                        {(review?.accounts || []).length === 0 ? (
                            <tr>
                                <td colSpan={15} className="control-center-empty">No flagged test accounts found.</td>
                            </tr>
                        ) : (review?.accounts || []).map((account: TestAccountReviewRow) => (
                            <tr key={account.userId} className={selectedUserId === account.userId ? "cleanup-row-selected" : ""}>
                                <td>
                                    <input
                                        type="radio"
                                        name="cleanup-account"
                                        checked={selectedUserId === account.userId}
                                        onChange={() => {
                                            setSelectedUserId(account.userId);
                                            setPreview(null);
                                            setConfirmChecked(false);
                                            setConfirmText("");
                                        }}
                                    />
                                </td>
                                <td>{account.displayName}</td>
                                <td>{account.email}</td>
                                <td><code>{account.userId.slice(0, 8)}…</code></td>
                                <td>{formatWhen(account.createdAt)}</td>
                                <td>{formatWhen(account.confirmedAt)}</td>
                                <td>{formatWhen(account.lastSignInAt)}</td>
                                <td>{account.role}</td>
                                <td>{account.approvalStatus || "—"}</td>
                                <td>{account.uploadsCount}</td>
                                <td>{account.playlistsCount}</td>
                                <td>{account.followersCount}</td>
                                <td><span className={`cleanup-confidence-badge ${testConfidenceClass(account.testConfidence)}`}>{account.testConfidence}</span></td>
                                <td>{account.flagReasons.join("; ")}</td>
                                <td>{account.protectedStatus}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {selectedAccount ? (
                <div className="cleanup-action-panel">
                    <div className="cleanup-action-head">
                        <h4>{selectedAccount.displayName || selectedAccount.email}</h4>
                        <span>{selectedAccount.manualLabel ? `Label: ${selectedAccount.manualLabel}` : "No manual label"}</span>
                    </div>

                    <div className="cleanup-label-actions">
                        <button type="button" onClick={() => void setLabel("protected_real_user")} disabled={Boolean(actionLoading)}>
                            <ShieldCheck size={14}/> Mark protected real user
                        </button>
                        <button type="button" onClick={() => void setLabel("confirmed_test_account")} disabled={Boolean(actionLoading)}>
                            <AlertTriangle size={14}/> Mark confirmed test account
                        </button>
                        <button type="button" onClick={() => void setLabel("needs_review")} disabled={Boolean(actionLoading)}>
                            Needs review
                        </button>
                    </div>

                    <div className="cleanup-primary-actions">
                        <button type="button" onClick={() => void runAction("dry-run")} disabled={Boolean(actionLoading)}>
                            {actionLoading === "dry-run" ? "Running dry-run..." : "Dry-run cleanup preview"}
                        </button>
                    </div>

                    <PreviewPanel preview={preview}/>

                    <div className="cleanup-delete-panel">
                        <label>
                            <input
                                type="checkbox"
                                checked={confirmChecked}
                                onChange={(event) => setConfirmChecked(event.target.checked)}
                                disabled={selectedAccount.isProtected}
                            />
                            I reviewed the dependency preview and confirm this disposable account should be deleted.
                        </label>
                        <label>
                            Type DELETE to confirm
                            <input
                                type="text"
                                value={confirmText}
                                onChange={(event) => setConfirmText(event.target.value)}
                                disabled={selectedAccount.isProtected}
                                placeholder="DELETE"
                            />
                        </label>
                        <button
                            type="button"
                            className="cleanup-delete-button"
                            disabled={selectedAccount.isProtected || !confirmChecked || confirmText !== "DELETE" || Boolean(actionLoading)}
                            onClick={() => void runAction("delete", { confirmed: true, confirmText })}
                        >
                            <Trash2 size={14}/>
                            {actionLoading === "delete" ? "Deleting..." : "Delete selected test account"}
                        </button>
                        {selectedAccount.isProtected ? (
                            <p className="cleanup-safe-no">This account is protected and cannot be deleted from the cleanup center.</p>
                        ) : null}
                    </div>
                </div>
            ) : null}

            <small className="cleanup-footnote">
                Watchlist matches: {review?.watchlistMatches || 0}. Last checked: {review?.checkedAt ? formatWhen(review.checkedAt) : "Not loaded yet"}.
            </small>
        </div>
    );
}
