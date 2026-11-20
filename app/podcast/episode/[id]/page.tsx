import { notFound } from "next/navigation";
import AppPage from "@/app-home-page";
import {
    buildPublicPodcastEpisodeMetadata,
    buildRestrictedPodcastMetadata,
    loadPublicPodcastEpisodeForMetadata,
} from "@/lib/public-podcast-metadata";

export const dynamic = "force-dynamic";

type PageProps = {
    params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: PageProps) {
    const { id } = await params;
    const loaded = await loadPublicPodcastEpisodeForMetadata(id);
    if (loaded.kind === "missing") notFound();
    if (loaded.kind === "restricted") return buildRestrictedPodcastMetadata("episode");
    return buildPublicPodcastEpisodeMetadata(loaded.episode, loaded.show);
}

export default async function PodcastEpisodePage({ params }: PageProps) {
    const { id } = await params;
    const loaded = await loadPublicPodcastEpisodeForMetadata(id);
    if (loaded.kind === "missing") notFound();
    return <AppPage initialPodcastEpisodeId={id} />;
}