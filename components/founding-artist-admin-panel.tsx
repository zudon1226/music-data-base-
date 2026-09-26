"use client";

import { useState } from "react";
import { Award, RefreshCw, UserMinus, UserPlus } from "lucide-react";

type FoundingArtistAdminPanelProps = {
    userId: string;
    accessToken: string;
    refreshToken: string;
};

type TargetProfile = {
    userId: string;
    displayName: string;
    username: string;
    accountType: string;
    isFoundingArtist: boolean;
    foundingArtistSince: string | null;
    eligible: boolean;
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

export function FoundingArtistAdminPanel({
    userId,
    accessToken,
    refreshToken,
}: FoundingArtistAdminPanelProps) {
    const [targetUserId, setTargetUserId] = useState("");
    const [profile, setProfile] = useState<TargetProfile | null>(null);
    const [loading, setLoading] = useState(false);
    const [busyAction, setBusyAction] = useState("");
    const [error, setError] = useState("");
    const [message, setMessage] = useState("");

    async function loadTarget() {
        const clean = targetUserId.trim();
        if (!clean) {
            setError("Enter an Artist account user id.");
            return;
        }
        setLoading(true);
        setError("");
        setMessage("");
        try {
            const response = await fetch(
                `/api/launch/founding-artist-designation?userId=${encodeURIComponent(userId)}&targetUserId=${encodeURIComponent(clean)}`,
                { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" },
            );
            const json = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(json.error || "Unable to load profile.");
            }
            setProfile({
                userId: String(json.profile?.userId || clean),
                displayName: String(json.profile?.displayName || ""),
                username: String(json.profile?.username || ""),
                accountType: String(json.profile?.accountType || ""),
                isFoundingArtist: Boolean(json.profile?.isFoundingArtist),
                foundingArtistSince: json.profile?.foundingArtistSince
                    ? String(json.profile.foundingArtistSince)
                    : null,
                eligible: Boolean(json.eligible),
            });
        }
        catch (loadError) {
            setProfile(null);
            setError(loadError instanceof Error ? loadError.message : "Unable to load profile.");
        }
        finally {
            setLoading(false);
        }
    }

    async function runAction(action: "grant" | "remove") {
        if (!profile?.userId) return;
        setBusyAction(action);
        setError("");
        setMessage("");
        try {
            const response = await fetch("/api/launch/founding-artist-designation", {
                method: "PATCH",
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(authBody(userId, accessToken, refreshToken, {
                    targetUserId: profile.userId,
                    action,
                })),
            });
            const json = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(json.error || "Action failed.");
            }
            setMessage(action === "grant" ? "Founding Artist granted." : "Founding Artist removed.");
            await loadTarget();
        }
        catch (actionError) {
            setError(actionError instanceof Error ? actionError.message : "Action failed.");
        }
        finally {
            setBusyAction("");
        }
    }

    return (
        <div className="founding-artist-admin-panel">
            <p className="control-center-empty">
                Grant or remove Founding Artist recognition for existing Artist accounts only. This does not change roles, billing, or payouts.
            </p>
            <label className="cleanup-field">
                <span>Artist user id</span>
                <input
                    value={targetUserId}
                    onChange={(event) => setTargetUserId(event.target.value)}
                    placeholder="UUID of the Artist account"
                    autoComplete="off"
                />
            </label>
            <div className="founding-artist-admin-actions">
                <button type="button" onClick={() => void loadTarget()} disabled={loading}>
                    <RefreshCw size={14}/>
                    {loading ? "Loading…" : "Load Artist"}
                </button>
            </div>
            {error ? <div className="upload-error"><p>{error}</p></div> : null}
            {message ? <p className="cleanup-safe-yes">{message}</p> : null}
            {profile ? (
                <article className="control-center-card" data-card-family="control">
                    <h4>{profile.displayName || profile.userId}</h4>
                    <p>
                        {profile.username ? `@${profile.username} · ` : ""}
                        Account type: {profile.accountType || "unknown"}
                    </p>
                    <p>
                        Founding Artist: {profile.isFoundingArtist ? "Yes" : "No"}
                        {profile.foundingArtistSince ? ` · since ${new Date(profile.foundingArtistSince).toLocaleString()}` : ""}
                    </p>
                    {!profile.eligible ? (
                        <p className="cleanup-safe-no">Only Artist accounts can receive this designation.</p>
                    ) : (
                        <div className="founding-artist-admin-actions">
                            <button
                                type="button"
                                disabled={busyAction !== "" || profile.isFoundingArtist}
                                onClick={() => void runAction("grant")}
                            >
                                <UserPlus size={14}/>
                                Grant Founding Artist
                            </button>
                            <button
                                type="button"
                                disabled={busyAction !== "" || !profile.isFoundingArtist}
                                onClick={() => void runAction("remove")}
                            >
                                <UserMinus size={14}/>
                                Remove Founding Artist
                            </button>
                        </div>
                    )}
                </article>
            ) : null}
            <p className="control-center-empty">
                <Award size={14} style={{ display: "inline", verticalAlign: "middle" }} />
                {" "}
                Badge copy: Founding Artist (recognition only).
            </p>
        </div>
    );
}
