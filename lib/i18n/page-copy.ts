import type { DesktopNavView } from "../desktop-app-navigation";
import type { TranslationKey } from "./messages/en";
import { DESKTOP_NAV_TRANSLATION_KEYS, VIEW_TITLE_KEYS } from "./nav-keys";

const HOME_TAB_KEYS: Record<string, TranslationKey> = {
    Trending: "home.tabs.trending",
    "New Releases": "home.tabs.newReleases",
    Beats: "home.tabs.beats",
    Artists: "home.tabs.artists",
    Producers: "home.tabs.producers",
    "Hip Hop": "home.tabs.hipHop",
    "R&B": "home.tabs.rnb",
    Trap: "home.tabs.trap",
    Dancehall: "home.tabs.dancehall",
    Afrobeat: "home.tabs.afrobeat",
};

const VIEW_SUBTITLE_KEYS: Partial<Record<DesktopNavView, TranslationKey>> = {
    Marketplace: "marketplace.pageSubtitle",
    "Ringtone Marketplace": "ringtones.marketplaceSubtitle",
    "My Purchased Ringtones": "ringtones.purchasedSubtitle",
    "Favorite Ringtones": "ringtones.favoritesSubtitle",
    Notifications: "notifications.pageSubtitle",
    Sales: "sales.pageSubtitle",
    "License History": "licenseHistory.pageSubtitle",
    "Artist Profile": "artistProfile.pageSubtitle",
    "Producer Profile": "producerProfile.pageSubtitle",
    Profile: "profile.pageSubtitle",
    "Artist Dashboard": "artistDashboard.pageSubtitle",
    "Producer Dashboard": "producerDashboard.pageSubtitle",
    "My Ringtones": "ringtones.pageSubtitle",
    "Platform Control Center": "platformControlCenter.pageSubtitle",
    Artists: "artists.pageSubtitle",
    Videos: "video.pageSubtitle",
    Library: "library.pageSubtitle",
    Following: "following.pageSubtitle",
    "Recently Played": "recentlyPlayed.pageSubtitle",
    Queue: "queue.pageSubtitle",
    Liked: "favorites.pageSubtitle",
    Playlists: "playlists.pageSubtitle",
    Trending: "trending.pageSubtitle",
    Beats: "beats.pageSubtitle",
};

type TranslateFn = (key: TranslationKey, values?: Record<string, string | number>) => string;

type PageCopyOptions = {
    activeTab?: string;
    activeArtistName?: string;
    activeProducerName?: string;
    isSearch?: boolean;
    isVideoSearch?: boolean;
};

export function translatePageTitle(view: string, t: TranslateFn, options: PageCopyOptions = {}) {
    if (options.isSearch) {
        return options.isVideoSearch ? t("search.videoSearchTitle") : t("search.resultsTitle");
    }
    if (view === "Marketplace") return t("marketplace.fullTitle");
    if (view === "Artist Profile") return options.activeArtistName || t("nav.artistProfile");
    if (view === "Producer Profile") return options.activeProducerName || t("nav.producerProfile");
    if (view === "Home" && options.activeTab) {
        return t(HOME_TAB_KEYS[options.activeTab] || "home.title");
    }
    const navKey = DESKTOP_NAV_TRANSLATION_KEYS[view as DesktopNavView];
    if (navKey) return t(navKey);
    const titleKey = VIEW_TITLE_KEYS[view as DesktopNavView];
    if (titleKey) return t(titleKey);
    return view;
}

export function translatePageSubtitle(view: string, t: TranslateFn, options: PageCopyOptions = {}) {
    if (options.isSearch) return t("search.resultsSubtitle");
    const subtitleKey = VIEW_SUBTITLE_KEYS[view as DesktopNavView];
    if (subtitleKey) return t(subtitleKey);
    return t("home.defaultSubtitle");
}

export function translateHomeTab(tab: string, t: TranslateFn) {
    return t(HOME_TAB_KEYS[tab] || "home.title");
}
