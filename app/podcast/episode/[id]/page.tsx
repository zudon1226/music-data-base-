import type { Metadata } from "next";
import AppPage from "@/app-home-page";

export const dynamic = "force-dynamic";

type PageProps = {
    params: Promise<{ id: string }>;
};

export const metadata: Metadata = {
    title: "Podcast Episode",
    description: "Play this Podcast episode on Music Data Base.",
};

export default async function PodcastEpisodePage({ params }: PageProps) {
    const { id } = await params;
    return <AppPage initialPodcastEpisodeId={id} />;
}
