"use client";

import { useCallback, useEffect, useState } from "react";
import { Camera, ExternalLink, LogOut } from "lucide-react";
import { LanguageSelector } from "@/components/language-selector";
import { PROFILE_FIELD_LIMITS } from "@/lib/dashboard/profile-fields";
import { useTranslation } from "@/lib/i18n/provider";

export type UserProfileDashboardData = {
    displayName: string;
    username: string;
    role: string;
    avatarUrl: string;
    biography: string;
    city: string;
    country: string;
    website: string;
    preferredLanguage: string;
    createdAt: string;
    stats: {
        followerCount: number;
        followingCount: number;
        songsCount: number;
        videosCount: number;
        ringtoneCount: number;
    };
};

type FetchFn = (path: string, init?: RequestInit & { requireAuth?: boolean }) => Promise<Response>;

type UserProfileDashboardProps = {
    userId: string;
    email?: string;
    isPlatformOwner?: boolean;
    accountRoleLabel?: string;
    fetchFn: FetchFn;
    onLogout: () => void;
    onSaved?: (profile: Partial<UserProfileDashboardData>) => void;
    children?: React.ReactNode;
};

const EMPTY_STATS = {
    followerCount: 0,
    followingCount: 0,
    songsCount: 0,
    videosCount: 0,
    ringtoneCount: 0,
};

function roleBadges(role: string, isPlatformOwner?: boolean) {
    const badges: string[] = [];
    if (isPlatformOwner) badges.push("Owner");
    const normalized = String(role || "listener").toLowerCase();
    if (normalized === "artist") badges.push("Artist");
    if (normalized === "producer") badges.push("Producer");
    if (normalized === "admin") badges.push("Admin");
    if (badges.length === 0) badges.push("Listener");
    return badges;
}

function formatCreatedAt(value: string, locale: string) {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    try {
        return new Intl.DateTimeFormat(locale || "en", { dateStyle: "medium" }).format(date);
    }
    catch {
        return date.toLocaleDateString();
    }
}

export function UserProfileDashboard({
    userId,
    email,
    isPlatformOwner,
    accountRoleLabel,
    fetchFn,
    onLogout,
    onSaved,
    children,
}: UserProfileDashboardProps) {
    const { t, locale } = useTranslation();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [editing, setEditing] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [profile, setProfile] = useState<UserProfileDashboardData>({
        displayName: "",
        username: "",
        role: "listener",
        avatarUrl: "",
        biography: "",
        city: "",
        country: "",
        website: "",
        preferredLanguage: locale || "en",
        createdAt: "",
        stats: EMPTY_STATS,
    });
    const [draft, setDraft] = useState(profile);

    const loadProfile = useCallback(async () => {
        if (!userId) return;
        setLoading(true);
        setError("");
        try {
            const response = await fetchFn(`/api/user-profile?userId=${encodeURIComponent(userId)}`, {
                cache: "no-store",
                requireAuth: true,
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(String(data.error || t("dashboard.profile.loadFailed")));
            }
            const next: UserProfileDashboardData = {
                displayName: String(data.displayName || ""),
                username: String(data.username || ""),
                role: String(data.role || accountRoleLabel || "listener"),
                avatarUrl: String(data.avatarUrl || ""),
                biography: String(data.biography || ""),
                city: String(data.city || ""),
                country: String(data.country || ""),
                website: String(data.website || ""),
                preferredLanguage: String(data.preferredLanguage || locale || "en"),
                createdAt: String(data.createdAt || ""),
                stats: {
                    followerCount: Number(data.stats?.followerCount || 0),
                    followingCount: Number(data.stats?.followingCount || 0),
                    songsCount: Number(data.stats?.songsCount || 0),
                    videosCount: Number(data.stats?.videosCount || 0),
                    ringtoneCount: Number(data.stats?.ringtoneCount || 0),
                },
            };
            setProfile(next);
            setDraft(next);
        }
        catch (loadError) {
            setError(loadError instanceof Error ? loadError.message : t("dashboard.profile.loadFailed"));
        }
        finally {
            setLoading(false);
        }
    }, [accountRoleLabel, fetchFn, locale, t, userId]);

    useEffect(() => {
        void loadProfile();
    }, [loadProfile]);

    async function saveProfile() {
        setSaving(true);
        setError("");
        setSuccess("");
        try {
            const response = await fetchFn("/api/user-profile", {
                method: "POST",
                requireAuth: true,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "update-profile",
                    userId,
                    displayName: draft.displayName,
                    username: draft.username,
                    biography: draft.biography,
                    city: draft.city,
                    country: draft.country,
                    website: draft.website,
                    avatarUrl: draft.avatarUrl,
                }),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(String(data.error || t("dashboard.profile.saveFailed")));
            }
            const next = {
                ...draft,
                displayName: String(data.displayName || draft.displayName),
                username: String(data.username || draft.username),
                biography: String(data.biography || draft.biography),
                city: String(data.city || draft.city),
                country: String(data.country || draft.country),
                website: String(data.website || draft.website),
                avatarUrl: String(data.avatarUrl || draft.avatarUrl),
            };
            setProfile((previous) => ({ ...previous, ...next }));
            setDraft((previous) => ({ ...previous, ...next }));
            setEditing(false);
            setSuccess(t("dashboard.profile.saveSuccess"));
            onSaved?.(next);
        }
        catch (saveError) {
            setError(saveError instanceof Error ? saveError.message : t("dashboard.profile.saveFailed"));
        }
        finally {
            setSaving(false);
        }
    }

    async function uploadAvatar(file: File | null) {
        if (!file) return;
        setSaving(true);
        setError("");
        setSuccess("");
        try {
            const form = new FormData();
            form.set("userId", userId);
            form.set("file", file);
            const response = await fetchFn("/api/profile-avatar", {
                method: "POST",
                requireAuth: true,
                body: form,
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(String(data.error || t("dashboard.profile.avatarFailed")));
            }
            const avatarUrl = String(data.avatarUrl || "");
            setProfile((previous) => ({ ...previous, avatarUrl }));
            setDraft((previous) => ({ ...previous, avatarUrl }));
            setSuccess(t("dashboard.profile.avatarSuccess"));
            onSaved?.({ avatarUrl });
        }
        catch (uploadError) {
            setError(uploadError instanceof Error ? uploadError.message : t("dashboard.profile.avatarFailed"));
        }
        finally {
            setSaving(false);
        }
    }

    const initial = (profile.displayName || email || "Z").slice(0, 1).toUpperCase();
    const badges = roleBadges(profile.role || accountRoleLabel || "", isPlatformOwner);

    if (loading) {
        return (
            <section className="profile-page user-profile-dashboard" aria-busy="true">
                <p className="profile-feedback">{t("common.loading")}</p>
            </section>
        );
    }

    return (
        <section className="profile-page user-profile-dashboard">
            <div className="profile-hero">
                <div className="profile-avatar-wrap">
                    {profile.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img className="profile-avatar-image" src={profile.avatarUrl} alt="" />
                    ) : (
                        <div className="profile-avatar">{initial}</div>
                    )}
                    <label className="profile-avatar-upload">
                        <Camera size={16} aria-hidden="true" />
                        <span>{t("dashboard.profile.changeAvatar")}</span>
                        <input
                            accept="image/jpeg,image/png,image/webp,image/gif"
                            disabled={saving}
                            onChange={(event) => void uploadAvatar(event.target.files?.[0] || null)}
                            type="file"
                        />
                    </label>
                </div>

                <div className="profile-hero-main">
                    <span className="playlist-kicker">
                        {isPlatformOwner ? "OWNER / ADMIN" : t("profile.userProfile")}
                    </span>
                    <h2>{profile.displayName || t("dashboard.profile.unnamed")}</h2>
                    {profile.username ? <p className="profile-username">@{profile.username}</p> : null}
                    {email ? <p className="profile-email">{email}</p> : null}
                    <div className="profile-role-badges" aria-label={t("profile.role")}>
                        {badges.map((badge) => (
                            <span className="profile-role-badge" key={badge}>{badge}</span>
                        ))}
                    </div>
                    <div className="profile-actions">
                        <button
                            disabled={saving}
                            onClick={() => {
                                setEditing((value) => !value);
                                setDraft(profile);
                                setError("");
                                setSuccess("");
                            }}
                            type="button"
                        >
                            {editing ? t("common.cancel") : t("common.edit")}
                        </button>
                        <button onClick={onLogout} type="button">
                            <LogOut size={16} />
                            {t("common.logout")}
                        </button>
                    </div>
                </div>
            </div>

            {error ? <p className="profile-feedback profile-feedback-error" role="alert">{error}</p> : null}
            {success ? <p className="profile-feedback profile-feedback-success" role="status">{success}</p> : null}

            {editing ? (
                <form
                    className="profile-edit-form"
                    onSubmit={(event) => {
                        event.preventDefault();
                        void saveProfile();
                    }}
                >
                    <label>
                        <span>{t("dashboard.profile.displayName")}</span>
                        <input
                            maxLength={PROFILE_FIELD_LIMITS.displayName}
                            value={draft.displayName}
                            onChange={(event) => setDraft((previous) => ({ ...previous, displayName: event.target.value }))}
                            required
                        />
                    </label>
                    <label>
                        <span>{t("dashboard.profile.username")}</span>
                        <input
                            maxLength={PROFILE_FIELD_LIMITS.username}
                            value={draft.username}
                            onChange={(event) => setDraft((previous) => ({ ...previous, username: event.target.value }))}
                            autoComplete="username"
                        />
                    </label>
                    <label>
                        <span>{t("dashboard.profile.biography")}</span>
                        <textarea
                            maxLength={PROFILE_FIELD_LIMITS.biography}
                            rows={4}
                            value={draft.biography}
                            onChange={(event) => setDraft((previous) => ({ ...previous, biography: event.target.value }))}
                        />
                    </label>
                    <div className="profile-edit-row">
                        <label>
                            <span>{t("dashboard.profile.city")}</span>
                            <input
                                maxLength={PROFILE_FIELD_LIMITS.city}
                                value={draft.city}
                                onChange={(event) => setDraft((previous) => ({ ...previous, city: event.target.value }))}
                            />
                        </label>
                        <label>
                            <span>{t("dashboard.profile.country")}</span>
                            <input
                                maxLength={PROFILE_FIELD_LIMITS.country}
                                value={draft.country}
                                onChange={(event) => setDraft((previous) => ({ ...previous, country: event.target.value }))}
                            />
                        </label>
                    </div>
                    <label>
                        <span>{t("dashboard.profile.website")}</span>
                        <input
                            maxLength={PROFILE_FIELD_LIMITS.website}
                            type="url"
                            placeholder="https://"
                            value={draft.website}
                            onChange={(event) => setDraft((previous) => ({ ...previous, website: event.target.value }))}
                        />
                    </label>
                    <div className="profile-edit-actions">
                        <button disabled={saving} type="submit">
                            {saving ? t("common.working") : t("common.save")}
                        </button>
                    </div>
                </form>
            ) : (
                <div className="profile-details">
                    {profile.biography ? <p className="profile-bio">{profile.biography}</p> : (
                        <p className="profile-bio profile-bio-empty">{t("dashboard.profile.noBiography")}</p>
                    )}
                    <dl className="profile-meta-list">
                        <div>
                            <dt>{t("dashboard.profile.location")}</dt>
                            <dd>{[profile.city, profile.country].filter(Boolean).join(", ") || "—"}</dd>
                        </div>
                        <div>
                            <dt>{t("dashboard.profile.website")}</dt>
                            <dd>
                                {profile.website ? (
                                    <a href={profile.website} rel="noopener noreferrer" target="_blank">
                                        {profile.website}
                                        <ExternalLink size={14} aria-hidden="true" />
                                    </a>
                                ) : "—"}
                            </dd>
                        </div>
                        <div>
                            <dt>{t("dashboard.profile.memberSince")}</dt>
                            <dd>{formatCreatedAt(profile.createdAt, locale)}</dd>
                        </div>
                    </dl>
                </div>
            )}

            <div className="profile-grid profile-stats-grid" aria-label={t("profile.stats")}>
                <div>
                    <strong>{profile.stats.followerCount}</strong>
                    <span>{t("dashboard.profile.followers")}</span>
                </div>
                <div>
                    <strong>{profile.stats.followingCount}</strong>
                    <span>{t("dashboard.profile.following")}</span>
                </div>
                <div>
                    <strong>{profile.stats.songsCount}</strong>
                    <span>{t("dashboard.profile.songs")}</span>
                </div>
                <div>
                    <strong>{profile.stats.videosCount}</strong>
                    <span>{t("dashboard.profile.videos")}</span>
                </div>
                <div>
                    <strong>{profile.stats.ringtoneCount}</strong>
                    <span>{t("dashboard.profile.ringtones")}</span>
                </div>
            </div>

            <div className="profile-save">
                <h3>{t("settings.title")}</h3>
                <p>{t("settings.languageDescription")}</p>
                <div className="profile-language-row">
                    <span>{t("profile.preferredLanguage")}</span>
                    <LanguageSelector />
                </div>
            </div>

            {children}
        </section>
    );
}
