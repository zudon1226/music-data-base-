import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PublicProfileView from "@/components/PublicProfileView";
import { loadPublicProfileExtras } from "@/lib/dashboard/public-profile-extras";
import { getPublicSiteUrl } from "@/lib/server-supabase";
import { loadPublicProducerProfile } from "@/lib/public-profile";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const profile = await loadPublicProducerProfile(decodeURIComponent(id)).catch(() => null);
  const title = profile ? `${profile.name} | Music Data Base` : "Producer | Music Data Base";
  const description = profile?.bio || "Discover producer beats and releases on Music Data Base.";
  const image = profile?.bannerUrl || profile?.avatarUrl || "/music-data-base-logo.png";
  const url = `${getPublicSiteUrl()}/producer/${encodeURIComponent(id)}`;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      type: "profile",
      url,
      images: [{ url: image, alt: title }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image],
    },
  };
}

export default async function ProducerPublicPage({ params }: PageProps) {
  const { id } = await params;
  const profile = await loadPublicProducerProfile(decodeURIComponent(id)).catch(() => null);

  if (!profile) notFound();

  const extras = await loadPublicProfileExtras(profile.userId).catch(() => ({
    followingCount: 0,
    publicPlaylists: [],
    username: "",
    city: "",
    country: "",
    followerCount: 0,
  }));
  if (extras.followerCount > profile.followers) {
    profile.followers = extras.followerCount;
  }

  return <PublicProfileView profile={profile} extras={extras} />;
}
