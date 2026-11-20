import { notFound } from "next/navigation";
import AppPage from "@/app-home-page";
import {
    buildPublicPodcastShowMetadata,
    buildRestrictedPodcastMetadata,
    loadPublicPodcastShowForMetadata,
} from "@/lib/public-podcast-metadata";

export const dynamic = "force-dynamic";

type PageProps = {
    params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: PageProps) {
    const { id } = await params;
    const loaded = await loadPublicPodcastShowForMetadata(id);
    if (loaded.kind === "missing") notFound();
    if (loaded.kind === "restricted") return buildRestrictedPodcastMetadata("show");
    return buildPublicPodcastShowMetadata(loaded.show);
}

export default async function PodcastShowPage({ params }: PageProps) {
    const { id } = await params;
    const loaded = await loadPublicPodcastShowForMetadata(id);
    if (loaded.kind === "missing") notFound();
    return <AppPage initialPodcastShowId={id} />;
}