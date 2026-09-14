"use client";

import { useState } from "react";
import { useTranslation } from "@/lib/i18n/provider";

type FetchFn = (path: string, init?: RequestInit & { requireAuth?: boolean }) => Promise<Response>;

type Props = {
    disabled?: boolean;
    fetchFn: FetchFn;
    onDeleted: () => void | Promise<void>;
};

export function AccountDeletePanel({ disabled, fetchFn, onDeleted }: Props) {
    const { t } = useTranslation();
    const [open, setOpen] = useState(false);
    const [confirmText, setConfirmText] = useState("");
    const [confirmed, setConfirmed] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    async function handleDelete() {
        setBusy(true);
        setError("");
        setSuccess("");
        try {
            const response = await fetchFn("/api/account/delete", {
                method: "POST",
                requireAuth: true,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    confirmed,
                    confirmText,
                }),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(String(data.error || t("accountDeletion.failed")));
            }
            setSuccess(t("accountDeletion.deleted"));
            await onDeleted();
        }
        catch (deleteError) {
            const message = deleteError instanceof Error ? deleteError.message : t("accountDeletion.failed");
            setError(message);
            void fetchFn("/api/platform/errors", {
                method: "POST",
                requireAuth: true,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    category: "unknown",
                    action: "account-delete-client",
                    message,
                }),
            }).catch(() => undefined);
        }
        finally {
            setBusy(false);
        }
    }

    if (disabled) {
        return (
            <div className="profile-save account-deletion-panel">
                <h3>{t("accountDeletion.deleteAccount")}</h3>
                <p>{t("accountDeletion.ownerBlocked")}</p>
            </div>
        );
    }

    return (
        <div className="profile-save account-deletion-panel">
            <h3>{t("accountDeletion.deleteAccount")}</h3>
            <p>{t("accountDeletion.warningBody")}</p>
            {!open ? (
                <button
                    className="account-deletion-open"
                    onClick={() => {
                        setOpen(true);
                        setError("");
                        setSuccess("");
                    }}
                    type="button"
                >
                    {t("accountDeletion.deleteAccount")}
                </button>
            ) : (
                <div className="account-deletion-flow" role="region" aria-label={t("accountDeletion.warningTitle")}>
                    <p className="account-deletion-warning" role="alert">
                        {t("accountDeletion.warningTitle")}: {t("accountDeletion.permanentNotice")}
                    </p>
                    <label className="account-deletion-confirm-check">
                        <input
                            checked={confirmed}
                            disabled={busy}
                            onChange={(event) => setConfirmed(event.target.checked)}
                            type="checkbox"
                        />
                        <span>{t("accountDeletion.understandPermanent")}</span>
                    </label>
                    <label>
                        <span>{t("accountDeletion.typeDeletePrompt")}</span>
                        <input
                            autoComplete="off"
                            disabled={busy}
                            onChange={(event) => setConfirmText(event.target.value)}
                            placeholder={t("accountDeletion.confirmPlaceholder")}
                            spellCheck={false}
                            value={confirmText}
                        />
                    </label>
                    {error ? <p className="profile-feedback profile-feedback-error" role="alert">{error}</p> : null}
                    {success ? <p className="profile-feedback profile-feedback-success" role="status">{success}</p> : null}
                    <div className="account-deletion-actions">
                        <button
                            disabled={busy}
                            onClick={() => {
                                setOpen(false);
                                setConfirmText("");
                                setConfirmed(false);
                                setError("");
                            }}
                            type="button"
                        >
                            {t("common.cancel")}
                        </button>
                        <button
                            className="account-deletion-submit"
                            disabled={busy || !confirmed || confirmText.trim() !== "DELETE"}
                            onClick={() => void handleDelete()}
                            type="button"
                        >
                            {busy ? t("accountDeletion.deleting") : t("accountDeletion.confirmDeletion")}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
