"use client";

import { Clock3, ShieldX } from "lucide-react";
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
    onLogout: () => void;
};

export function FoundingMemberGate({
    approvalStatus,
    foundingRole,
    displayName,
    blockedMessage,
    onLogout,
}: FoundingMemberGateProps) {
    const pending = approvalStatus === "pending";
    const message = blockedMessage
        || (pending ? FOUNDING_PENDING_MESSAGE : FOUNDING_REJECTED_MESSAGE);
    const title = pending ? "Approval Pending" : approvalStatus === "blocked" ? "Invite Required" : "Access Not Approved";

    return (
        <main className="auth-page founding-gate-page">
            <section className="auth-panel founding-gate-panel">
                <div className="auth-mark">
                    {pending ? <Clock3 size={28}/> : <ShieldX size={28}/>}
                </div>
                <div className="auth-copy">
                    <h1>{title}</h1>
                    <p>{message}</p>
                    {foundingRole ? <p>Assigned role: <strong>{foundingRoleLabel(foundingRole)}</strong></p> : null}
                    {displayName ? <p>Signed in as {displayName}</p> : null}
                </div>
                <button className="auth-switch" onClick={onLogout} type="button">Sign out</button>
            </section>
            <style jsx global>{`
              .founding-gate-page .founding-gate-panel {
                max-width: 520px;
                text-align: center;
              }
              .founding-gate-page .auth-mark {
                display: grid;
                place-items: center;
                margin-bottom: 12px;
              }
            `}</style>
        </main>
    );
}
