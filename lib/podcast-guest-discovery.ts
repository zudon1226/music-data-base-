import type { PodcastDiscoverySection } from "@/lib/podcast-discovery";
import {
    ALL_PODCAST_DISCOVERY_SECTION_IDS,
    coercePodcastDiscoverySectionForUser as coerceSectionShared,
    visiblePodcastDiscoverySectionIds as visibleSectionIdsShared,
} from "./podcast-guest-discovery.shared.mjs";

export { ALL_PODCAST_DISCOVERY_SECTION_IDS };

export function visiblePodcastDiscoverySectionIds(userId?: string | null): readonly PodcastDiscoverySection[] {
    return visibleSectionIdsShared(userId) as readonly PodcastDiscoverySection[];
}

export function coercePodcastDiscoverySectionForUser(
    userId: string | undefined | null,
    section: PodcastDiscoverySection,
): PodcastDiscoverySection {
    return coerceSectionShared(userId, section) as PodcastDiscoverySection;
}