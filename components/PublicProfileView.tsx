import type { PublicMediaItem, PublicProfile } from "@/lib/public-profile";
import Image from "next/image";

const DEFAULT_IMAGE = "/music-data-base-logo.png";

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

export default function PublicProfileView({ profile }: { profile: PublicProfile }) {
  const totalReleases = profile.songs.length + profile.videos.length + profile.albums.length + profile.beats.length;

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
            <p>{profile.bio}</p>
            {profile.website ? <a href={profile.website}>{profile.website}</a> : null}
          </div>
        </div>
      </section>

      <section className="public-profile-stats">
        <div>
          <strong>{profile.followers.toLocaleString()}</strong>
          <span>Followers</span>
        </div>
        <div>
          <strong>{profile.monthlyListeners.toLocaleString()}</strong>
          <span>Monthly listeners</span>
        </div>
        <div>
          <strong>{totalReleases.toLocaleString()}</strong>
          <span>Public releases</span>
        </div>
      </section>

      <PublicMediaGrid title="Albums" items={profile.albums} />
      <PublicMediaGrid title="Songs" items={profile.songs} />
      <PublicMediaGrid title="Videos" items={profile.videos} />
      {profile.type === "producer" ? <PublicMediaGrid title="Beats" items={profile.beats} /> : null}
    </main>
  );
}
