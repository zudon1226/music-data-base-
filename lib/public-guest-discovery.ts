import { parseMixtapePath } from "@/lib/mixtape-routes";
import {
    isAnonymousPublicMixtapeListenerPath,
    isPublicMixtapeDiscoveryPath,
} from "@/lib/public-mixtape-listener";
import {
    isAnonymousPublicPodcastListenerPath,
    isPublicPodcastDiscoveryPath,
    normalizeAppPathname,
} from "@/lib/public-podcast-listener";

export const GUEST_PUBLIC_DISCOVERY_PATHS = {
    home: "/",
    music: "/music",
    videos: "/videos",
    ringtones: "/ringtones",
    mixtapes: "/mixtapes",
    podcasts: "/podcast",
} as const;

export type GuestPublicDiscoverySection = keyof typeof GUEST_PUBLIC_DISCOVERY_PATHS;

export const GUEST_PUBLIC_DISCOVERY_SECTION_ORDER: GuestPublicDiscoverySection[] = [
    "home",
    "music",
    "videos",
    "ringtones",
    "mixtapes",
    "podcasts",
];

export function isPublicMusicDiscoveryPath(pathname: string) {
    return normalizeAppPathname(pathname) === GUEST_PUBLIC_DISCOVERY_PATHS.music;
}

export function isPublicVideosDiscoveryPath(pathname: string) {
    return normalizeAppPathname(pathname) === GUEST_PUBLIC_DISCOVERY_PATHS.videos;
}

export function isPublicRingtonesDiscoveryPath(pathname: string) {
    return normalizeAppPathname(pathname) === GUEST_PUBLIC_DISCOVERY_PATHS.ringtones;
}

/** Signed-out visitors may browse public discovery shells and podcast/mixtape deep links. */
export function isAnonymousPublicGuestDiscoveryPath(pathname: string) {
    return (
        isAnonymousPublicPodcastListenerPath(pathname)
        || isAnonymousPublicMixtapeListenerPath(pathname)
        || isPublicMusicDiscoveryPath(pathname)
        || isPublicVideosDiscoveryPath(pathname)
        || isPublicRingtonesDiscoveryPath(pathname)
    );
}

export function resolveGuestPublicDiscoverySection(pathname: string): GuestPublicDiscoverySection {
    const clean = normalizeAppPathname(pathname);
    if (isPublicMusicDiscoveryPath(clean)) return "music";
    if (isPublicVideosDiscoveryPath(clean)) return "videos";
    if (isPublicRingtonesDiscoveryPath(clean)) return "ringtones";
    if (isPublicMixtapeDiscoveryPath(clean) || parseMixtapePath(clean)?.kind === "mixtape") return "mixtapes";
    if (isPublicPodcastDiscoveryPath(clean) || clean.startsWith("/podcast/")) return "podcasts";
    if (clean === GUEST_PUBLIC_DISCOVERY_PATHS.home) return "home";
    return "home";
}

export const ANONYMOUS_PUBLIC_MUSIC_LISTENER_VIEWS = ["Home"] as const;
export const ANONYMOUS_PUBLIC_VIDEOS_LISTENER_VIEWS = ["Videos"] as const;
export const ANONYMOUS_PUBLIC_RINGTONES_LISTENER_VIEWS = ["Ringtone Marketplace"] as const;

export function isAnonymousPublicMusicListenerPath(pathname: string) {
    return isPublicMusicDiscoveryPath(pathname);
}

export function isAnonymousPublicVideosListenerPath(pathname: string) {
    return isPublicVideosDiscoveryPath(pathname);
}

export function isAnonymousPublicRingtonesListenerPath(pathname: string) {
    return isPublicRingtonesDiscoveryPath(pathname);
}

export function isAnonymousPublicMusicListenerView(view: string) {
    return (ANONYMOUS_PUBLIC_MUSIC_LISTENER_VIEWS as readonly string[]).includes(view);
}

export function isAnonymousPublicVideosListenerView(view: string) {
    return (ANONYMOUS_PUBLIC_VIDEOS_LISTENER_VIEWS as readonly string[]).includes(view);
}

export function isAnonymousPublicRingtonesListenerView(view: string) {
    return (ANONYMOUS_PUBLIC_RINGTONES_LISTENER_VIEWS as readonly string[]).includes(view);
}