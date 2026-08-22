import {
    clientSlugForPlanName,
    isClientPlanSlug,
    type ClientPlanSlug,
} from "@/lib/billing/plan-catalog";
import type { SubscriptionPlanRow, SubscriptionRow } from "@/lib/billing/types";
import { resolveEffectiveSubscriptionStatus } from "@/lib/billing/creator-access";

/**
 * Canonical Podcast subscription entitlements.
 * Plan metadata for later Stripe enforcement. Phase 1 Studio remains role-based:
 * Artist, Producer, or Artist+Producer get one Studio grant (no duplicate permissions).
 */
export type PodcastPlanEntitlements = {
    podcastPublicAudio: boolean;
    podcastPublicVideo: boolean;
    podcastDiscovery: boolean;
    podcastFollow: boolean;
    podcastLike: boolean;
    podcastSave: boolean;
    podcastSubscriberOnly: boolean;
    podcastStudio: boolean;
    podcastAudioUpload: boolean;
    podcastVideoUpload: boolean;
    podcastShowManagement: boolean;
    podcastEpisodeManagement: boolean;
    podcastAnalytics: boolean;
};

export type PodcastContentAccess = "public" | "subscriber_only";

export type ClientPlanSupport = {
    slug: ClientPlanSlug;
    features: string[];
    highlights: string[];
    entitlements: PodcastPlanEntitlements;
};

const LISTENER_PUBLIC_ENTITLEMENTS: PodcastPlanEntitlements = {
    podcastPublicAudio: true,
    podcastPublicVideo: true,
    podcastDiscovery: true,
    podcastFollow: true,
    podcastLike: true,
    podcastSave: true,
    podcastSubscriberOnly: false,
    podcastStudio: false,
    podcastAudioUpload: false,
    podcastVideoUpload: false,
    podcastShowManagement: false,
    podcastEpisodeManagement: false,
    podcastAnalytics: false,
};

const CREATOR_PODCAST_ENTITLEMENTS: PodcastPlanEntitlements = {
    podcastPublicAudio: true,
    podcastPublicVideo: true,
    podcastDiscovery: true,
    podcastFollow: true,
    podcastLike: true,
    podcastSave: true,
    podcastSubscriberOnly: false,
    podcastStudio: true,
    podcastAudioUpload: true,
    podcastVideoUpload: true,
    podcastShowManagement: true,
    podcastEpisodeManagement: true,
    podcastAnalytics: true,
};

export const CLIENT_PLAN_SUPPORT: Record<ClientPlanSlug, ClientPlanSupport> = {
    "free-listener": {
        slug: "free-listener",
        features: [
            "Free listening",
            "Library saves",
            "Playlists",
            "Audio & video podcasts",
            "Podcast access",
        ],
        highlights: [
            "Free listening",
            "Audio & video podcasts",
            "Podcast access",
        ],
        entitlements: { ...LISTENER_PUBLIC_ENTITLEMENTS },
    },
    "premium-listener": {
        slug: "premium-listener",
        features: [
            "Subscriber-only albums",
            "Subscriber-only videos",
            "Exclusive playlists",
            "Early releases",
            "Audio & video podcasts",
            "Podcast access",
            "Subscriber-only podcasts",
        ],
        highlights: [
            "Audio & video podcasts",
            "Podcast access",
            "Subscriber-only podcasts",
        ],
        entitlements: {
            ...LISTENER_PUBLIC_ENTITLEMENTS,
            podcastSubscriberOnly: true,
        },
    },
    "creator-free": {
        slug: "creator-free",
        features: [
            "Upload music and videos",
            "Library, likes, follows",
            "Basic dashboard",
            "Podcast Studio",
            "Podcast uploads",
            "Audio & video podcasts",
        ],
        highlights: [
            "Upload music and videos",
            "Podcast Studio",
            "Podcast uploads",
        ],
        entitlements: { ...CREATOR_PODCAST_ENTITLEMENTS },
    },
    "artist-pro": {
        slug: "artist-pro",
        features: [
            "Payout dashboard",
            "Revenue split tracking",
            "Download and purchase foundation",
            "Podcast Studio",
            "Audio & video podcast uploads",
            "Podcast show and episode management",
            "Podcast analytics",
        ],
        highlights: [
            "Payout dashboard",
            "Podcast Studio",
            "Audio & video podcast uploads",
        ],
        entitlements: { ...CREATOR_PODCAST_ENTITLEMENTS },
    },
    "producer-pro": {
        slug: "producer-pro",
        features: [
            "Beat license tracking",
            "Producer payouts",
            "Split and transaction history",
            "Podcast Studio",
            "Audio & video podcast uploads",
            "Podcast show and episode management",
            "Podcast analytics",
        ],
        highlights: [
            "Beat license tracking",
            "Podcast Studio",
            "Audio & video podcast uploads",
        ],
        entitlements: { ...CREATOR_PODCAST_ENTITLEMENTS },
    },
};

const EMPTY_ENTITLEMENTS: PodcastPlanEntitlements = {
    podcastPublicAudio: false,
    podcastPublicVideo: false,
    podcastDiscovery: false,
    podcastFollow: false,
    podcastLike: false,
    podcastSave: false,
    podcastSubscriberOnly: false,
    podcastStudio: false,
    podcastAudioUpload: false,
    podcastVideoUpload: false,
    podcastShowManagement: false,
    podcastEpisodeManagement: false,
    podcastAnalytics: false,
};

export function entitlementsForPlanSlug(slug: string | null | undefined): PodcastPlanEntitlements {
    if (!slug || !isClientPlanSlug(slug)) return { ...LISTENER_PUBLIC_ENTITLEMENTS };
    return { ...CLIENT_PLAN_SUPPORT[slug].entitlements };
}

export function unionPodcastEntitlements(
    ...items: Array<PodcastPlanEntitlements | null | undefined>
): PodcastPlanEntitlements {
    return items.reduce<PodcastPlanEntitlements>((merged, item) => {
        if (!item) return merged;
        return {
            podcastPublicAudio: merged.podcastPublicAudio || item.podcastPublicAudio,
            podcastPublicVideo: merged.podcastPublicVideo || item.podcastPublicVideo,
            podcastDiscovery: merged.podcastDiscovery || item.podcastDiscovery,
            podcastFollow: merged.podcastFollow || item.podcastFollow,
            podcastLike: merged.podcastLike || item.podcastLike,
            podcastSave: merged.podcastSave || item.podcastSave,
            podcastSubscriberOnly: merged.podcastSubscriberOnly || item.podcastSubscriberOnly,
            podcastStudio: merged.podcastStudio || item.podcastStudio,
            podcastAudioUpload: merged.podcastAudioUpload || item.podcastAudioUpload,
            podcastVideoUpload: merged.podcastVideoUpload || item.podcastVideoUpload,
            podcastShowManagement: merged.podcastShowManagement || item.podcastShowManagement,
            podcastEpisodeManagement: merged.podcastEpisodeManagement || item.podcastEpisodeManagement,
            podcastAnalytics: merged.podcastAnalytics || item.podcastAnalytics,
        };
    }, { ...EMPTY_ENTITLEMENTS });
}

/**
 * Artist + Producer share one Podcast Studio grant.
 * Phase 1 runtime stays role-based; plan flags are the later Stripe contract.
 */
export function resolvePodcastAccess(input: {
    planSlug?: string | null;
    extraPlanSlugs?: Array<string | null | undefined>;
    isArtist?: boolean;
    isProducer?: boolean;
    isAdmin?: boolean;
}) {
    const slugs = [input.planSlug, ...(input.extraPlanSlugs || [])]
        .filter((value): value is ClientPlanSlug => Boolean(value && isClientPlanSlug(value)));
    const uniqueSlugs = [...new Set(slugs)];
    const planEntitlements = uniqueSlugs.length
        ? unionPodcastEntitlements(...uniqueSlugs.map((slug) => CLIENT_PLAN_SUPPORT[slug].entitlements))
        : { ...LISTENER_PUBLIC_ENTITLEMENTS };
    const studioAllowedByRole = Boolean(input.isAdmin || input.isArtist || input.isProducer);
    return {
        planEntitlements,
        studioAllowedByRole,
        duplicateStudioGrant: false,
    };
}

export function canAccessPodcastEpisodeContent(input: {
    access?: PodcastContentAccess | null;
    episodeType: "audio" | "video";
    entitlements: PodcastPlanEntitlements;
}) {
    const publicOk = input.episodeType === "video"
        ? input.entitlements.podcastPublicVideo
        : input.entitlements.podcastPublicAudio;
    const access = input.access || "public";
    if (access === "public") return publicOk;
    return Boolean(input.entitlements.podcastSubscriberOnly);
}

export function evaluatePodcastSubscriberOnlyAccess(subscription: SubscriptionRow | null) {
    if (!subscription) {
        return { allowed: false, planSlug: null as ClientPlanSlug | null };
    }
    const planName = String(subscription.plan_name || "").trim();
    const priceCents = Math.max(0, Math.round(Number(subscription.price_cents || 0)));
    const planSlug = clientSlugForPlanName(planName, priceCents);
    const entitlements = entitlementsForPlanSlug(planSlug);
    const status = resolveEffectiveSubscriptionStatus(subscription);
    const allowed = Boolean(
        entitlements.podcastSubscriberOnly
        && priceCents > 0
        && status === "active",
    );
    return { allowed, planSlug };
}

function featureStrings(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value.map((item) => String(item || "").trim()).filter(Boolean);
}

export function mergePlanFeatureStrings(existing: unknown, canonical: string[]) {
    const current = featureStrings(existing);
    const seen = new Set(current.map((item) => item.toLowerCase()));
    const extra = canonical.filter((item) => !seen.has(item.toLowerCase()));
    return [...current, ...extra];
}

export type DecoratedSubscriptionPlan = SubscriptionPlanRow & {
    client_plan_slug: ClientPlanSlug | null;
    podcast_entitlements: PodcastPlanEntitlements;
};

export function decorateSubscriptionPlan(plan: SubscriptionPlanRow): DecoratedSubscriptionPlan {
    const slug = clientSlugForPlanName(String(plan.name || ""), Number(plan.price_cents || 0));
    const support = slug ? CLIENT_PLAN_SUPPORT[slug] : null;
    return {
        ...plan,
        client_plan_slug: slug,
        features: support ? mergePlanFeatureStrings(plan.features, support.features) : featureStrings(plan.features),
        podcast_entitlements: support ? { ...support.entitlements } : { ...LISTENER_PUBLIC_ENTITLEMENTS },
    };
}

export function displayFeaturesForPlanRow(plan: {
    name?: string;
    audience?: string;
    price_cents?: number;
    features?: unknown;
}) {
    const slug = clientSlugForPlanName(String(plan.name || ""), Number(plan.price_cents || 0));
    const support = slug ? CLIENT_PLAN_SUPPORT[slug] : null;
    if (support) return mergePlanFeatureStrings(plan.features, support.features);
    return mergePlanFeatureStrings(plan.features, CLIENT_PLAN_SUPPORT["free-listener"].features);
}
