import type { Metadata } from "next";
import AppPage from "@/app-home-page";

export const dynamic = "force-dynamic";

type PageProps = {
    params: Promise<{ id: string }>;
};

export const metadata: Metadata = {
    title: "Podcast Show",
    description: "Listen to this Podcast show on Music Data Base.",
};

export default async function PodcastShowPage({ params }: PageProps) {
    const { id } = await params;
    return <AppPage initialPodcastShowId={id} />;
}
