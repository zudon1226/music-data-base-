"use client";

import {
    BarChart3,
    BookOpen,
    Clock3,
    Disc3,
    Film,
    Heart,
    Home,
    ListMusic,
    Music2,
    Upload,
    UserCircle,
    UserPlus,
    Zap,
} from "lucide-react";
import { useMemo, type ReactNode } from "react";
import {
    createDesktopNavHandler,
    listVisibleDesktopNavItems,
    type DesktopNavAccessContext,
    type DesktopNavView,
} from "../lib/desktop-app-navigation";
import { DESKTOP_SIDEBAR_LAYOUT_CSS } from "../lib/desktop-sidebar-layout";
import { DESKTOP_NAV_TRANSLATION_KEYS } from "../lib/i18n/nav-keys";
import { useTranslation } from "../lib/i18n/provider";

const DESKTOP_NAV_ICONS: Record<DesktopNavView, ReactNode> = {
    Home: <Home size={17}/>,
    Marketplace: <Disc3 size={17}/>,
    Sales: <Upload size={17}/>,
    "License History": <BookOpen size={17}/>,
    Trending: <Zap size={17}/>,
    Beats: <Music2 size={17}/>,
    Artists: <Music2 size={17}/>,
    Videos: <Film size={17}/>,
    Library: <BookOpen size={17}/>,
    Liked: <Heart size={17}/>,
    Following: <UserPlus size={17}/>,
    Playlists: <ListMusic size={17}/>,
    "Artist Dashboard": <BarChart3 size={17}/>,
    "Producer Dashboard": <Disc3 size={17}/>,
    "Platform Control Center": <BarChart3 size={17}/>,
    "Recently Played": <Clock3 size={17}/>,
    Queue: <ListMusic size={17}/>,
    Profile: <UserCircle size={17}/>,
    "Artist Profile": <UserCircle size={17}/>,
    "Producer Profile": <UserCircle size={17}/>,
};

type DesktopAppSidebarNavProps = {
    activeView: DesktopNavView;
    access: DesktopNavAccessContext;
    onNavigate: (nextView: DesktopNavView) => void;
    onOwnerRequired: () => void;
};

/** DESKTOP ONLY — sidebar buttons use the shared nav router and layout stack. */
export function DesktopAppSidebarNav({
    activeView,
    access,
    onNavigate,
    onOwnerRequired,
}: DesktopAppSidebarNavProps) {
    const { t } = useTranslation();
    const visibleItems = listVisibleDesktopNavItems(access);
    const handleNavClick = useMemo(
        () => createDesktopNavHandler({
            access,
            navigate: onNavigate,
            onOwnerRequired,
        }),
        [access, onNavigate, onOwnerRequired],
    );

    return (
        <>
            <style jsx global>{DESKTOP_SIDEBAR_LAYOUT_CSS}</style>
            <nav className="nav desktop-sidebar-nav" aria-label={t("nav.mainNavigation")}>
                {visibleItems.map((item) => {
                    const label = t(DESKTOP_NAV_TRANSLATION_KEYS[item.view]);
                    return (
                    <button
                        key={item.view}
                        type="button"
                        className={activeView === item.view ? "active" : ""}
                        aria-current={activeView === item.view ? "page" : undefined}
                        title={label}
                        onClick={() => handleNavClick(item.view)}
                    >
                        {DESKTOP_NAV_ICONS[item.view]}
                        <span>{label}</span>
                    </button>
                    );
                })}
            </nav>
        </>
    );
}
