"use client";

import { type FormEvent } from "react";
import { Clock3, ShieldX, TicketCheck } from "lucide-react";
import { useTranslation } from "../lib/i18n/provider";
import {
    FOUNDING_INVITE_REQUIRED_MESSAGE,
    FOUNDING_PENDING_MESSAGE,
    FOUNDING_REJECTED_MESSAGE,
    foundingRoleLabel,
    type FoundingApprovalStatus,
    type FoundingRole,
} from "../lib/founding-onboarding";

type FoundingMemberGateProps = {
    approvalStatus: FoundingApprovalStatus | "blocked";
    foundingRole: FoundingRole | null;
    displayName?: string;
    blockedMessage?: string;
    inviteCode?: string;
    onInviteCodeChange?: (value: string) => void;
    onRedeemInvite?: () => void | Promise<void>;
    redeemBusy?: boolean;
    redeemMessage?: string;
    redeemMessageTone?: "success" | "error" | "";
    onLogout: () => void;
};

export function FoundingMemberGate({
    approvalStatus,
    foundingRole,
    displayName,
    blockedMessage,
    inviteCode = "",
    onInviteCodeChange,
    onRedeemInvite,
    redeemBusy = false,
    redeemMessage = "",
    redeemMessageTone = "",
    onLogout,
}: FoundingMemberGateProps) {
    const { t } = useTranslation();
    const pending = approvalStatus === "pending";
    const blocked = approvalStatus === "blocked";
    const message = blockedMessage
        || (pending ? FOUNDING_PENDING_MESSAGE : FOUNDING_REJECTED_MESSAGE);
    const title = pending
        ? t("auth.approvalPending")
        : blocked
            ? t("auth.inviteRequired")
            : t("auth.accessNotApproved");

    function handleRedeemSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (redeemBusy || !onRedeemInvite) return;
        void onRedeemInvite();
    }

    return (
        <main className="auth-page founding-gate-page">
            <section className="auth-panel founding-gate-panel">
                <div className="auth-mark">
                    {pending ? <Clock3 size={28}/> : <ShieldX size={28}/>}
                </div>
                <div className="auth-copy">
                    <h1>{title}</h1>
                    <p>{message}</p>
                    {foundingRole ? <p>{t("auth.assignedRole", { role: foundingRoleLabel(foundingRole) })}</p> : null}
                    {displayName ? <p>{t("auth.signedInAs", { name: displayName })}</p> : null}
                </div>

                {blocked && onRedeemInvite && onInviteCodeChange ? (
                    <form className="auth-form founding-gate-redeem-form" onSubmit={handleRedeemSubmit}>
                        <p className="founding-gate-redeem-help">{t("auth.redeemInviteHelp")}</p>
                        <label htmlFor="founding-gate-invite-code">
                            <span>{t("auth.inviteCode")}</span>
                            <input
                                id="founding-gate-invite-code"
                                name="inviteCode"
                                autoComplete="off"
                                spellCheck={false}
                                value={inviteCode}
                                onChange={(event) => onInviteCodeChange(event.target.value.toUpperCase())}
                                placeholder={t("auth.inviteCodePlaceholder")}
                                disabled={redeemBusy}
                            />
                        </label>
                        {redeemMessage ? (
                            <p
                                className={`auth-message founding-gate-message${
                                    redeemMessageTone === "success" ? " is-success" : ""
                                }${redeemMessageTone === "error" ? " is-error" : ""}`}
                                role="status"
                            >
                                {redeemMessage}
                            </p>
                        ) : null}
                        <button className="founding-gate-redeem-button" disabled={redeemBusy} type="submit">
                            <TicketCheck size={17}/>
                            {redeemBusy ? t("common.working") : t("auth.redeemInvite")}
                        </button>
                    </form>
                ) : redeemMessage ? (
                    <p
                        className={`auth-message founding-gate-message${
                            redeemMessageTone === "success" ? " is-success" : ""
                        }${redeemMessageTone === "error" ? " is-error" : ""}`}
                        role="status"
                    >
                        {redeemMessage}
                    </p>
                ) : null}

                <button className="auth-switch" onClick={onLogout} type="button">{t("auth.signOut")}</button>
            </section>
            <style jsx global>{`
              .founding-gate-page .founding-gate-panel {
                max-width: 520px;
                width: min(520px, 100%);
                text-align: center;
              }
              .founding-gate-page .auth-mark {
                display: grid;
                place-items: center;
                margin-bottom: 12px;
              }
              .founding-gate-page .founding-gate-redeem-form {
                display: grid;
                gap: 12px;
                text-align: left;
                margin: 4px 0 12px;
              }
              .founding-gate-page .founding-gate-redeem-help {
                margin: 0;
                color: #a9bed6;
                font-size: 13px;
                line-height: 1.4;
                text-align: center;
              }
              .founding-gate-page .founding-gate-redeem-form label {
                display: grid;
                gap: 8px;
              }
              .founding-gate-page .founding-gate-redeem-form span {
                color: #9bdcf0;
                font-size: 11px;
                font-weight: 900;
                text-transform: uppercase;
              }
              .founding-gate-page .founding-gate-redeem-form input,
              .founding-gate-page .founding-gate-redeem-button {
                min-height: 44px;
                height: 44px;
                border-radius: 8px;
                box-sizing: border-box;
              }
              .founding-gate-page .founding-gate-redeem-form input {
                width: 100%;
                border: 1px solid #263c78;
                background: #020617;
                color: white;
                padding: 0 12px;
                outline: none;
                font: inherit;
              }
              .founding-gate-page .founding-gate-redeem-button {
                width: 100%;
                border: 0;
                background: #22d3ee;
                color: #020617;
                font-weight: 900;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                gap: 8px;
                cursor: pointer;
              }
              .founding-gate-page .founding-gate-redeem-button:disabled {
                opacity: 0.7;
                cursor: wait;
              }
              .founding-gate-page .founding-gate-message {
                margin: 0;
                color: #fbbf24;
                font-size: 13px;
                font-weight: 800;
                text-align: center;
              }
              .founding-gate-page .founding-gate-message.is-success {
                color: #4ade80;
              }
              .founding-gate-page .founding-gate-message.is-error {
                color: #fbbf24;
              }
              .founding-gate-page .auth-switch {
                width: 100%;
                min-height: 44px;
                margin-top: 4px;
                border: 0;
                border-radius: 8px;
                background: #152d66;
                color: white;
                font-weight: 900;
                cursor: pointer;
              }
            `}</style>
        </main>
    );
}
