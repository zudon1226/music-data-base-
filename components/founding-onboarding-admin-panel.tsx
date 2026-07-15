"use client";

import { useMemo, useState, useEffect } from "react";
import { Check, Copy, RefreshCw, Shield, UserCheck, UserX, XCircle } from "lucide-react";
import type { FoundingInviteRecord, FoundingRole } from "../lib/founding-onboarding";
import { foundingRoleLabel } from "../lib/founding-onboarding";

type FoundingMemberAdminRow = {
    user_id: string;
    founding_role: FoundingRole;
    approval_status: "pending" | "approved" | "rejected";
    display_name: string | null;
    joined_at: string;
    email?: string;
    roleLabel?: string;
};

type FoundingOnboardingAdminPanelProps = {
    userId: string;
    accessToken: string;
    refreshToken: string;
};

function authBody(userId: string, accessToken: string, refreshToken: string, extra: Record<string, unknown> = {}) {
    return {
        ...extra,
        userId,
        sessionUserId: userId,
        accessToken,
        sessionAccessToken: accessToken,
        refreshToken,
        sessionRefreshToken: refreshToken,
    };
}

export function FoundingOnboardingAdminPanel({
    userId,
    accessToken,
    refreshToken,
}: FoundingOnboardingAdminPanelProps) {
    const [invites, setInvites] = useState<FoundingInviteRecord[]>([]);
    const [members, setMembers] = useState<FoundingMemberAdminRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [role, setRole] = useState<FoundingRole>("founding_artist");
    const [expiresAt, setExpiresAt] = useState("");
    const [busyAction, setBusyAction] = useState("");

    const groupedInvites = useMemo(() => ({
        active: invites.filter((invite) => invite.status === "active"),
        used: invites.filter((invite) => invite.status === "used"),
        expired: invites.filter((invite) => invite.status === "expired"),
        revoked: invites.filter((invite) => invite.status === "revoked"),
    }), [invites]);

    const groupedMembers = useMemo(() => ({
        pending: members.filter((member) => member.approval_status === "pending"),
        approved: members.filter((member) => member.approval_status === "approved"),
        rejected: members.filter((member) => member.approval_status === "rejected"),
    }), [members]);

    useEffect(() => {
        void loadData();
    }, [userId]);

    async function loadData() {
        setLoading(true);
        setError("");
        try {
            const headers = { Authorization: `Bearer ${accessToken}` };
            const [inviteRes, memberRes] = await Promise.all([
                fetch(`/api/launch/founding-invites?userId=${encodeURIComponent(userId)}`, { headers }),
                fetch(`/api/launch/founding-members?userId=${encodeURIComponent(userId)}`, { headers }),
            ]);
            const inviteJson = await inviteRes.json().catch(() => ({}));
            const memberJson = await memberRes.json().catch(() => ({}));
            if (!inviteRes.ok) throw new Error(inviteJson.error || "Failed to load invites.");
            if (!memberRes.ok) throw new Error(memberJson.error || "Failed to load founding members.");
            setInvites(inviteJson.invites || []);
            setMembers(memberJson.members || []);
        }
        catch (loadError) {
            setError(loadError instanceof Error ? loadError.message : "Failed to load founding onboarding data.");
        }
        finally {
            setLoading(false);
        }
    }

    async function createInvite() {
        setBusyAction("create");
        setError("");
        try {
            const response = await fetch("/api/launch/founding-invites", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(authBody(userId, accessToken, refreshToken, {
                    intendedRole: role,
                    expiresAt: expiresAt || undefined,
                })),
            });
            const json = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(json.error || "Invite creation failed.");
            await loadData();
        }
        catch (createError) {
            setError(createError instanceof Error ? createError.message : "Invite creation failed.");
        }
        finally {
            setBusyAction("");
        }
    }

    async function revokeInvite(inviteId: string) {
        setBusyAction(`revoke-${inviteId}`);
        setError("");
        try {
            const response = await fetch("/api/launch/founding-invites", {
                method: "PATCH",
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(authBody(userId, accessToken, refreshToken, { inviteId, action: "revoke" })),
            });
            const json = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(json.error || "Invite revoke failed.");
            await loadData();
        }
        catch (revokeError) {
            setError(revokeError instanceof Error ? revokeError.message : "Invite revoke failed.");
        }
        finally {
            setBusyAction("");
        }
    }

    async function reviewMember(memberUserId: string, action: "approve" | "reject") {
        setBusyAction(`${action}-${memberUserId}`);
        setError("");
        try {
            const response = await fetch("/api/launch/founding-members", {
                method: "PATCH",
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(authBody(userId, accessToken, refreshToken, { memberUserId, action })),
            });
            const json = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(json.error || `Member ${action} failed.`);
            await loadData();
        }
        catch (reviewError) {
            setError(reviewError instanceof Error ? reviewError.message : `Member ${action} failed.`);
        }
        finally {
            setBusyAction("");
        }
    }

    return (
        <section className="stability-panel founding-onboarding-panel">
            <div className="panel-title-row">
                <h3>Founding Beta Onboarding</h3>
                <span>{groupedMembers.pending.length} pending | {groupedInvites.active.length} active invites</span>
            </div>

            <div className="founding-onboarding-actions">
                <button onClick={() => void loadData()} type="button" disabled={loading}>
                    <RefreshCw size={15}/>
                    {loading ? "Loading..." : "Refresh Onboarding"}
                </button>
            </div>

            {error ? <div className="upload-error"><p>{error}</p></div> : null}

            <div className="founding-onboarding-grid">
                <article className="founding-onboarding-card">
                    <h4>Create Invite</h4>
                    <label>
                        <span>Role</span>
                        <select value={role} onChange={(event) => setRole(event.target.value as FoundingRole)}>
                            <option value="founding_artist">Founding Artist</option>
                            <option value="founding_producer">Founding Producer</option>
                        </select>
                    </label>
                    <label>
                        <span>Optional expiration</span>
                        <input type="datetime-local" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)}/>
                    </label>
                    <button onClick={() => void createInvite()} type="button" disabled={busyAction === "create"}>
                        <Shield size={15}/>
                        {busyAction === "create" ? "Creating..." : "Create Single-Use Invite"}
                    </button>
                </article>

                <article className="founding-onboarding-card">
                    <h4>Pending Approvals</h4>
                    {groupedMembers.pending.length === 0 ? <p>No pending founding members.</p> : (
                        <div className="founding-onboarding-list">
                            {groupedMembers.pending.map((member) => (
                                <div className="founding-onboarding-row" key={member.user_id}>
                                    <div>
                                        <strong>{member.display_name || member.email || member.user_id}</strong>
                                        <span>{member.roleLabel || foundingRoleLabel(member.founding_role)}</span>
                                    </div>
                                    <div className="founding-onboarding-row-actions">
                                        <button onClick={() => void reviewMember(member.user_id, "approve")} type="button" disabled={Boolean(busyAction)}>
                                            <UserCheck size={14}/> Approve
                                        </button>
                                        <button onClick={() => void reviewMember(member.user_id, "reject")} type="button" disabled={Boolean(busyAction)}>
                                            <UserX size={14}/> Reject
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </article>
            </div>

            <div className="founding-onboarding-columns">
                <article className="founding-onboarding-card">
                    <h4>Active Invites</h4>
                    {groupedInvites.active.map((invite) => (
                        <div className="founding-onboarding-row" key={invite.id}>
                            <div>
                                <strong>{invite.invite_code}</strong>
                                <span>{foundingRoleLabel(invite.intended_role)}</span>
                            </div>
                            <div className="founding-onboarding-row-actions">
                                <button onClick={() => navigator.clipboard.writeText(invite.invite_code)} type="button"><Copy size={14}/></button>
                                <button onClick={() => void revokeInvite(invite.id)} type="button" disabled={busyAction === `revoke-${invite.id}`}>
                                    <XCircle size={14}/> Revoke
                                </button>
                            </div>
                        </div>
                    ))}
                </article>

                <article className="founding-onboarding-card">
                    <h4>Approved Members</h4>
                    {groupedMembers.approved.map((member) => (
                        <div className="founding-onboarding-row" key={member.user_id}>
                            <div>
                                <strong>{member.display_name || member.email}</strong>
                                <span><Check size={12}/> {member.roleLabel}</span>
                            </div>
                        </div>
                    ))}
                </article>

                <article className="founding-onboarding-card">
                    <h4>Used / Expired / Rejected</h4>
                    {groupedInvites.used.slice(0, 6).map((invite) => (
                        <div className="founding-onboarding-row" key={invite.id}>
                            <strong>{invite.invite_code}</strong>
                            <span>used</span>
                        </div>
                    ))}
                    {groupedInvites.expired.slice(0, 4).map((invite) => (
                        <div className="founding-onboarding-row" key={invite.id}>
                            <strong>{invite.invite_code}</strong>
                            <span>expired</span>
                        </div>
                    ))}
                    {groupedMembers.rejected.map((member) => (
                        <div className="founding-onboarding-row" key={member.user_id}>
                            <strong>{member.display_name || member.email}</strong>
                            <span>rejected</span>
                        </div>
                    ))}
                </article>
            </div>

            <style jsx>{`
              .founding-onboarding-panel {
                display: grid;
                gap: 16px;
              }
              .founding-onboarding-grid,
              .founding-onboarding-columns {
                display: grid;
                gap: 14px;
              }
              .founding-onboarding-columns {
                grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
              }
              .founding-onboarding-card {
                display: grid;
                gap: 10px;
                padding: 14px;
                border-radius: 14px;
                background: rgba(15, 23, 42, 0.72);
                border: 1px solid rgba(148, 163, 184, 0.18);
              }
              .founding-onboarding-card h4,
              .founding-onboarding-card strong {
                margin: 0;
              }
              .founding-onboarding-card label {
                display: grid;
                gap: 6px;
              }
              .founding-onboarding-list,
              .founding-onboarding-row {
                display: grid;
                gap: 8px;
              }
              .founding-onboarding-row {
                grid-template-columns: 1fr auto;
                align-items: center;
                gap: 10px;
                padding: 8px 0;
                border-top: 1px solid rgba(148, 163, 184, 0.12);
              }
              .founding-onboarding-row span {
                display: block;
                color: #94a3b8;
                font-size: 12px;
              }
              .founding-onboarding-row-actions,
              .founding-onboarding-actions {
                display: flex;
                gap: 8px;
                flex-wrap: wrap;
              }
              .founding-onboarding-row-actions button,
              .founding-onboarding-actions button,
              .founding-onboarding-card > button {
                display: inline-flex;
                align-items: center;
                gap: 6px;
              }
            `}</style>
        </section>
    );
}
