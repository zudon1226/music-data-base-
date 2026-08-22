"use client";

import {
    BarChart3,
    BookOpen,
    Clock3,
    Disc3,
    Heart,
    Home,
    ListMusic,
    Mic2,
    Smartphone,
    Star,
    Upload,
    UserCircle,
    UserPlus,
} from "lucide-react";
import { useEffect, useMemo, useRef, type ReactNode } from "react";
import {
    createDesktopNavHandler,
    listVisibleMobileNavItems,
    mobileNavShortLabel,
    type DesktopNavAccessContext,
    type DesktopNavBlockReason,
    type DesktopNavView,
} from "../lib/desktop-app-navigation";
import { DESKTOP_NAV_TRANSLATION_KEYS } from "../lib/i18n/nav-keys";
import { useTranslation } from "../lib/i18n/provider";

const MOBILE_NAV_ICONS: Partial<Record<DesktopNavView, ReactNode>> = {
    Home: <Home size={16} aria-hidden="true" />,
    Marketplace: <Disc3 size={16} aria-hidden="true" />,
    Podcasts: <Mic2 size={16} aria-hidden="true" />,
    Sales: <Upload size={16} aria-hidden="true" />,
    Library: <BookOpen size={16} aria-hidden="true" />,
    Liked: <Heart size={16} aria-hidden="true" />,
    Following: <UserPlus size={16} aria-hidden="true" />,
    Playlists: <ListMusic size={16} aria-hidden="true" />,
    "Artist Dashboard": <BarChart3 size={16} aria-hidden="true" />,
    "Producer Dashboard": <Disc3 size={16} aria-hidden="true" />,
    "Podcast Studio": <Mic2 size={16} aria-hidden="true" />,
    "My Ringtones": <Smartphone size={16} aria-hidden="true" />,
    "Ringtone Marketplace": <Smartphone size={16} aria-hidden="true" />,
    "My Purchased Ringtones": <Smartphone size={16} aria-hidden="true" />,
    "Favorite Ringtones": <Star size={16} aria-hidden="true" />,
    "Platform Control Center": <BarChart3 size={16} aria-hidden="true" />,
    "Recently Played": <Clock3 size={16} aria-hidden="true" />,
    Queue: <ListMusic size={16} aria-hidden="true" />,
    Profile: <UserCircle size={16} aria-hidden="true" />,
};

type MobileAppHorizontalNavProps = {
    activeView: DesktopNavView;
    access: DesktopNavAccessContext;
    onNavigate: (nextView: DesktopNavView) => void;
    onOwnerRequired: () => void;
    onRingtoneCreatorRequired?: () => void;
    onRoleRequired?: (reason: DesktopNavBlockReason) => void;
};

export function MobileAppHorizontalNav({
    activeView,
    access,
    onNavigate,
    onOwnerRequired,
    onRingtoneCreatorRequired,
    onRoleRequired,
}: MobileAppHorizontalNavProps) {
    const { t } = useTranslation();
    const scrollerRef = useRef<HTMLDivElement | null>(null);
    const activeRef = useRef<HTMLButtonElement | null>(null);

    const items = useMemo(() => {
        return listVisibleMobileNavItems(access).map((item) => {
            const fullLabel = item.view === "Podcasts" || item.view === "Podcast Studio"
                ? item.view
                : t(DESKTOP_NAV_TRANSLATION_KEYS[item.view]);
            return {
                view: item.view,
                label: mobileNavShortLabel(item.view, fullLabel),
                fullLabel,
            };
        });
    }, [access, t]);

    const handleNavClick = useMemo(
        () => createDesktopNavHandler({
            access,
            navigate: onNavigate,
            onOwnerRequired,
            onRingtoneCreatorRequired,
            onRoleRequired,
        }),
        [access, onNavigate, onOwnerRequired, onRingtoneCreatorRequired, onRoleRequired],
    );

    useEffect(() => {
        const node = activeRef.current;
        if (!node) return;
        node.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
    }, [activeView, items.length]);

    return (
        <nav
            className="mobile-horizontal-nav"
            aria-label="Primary navigation"
            data-mobile-horizontal-nav="true"
        >
            <div
                className="mobile-horizontal-nav-scroller"
                ref={scrollerRef}
                role="list"
            >
                {items.map((item) => {
                    const active = item.view === activeView;
                    return (
                        <button
                            key={item.view}
                            ref={active ? activeRef : undefined}
                            className={active ? "mobile-nav-pill is-active" : "mobile-nav-pill"}
                            data-nav-view={item.view}
                            data-active={active ? "true" : "false"}
                            onClick={() => handleNavClick(item.view)}
                            role="listitem"
                            title={item.fullLabel}
                            type="button"
                            aria-current={active ? "page" : undefined}
                        >
                            {MOBILE_NAV_ICONS[item.view] || <Disc3 size={16} aria-hidden="true" />}
                            <span>{item.label}</span>
                        </button>
                    );
                })}
            </div>
        </nav>
    );
}
