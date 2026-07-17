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
    const showRedeemForm = blocked && Boolean(onRedeemInvite) && Boolean(onInviteCodeChange);

    function handleRedeemSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (redeemBusy || !onRedeemInvite) return;
        void onRedeemInvite();
    }

    return (
        <main className="founding-gate-page">
            <section className="founding-gate-panel">
                <div className="founding-gate-mark" aria-hidden="true">
                    {pending ? <Clock3 size={22}/> : <ShieldX size={22}/>}
                </div>

                <div className="founding-gate-copy">
                    <h1 className="founding-gate-title">{title}</h1>
                    <p className="founding-gate-description">{message}</p>
                    {foundingRole ? (
                        <p className="founding-gate-meta">{t("auth.assignedRole", { role: foundingRoleLabel(foundingRole) })}</p>
                    ) : null}
                    {displayName ? (
                        <p className="founding-gate-meta founding-gate-user">{t("auth.signedInAs", { name: displayName })}</p>
                    ) : null}
                </div>

                {showRedeemForm ? (
                    <form className="founding-gate-redeem-form" onSubmit={handleRedeemSubmit}>
                        <label className="founding-gate-field" htmlFor="founding-gate-invite-code">
                            <span>{t("auth.inviteCode")}</span>
                            <input
                                id="founding-gate-invite-code"
                                name="inviteCode"
                                autoComplete="off"
                                spellCheck={false}
                                value={inviteCode}
                                onChange={(event) => onInviteCodeChange?.(event.target.value.toUpperCase())}
                                placeholder={t("auth.inviteCodePlaceholder")}
                                disabled={redeemBusy}
                            />
                        </label>
                        {redeemMessage ? (
                            <p
                                className={`founding-gate-message${
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
                        className={`founding-gate-message founding-gate-message-standalone${
                            redeemMessageTone === "success" ? " is-success" : ""
                        }${redeemMessageTone === "error" ? " is-error" : ""}`}
                        role="status"
                    >
                        {redeemMessage}
                    </p>
                ) : null}

                <button className="founding-gate-signout" onClick={onLogout} type="button">
                    {t("auth.signOut")}
                </button>
            </section>

            <style jsx global>{`
              .founding-gate-page {
                box-sizing: border-box;
                min-height: 100dvh;
                min-height: 100vh;
                display: grid;
                place-items: center;
                padding: 12px;
                margin: 0;
                background:
                  linear-gradient(90deg, rgba(2, 6, 23, 0.9), rgba(2, 6, 23, 0.5)),
                  url("https://images.unsplash.com/photo-1516280440614-37939bbacd81?auto=format&fit=crop&w=1600&q=80");
                background-size: cover;
                background-position: center;
                color: white;
                font-family: Arial, Helvetica, sans-serif;
              }

              .founding-gate-page *,
              .founding-gate-page *::before,
              .founding-gate-page *::after {
                box-sizing: border-box;
              }

              .founding-gate-panel {
                width: min(460px, 100%);
                max-width: 460px;
                margin: 0;
                padding: 16px;
                border: 1px solid rgba(0, 212, 255, 0.35);
                border-radius: 8px;
                background: rgba(11, 23, 54, 0.96);
                box-shadow: 0 20px 70px rgba(0, 0, 0, 0.35);
                text-align: center;
              }

              .founding-gate-mark {
                display: grid;
                place-items: center;
                margin: 0 0 8px;
                color: #22d3ee;
              }

              .founding-gate-copy {
                display: flex;
                flex-direction: column;
                align-items: stretch;
                margin: 0;
              }

              .founding-gate-title {
                margin: 0;
                font-size: clamp(22px, 5vw, 26px);
                line-height: 1.15;
                font-weight: 900;
              }

              .founding-gate-description {
                margin: 8px 0 0;
                color: #a9bed6;
                font-size: 14px;
                line-height: 1.35;
              }

              .founding-gate-meta {
                margin: 8px 0 0;
                color: #9bdcf0;
                font-size: 13px;
                line-height: 1.3;
                font-weight: 700;
              }

              .founding-gate-redeem-form {
                display: flex;
                flex-direction: column;
                gap: 0;
                margin: 16px 0 0;
                text-align: left;
              }

              .founding-gate-field {
                display: grid;
                gap: 6px;
                margin: 0;
              }

              .founding-gate-field span {
                color: #9bdcf0;
                font-size: 11px;
                font-weight: 900;
                text-transform: uppercase;
                letter-spacing: 0.02em;
              }

              .founding-gate-redeem-form input,
              .founding-gate-redeem-button,
              .founding-gate-signout {
                min-height: 44px;
                height: 44px;
                border-radius: 8px;
                font: inherit;
              }

              .founding-gate-redeem-form input {
                width: 100%;
                border: 1px solid #263c78;
                background: #020617;
                color: white;
                padding: 0 12px;
                outline: none;
              }

              .founding-gate-redeem-form input:focus {
                border-color: #22d3ee;
              }

              .founding-gate-message {
                margin: 8px 0 0;
                color: #fbbf24;
                font-size: 13px;
                font-weight: 800;
                line-height: 1.3;
                text-align: center;
              }

              .founding-gate-message-standalone {
                margin-top: 16px;
              }

              .founding-gate-message.is-success {
                color: #4ade80;
              }

              .founding-gate-message.is-error {
                color: #fbbf24;
              }

              .founding-gate-redeem-button {
                width: 100%;
                margin: 12px 0 0;
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

              .founding-gate-redeem-button:disabled {
                opacity: 0.7;
                cursor: wait;
              }

              .founding-gate-signout {
                width: 100%;
                margin: 16px 0 0;
                border: 0;
                background: #152d66;
                color: white;
                font-weight: 900;
                cursor: pointer;
              }

              @media (max-width: 480px) {
                .founding-gate-page {
                  padding: 10px;
                  align-items: center;
                }

                .founding-gate-panel {
                  width: min(460px, 100%);
                  padding: 14px;
                }
              }
            `}</style>
        </main>
    );
}
