"use client";

import { useState } from "react";
import { Award, Link2, Save, UserCircle } from "lucide-react";
import type { FoundingMemberRecord } from "../lib/founding-onboarding";
import { foundingRoleLabel } from "../lib/founding-onboarding";

type FoundingMemberProfileCardProps = {
    userId: string;
    accessToken: string;
    refreshToken: string;
    member: FoundingMemberRecord;
    onUpdated?: (member: FoundingMemberRecord) => void;
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

export function FoundingMemberProfileCard({
    userId,
    accessToken,
    refreshToken,
    member,
    onUpdated,
}: FoundingMemberProfileCardProps) {
    const [displayName, setDisplayName] = useState(member.display_name || "");
    const [socialLink, setSocialLink] = useState(member.social_link || "");
    const [profileImageUrl, setProfileImageUrl] = useState(member.profile_image_url || "");
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState("");

    async function saveProfile() {
        setBusy(true);
        setMessage("");
        try {
            const response = await fetch("/api/founding-members/me", {
                method: "PATCH",
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(authBody(userId, accessToken, refreshToken, {
                    displayName,
                    socialLink,
                    profileImageUrl,
                })),
            });
            const json = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(json.error || "Profile update failed.");
            onUpdated?.(json.member);
            setMessage("Founding profile saved.");
        }
        catch (error) {
            setMessage(error instanceof Error ? error.message : "Profile update failed.");
        }
        finally {
            setBusy(false);
        }
    }

    return (
        <section className="founding-profile-card">
            <div className="founding-profile-head">
                <Award size={18}/>
                <div>
                    <h3>{member.badge_label || "Founding Member"}</h3>
                    <span>{foundingRoleLabel(member.founding_role)}</span>
                </div>
            </div>
            <p>Joined {new Date(member.joined_at).toLocaleDateString()}</p>
            <label>
                <span><UserCircle size={14}/> Display name</span>
                <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Artist or producer name"/>
            </label>
            <label>
                <span><Link2 size={14}/> Social link</span>
                <input value={socialLink} onChange={(event) => setSocialLink(event.target.value)} placeholder="https://"/>
            </label>
            <label>
                <span>Profile image URL</span>
                <input value={profileImageUrl} onChange={(event) => setProfileImageUrl(event.target.value)} placeholder="https://"/>
            </label>
            {message ? <p>{message}</p> : null}
            <button onClick={() => void saveProfile()} type="button" disabled={busy}>
                <Save size={15}/>
                {busy ? "Saving..." : "Save Founding Profile"}
            </button>
            <style jsx>{`
              .founding-profile-card {
                display: grid;
                gap: 12px;
                padding: 16px;
                border-radius: 16px;
                background: rgba(15, 23, 42, 0.72);
                border: 1px solid rgba(148, 163, 184, 0.18);
              }
              .founding-profile-head {
                display: flex;
                gap: 10px;
                align-items: center;
              }
              .founding-profile-card label {
                display: grid;
                gap: 6px;
              }
              .founding-profile-card label span {
                display: inline-flex;
                align-items: center;
                gap: 6px;
              }
            `}</style>
        </section>
    );
}
