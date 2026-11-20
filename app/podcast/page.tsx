import AppPage from "@/app-home-page";
import { buildPodcastDiscoveryMetadata } from "@/lib/public-podcast-metadata";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
    return buildPodcastDiscoveryMetadata();
}

export default function PodcastDiscoveryPage() {
    return <AppPage initialPublicPodcastDiscovery />;
}