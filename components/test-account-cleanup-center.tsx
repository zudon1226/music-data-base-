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

function ClampText({
    value,
    title,
    className = "",
}: {
    value: string;
    title?: string;
    className?: string;
}) {
    const text = value || "—";
    return (
        <span className={`cleanup-cell-clamp ${className}`.trim()} title={title || text}>
            {text}
        </span>
    );
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

    const accounts = review?.accounts || [];

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
                            <th scope="col">Select</th>
                            <th scope="col">Display name</th>
                            <th scope="col">Email</th>
                            <th scope="col">User ID</th>
                            <th scope="col">Created</th>
                            <th scope="col">Confirmed</th>
                            <th scope="col">Last sign-in</th>
                            <th scope="col">Role</th>
                            <th scope="col">Approval</th>
                            <th scope="col">Uploads</th>
                            <th scope="col">Playlists</th>
                            <th scope="col">Followers</th>
                            <th scope="col">Confidence</th>
                            <th scope="col">Reasons</th>
                            <th scope="col">Protected</th>
                        </tr>
                    </thead>
                    <tbody>
                        {accounts.length === 0 ? (
                            <tr className="cleanup-empty-row">
                                <td colSpan={15} className="control-center-empty">No flagged test accounts found.</td>
                            </tr>
                        ) : accounts.map((account: TestAccountReviewRow) => {
                            const reasons = account.flagReasons.join("; ");
                            return (
                                <tr
                                    key={account.userId}
                                    className={selectedUserId === account.userId ? "cleanup-row-selected" : undefined}
                                >
                                    <td data-label="Select" className="cleanup-select-cell">
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
                                            aria-label={`Select ${account.displayName || account.email || account.userId}`}
                                        />
                                    </td>
                                    <td data-label="Display name">
                                        <ClampText value={account.displayName || "—"} />
                                    </td>
                                    <td data-label="Email">
                                        <ClampText value={account.email || "—"} title={account.email || undefined} />
                                    </td>
                                    <td data-label="User ID">
                                        <ClampText
                                            className="cleanup-mono"
                                            value={account.userId}
                                            title={account.userId}
                                        />
                                    </td>
                                    <td data-label="Created">
                                        <ClampText value={formatWhen(account.createdAt)} />
                                    </td>
                                    <td data-label="Confirmed">
                                        <ClampText value={formatWhen(account.confirmedAt)} />
                                    </td>
                                    <td data-label="Last sign-in">
                                        <ClampText value={formatWhen(account.lastSignInAt)} />
                                    </td>
                                    <td data-label="Role">
                                        <ClampText value={account.role || "—"} />
                                    </td>
                                    <td data-label="Approval">
                                        <ClampText value={account.approvalStatus || "—"} />
                                    </td>
                                    <td data-label="Uploads">{account.uploadsCount}</td>
                                    <td data-label="Playlists">{account.playlistsCount}</td>
                                    <td data-label="Followers">{account.followersCount}</td>
                                    <td data-label="Confidence">
                                        <span className={`cleanup-confidence-badge ${testConfidenceClass(account.testConfidence)}`}>
                                            {account.testConfidence}
                                        </span>
                                    </td>
                                    <td data-label="Reasons">
                                        <ClampText value={reasons || "—"} title={reasons || undefined} />
                                    </td>
                                    <td data-label="Protected">
                                        <ClampText value={account.protectedStatus || "—"} />
                                    </td>
                                </tr>
                            );
                        })}
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

            <style jsx global>{`
              .test-account-cleanup-center {
                display: flex !important;
                flex-direction: column !important;
                align-items: stretch !important;
                gap: 12px !important;
                height: auto !important;
                min-height: 0 !important;
                max-height: none !important;
                flex-grow: 0 !important;
                /* Keep bottom audio player from covering the last account row */
                padding-bottom: calc(108px + env(safe-area-inset-bottom, 0px)) !important;
              }

              .test-account-cleanup-center .cleanup-toolbar {
                display: flex !important;
                justify-content: space-between !important;
                align-items: flex-start !important;
                gap: 12px !important;
                height: auto !important;
                min-height: 0 !important;
                flex-grow: 0 !important;
              }

              .test-account-cleanup-center .cleanup-toolbar p,
              .test-account-cleanup-center .cleanup-footnote,
              .test-account-cleanup-center .cleanup-message p {
                margin: 0;
                color: #9bdcf0;
              }

              .test-account-cleanup-center .cleanup-table-wrap {
                width: 100% !important;
                max-width: 100% !important;
                height: auto !important;
                min-height: 0 !important;
                max-height: none !important;
                overflow-x: auto !important;
                overflow-y: visible !important;
                flex-grow: 0 !important;
              }

              .test-account-cleanup-center .cleanup-review-table {
                width: 100% !important;
                min-width: 980px;
                border-collapse: separate !important;
                border-spacing: 0 8px !important;
                table-layout: fixed !important;
                height: auto !important;
                min-height: 0 !important;
                font-size: 13px;
              }

              .test-account-cleanup-center .cleanup-review-table thead,
              .test-account-cleanup-center .cleanup-review-table tbody,
              .test-account-cleanup-center .cleanup-review-table tr {
                height: auto !important;
                min-height: 0 !important;
                max-height: none !important;
                flex-grow: 0 !important;
              }

              .test-account-cleanup-center .cleanup-review-table tr {
                background: rgba(15, 23, 42, 0.55);
              }

              .test-account-cleanup-center .cleanup-review-table thead tr {
                background: transparent;
              }

              .test-account-cleanup-center .cleanup-review-table th,
              .test-account-cleanup-center .cleanup-review-table td {
                height: auto !important;
                min-height: 0 !important;
                max-height: none !important;
                padding: 10px 12px !important;
                border: 0 !important;
                border-bottom: 1px solid rgba(148, 163, 184, 0.14) !important;
                text-align: left !important;
                vertical-align: middle !important;
                line-height: 1.25 !important;
                overflow: hidden !important;
                flex-grow: 0 !important;
              }

              .test-account-cleanup-center .cleanup-review-table th {
                color: #67e8f9;
                font-size: 11px;
                font-weight: 800;
                text-transform: uppercase;
                letter-spacing: 0.04em;
                white-space: nowrap;
                padding-top: 4px !important;
                padding-bottom: 4px !important;
                border-bottom: 1px solid rgba(103, 232, 249, 0.28) !important;
                background: transparent;
              }

              .test-account-cleanup-center .cleanup-review-table th:nth-child(1),
              .test-account-cleanup-center .cleanup-review-table td:nth-child(1) { width: 56px; }
              .test-account-cleanup-center .cleanup-review-table th:nth-child(2),
              .test-account-cleanup-center .cleanup-review-table td:nth-child(2) { width: 12%; }
              .test-account-cleanup-center .cleanup-review-table th:nth-child(3),
              .test-account-cleanup-center .cleanup-review-table td:nth-child(3) { width: 14%; }
              .test-account-cleanup-center .cleanup-review-table th:nth-child(4),
              .test-account-cleanup-center .cleanup-review-table td:nth-child(4) { width: 12%; }
              .test-account-cleanup-center .cleanup-review-table th:nth-child(14),
              .test-account-cleanup-center .cleanup-review-table td:nth-child(14) { width: 16%; }

              .test-account-cleanup-center .cleanup-select-cell {
                text-align: center !important;
              }

              .test-account-cleanup-center .cleanup-select-cell input[type="radio"] {
                width: 18px !important;
                height: 18px !important;
                min-width: 18px !important;
                min-height: 18px !important;
                max-height: 18px !important;
                margin: 0 !important;
                vertical-align: middle;
              }

              .test-account-cleanup-center .cleanup-cell-clamp {
                display: -webkit-box !important;
                -webkit-box-orient: vertical !important;
                -webkit-line-clamp: 2 !important;
                line-clamp: 2 !important;
                overflow: hidden !important;
                text-overflow: ellipsis !important;
                white-space: normal !important;
                word-break: break-word !important;
                overflow-wrap: anywhere !important;
                max-width: 100% !important;
                max-height: 2.5em !important;
                line-height: 1.25 !important;
              }

              .test-account-cleanup-center .cleanup-mono {
                font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
                font-size: 12px;
              }

              .test-account-cleanup-center .cleanup-row-selected {
                background: rgba(34, 211, 238, 0.1) !important;
              }

              .test-account-cleanup-center .cleanup-empty-row td {
                text-align: center !important;
                color: #9bdcf0;
              }

              .test-account-cleanup-center .cleanup-confidence-badge {
                display: inline-flex;
                align-items: center;
                padding: 3px 8px;
                border-radius: 999px;
                font-size: 11px;
                font-weight: 800;
                text-transform: uppercase;
                white-space: nowrap;
              }

              .test-account-cleanup-center .cleanup-confidence-high {
                background: rgba(248, 113, 113, 0.18);
                color: #fca5a5;
              }

              .test-account-cleanup-center .cleanup-confidence-medium {
                background: rgba(250, 204, 21, 0.18);
                color: #fde047;
              }

              .test-account-cleanup-center .cleanup-confidence-low {
                background: rgba(148, 163, 184, 0.18);
                color: #cbd5e1;
              }

              .test-account-cleanup-center .cleanup-action-panel,
              .test-account-cleanup-center .cleanup-preview-panel,
              .test-account-cleanup-center .cleanup-delete-panel {
                padding: 14px;
                border-radius: 14px;
                background: rgba(15, 23, 42, 0.72);
                border: 1px solid rgba(148, 163, 184, 0.16);
                display: grid;
                gap: 12px;
                height: auto !important;
                min-height: 0 !important;
                flex-grow: 0 !important;
              }

              .test-account-cleanup-center .cleanup-action-head,
              .test-account-cleanup-center .cleanup-label-actions,
              .test-account-cleanup-center .cleanup-primary-actions {
                display: flex;
                flex-wrap: wrap;
                gap: 10px;
                align-items: center;
              }

              .test-account-cleanup-center .cleanup-preview-list,
              .test-account-cleanup-center .cleanup-block-reasons ul {
                margin: 0;
                padding-left: 18px;
                color: #9bdcf0;
                display: grid;
                gap: 4px;
              }

              .test-account-cleanup-center .cleanup-safe-yes { color: #86efac; }
              .test-account-cleanup-center .cleanup-safe-no { color: #fca5a5; }

              .test-account-cleanup-center .cleanup-delete-panel label {
                display: grid;
                gap: 6px;
                color: #dbeafe;
              }

              .test-account-cleanup-center .cleanup-delete-panel input[type="text"] {
                max-width: 220px;
              }

              .test-account-cleanup-center .cleanup-delete-button {
                width: fit-content;
              }

              @media (max-width: 767px) {
                .test-account-cleanup-center .cleanup-toolbar {
                  flex-direction: column !important;
                }

                .test-account-cleanup-center .cleanup-table-wrap {
                  overflow-x: visible !important;
                }

                .test-account-cleanup-center .cleanup-review-table {
                  min-width: 0 !important;
                  width: 100% !important;
                  border-collapse: separate !important;
                  border-spacing: 0 8px !important;
                  table-layout: auto !important;
                }

                .test-account-cleanup-center .cleanup-review-table thead {
                  display: none !important;
                }

                .test-account-cleanup-center .cleanup-review-table,
                .test-account-cleanup-center .cleanup-review-table tbody {
                  display: block !important;
                  width: 100% !important;
                }

                .test-account-cleanup-center .cleanup-review-table tr {
                  display: grid !important;
                  grid-template-columns: 1fr !important;
                  gap: 6px !important;
                  width: 100% !important;
                  margin: 0 !important;
                  padding: 10px 12px !important;
                  border: 1px solid rgba(148, 163, 184, 0.18) !important;
                  border-radius: 10px !important;
                  background: rgba(15, 23, 42, 0.72) !important;
                  height: auto !important;
                  min-height: 0 !important;
                  align-content: start !important;
                  justify-content: start !important;
                  flex-grow: 0 !important;
                }

                .test-account-cleanup-center .cleanup-review-table td {
                  display: grid !important;
                  grid-template-columns: 104px minmax(0, 1fr) !important;
                  align-items: center !important;
                  gap: 8px !important;
                  width: 100% !important;
                  padding: 2px 0 !important;
                  border: 0 !important;
                  height: auto !important;
                  min-height: 0 !important;
                }

                .test-account-cleanup-center .cleanup-review-table td::before {
                  content: attr(data-label);
                  color: #67e8f9;
                  font-size: 11px;
                  font-weight: 800;
                  text-transform: uppercase;
                  letter-spacing: 0.03em;
                }

                .test-account-cleanup-center .cleanup-select-cell {
                  grid-template-columns: 104px auto !important;
                  justify-items: start !important;
                }

                .test-account-cleanup-center .cleanup-empty-row td {
                  display: block !important;
                  text-align: left !important;
                }

                .test-account-cleanup-center .cleanup-empty-row td::before {
                  content: none;
                }

                .test-account-cleanup-center .cleanup-delete-button,
                .test-account-cleanup-center .cleanup-delete-panel input[type="text"] {
                  width: 100%;
                  max-width: none;
                }
              }

              @media (min-width: 768px) and (max-width: 1024px) {
                .test-account-cleanup-center .cleanup-review-table {
                  min-width: 920px;
                }
              }
            `}</style>
        </div>
    );
}
