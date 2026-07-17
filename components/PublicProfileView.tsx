import type { PublicMediaItem, PublicProfile } from "@/lib/public-profile";
import type { PublicProfileExtras } from "@/lib/dashboard/public-profile-extras";
import { PublicProfileFollowClient } from "@/components/dashboard/public-profile-follow-client";
import Image from "next/image";

const DEFAULT_IMAGE = "/music-data-base-logo.png";

export type { PublicProfileExtras };

function formatDate(value: string) {
    if (!value) return "New release";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "New release";
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function PublicMediaGrid({
    title,
    items,
}: {
    title: string;
    items: PublicMediaItem[];
}) {
    return (
        <section className="public-profile-section">
            <div className="public-section-heading">
                <h2>{title}</h2>
                <span>{items.length}</span>
            </div>

            {items.length === 0 ? (
                <div className="public-empty-state">No public {title.toLowerCase()} yet.</div>
            ) : (
                <div className="public-card-grid">
                    {items.map((item) => (
                        <article className="public-media-card" key={`${title}-${item.id}`}>
                            <Image
                                src={item.coverUrl || DEFAULT_IMAGE}
                                alt=""
                                width={420}
                                height={252}
                                unoptimized
                            />
                            <div>
                                <span>{item.category}</span>
                                <h3>{item.title}</h3>
                                <p>{item.creator}</p>
                                <small>{item.metricLabel} • {formatDate(item.createdAt)}</small>
                            </div>
                        </article>
                    ))}
                </div>
            )}
        </section>
    );
}

export default function PublicProfileView({
    profile,
    extras,
}: {
    profile: PublicProfile;
    extras?: PublicProfileExtras;
}) {
    const totalReleases = profile.songs.length + profile.videos.length + profile.albums.length + profile.beats.length;
    const playlists = extras?.publicPlaylists || [];
    const location = [extras?.city, extras?.country].filter(Boolean).join(", ");

    return (
        <main className="public-profile-page">
            <section className="public-profile-hero">
                <Image
                    className="public-profile-banner"
                    src={profile.bannerUrl || DEFAULT_IMAGE}
                    alt=""
                    width={1180}
                    height={280}
                    priority
                    unoptimized
                />
                <div className="public-profile-hero-content">
                    <Image
                        className="public-profile-avatar"
                        src={profile.avatarUrl || DEFAULT_IMAGE}
                        alt=""
                        width={150}
                        height={150}
                        unoptimized
                    />
                    <div>
                        <span>{profile.type === "artist" ? "Artist Profile" : "Producer Profile"}</span>
                        <h1>
                            {profile.name}
                            {profile.verified ? <span className="public-verified-badge">✓</span> : null}
                        </h1>
                        {extras?.username ? <p className="public-profile-username">@{extras.username}</p> : null}
                        <p>{profile.bio}</p>
                        {location ? <p>{location}</p> : null}
                        {profile.website ? <a href={profile.website}>{profile.website}</a> : null}
                        <div className="public-profile-follow-row">
                            <PublicProfileFollowClient
                                targetUserId={profile.userId}
                                initialFollowerCount={profile.followers}
                            />
                        </div>
                    </div>
                </div>
            </section>

            <section className="public-profile-stats">
                <div>
                    <strong>{profile.followers.toLocaleString()}</strong>
                    <span>Followers</span>
                </div>
                <div>
                    <strong>{Number(extras?.followingCount || 0).toLocaleString()}</strong>
                    <span>Following</span>
                </div>
                <div>
                    <strong>{profile.monthlyListeners.toLocaleString()}</strong>
                    <span>Monthly listeners</span>
                </div>
                <div>
                    <strong>{totalReleases.toLocaleString()}</strong>
                    <span>Public uploads</span>
                </div>
            </section>

            <PublicMediaGrid title="Albums" items={profile.albums} />
            <PublicMediaGrid title="Songs" items={profile.songs} />
            <PublicMediaGrid title="Videos" items={profile.videos} />
            {profile.type === "producer" ? <PublicMediaGrid title="Beats" items={profile.beats} /> : null}

            <section className="public-profile-section">
                <div className="public-section-heading">
                    <h2>Public Playlists</h2>
                    <span>{playlists.length}</span>
                </div>
                {playlists.length === 0 ? (
                    <div className="public-empty-state">No public playlists yet.</div>
                ) : (
                    <div className="public-card-grid">
                        {playlists.map((playlist) => (
                            <article className="public-media-card" key={playlist.id}>
                                <Image
                                    src={playlist.coverUrl || DEFAULT_IMAGE}
                                    alt=""
                                    width={420}
                                    height={252}
                                    unoptimized
                                />
                                <div>
                                    <span>{playlist.playlistType || "Playlist"}</span>
                                    <h3>{playlist.name}</h3>
                                    <small>{formatDate(playlist.createdAt || "")}</small>
                                </div>
                            </article>
                        ))}
                    </div>
                )}
            </section>
        </main>
    );
}
