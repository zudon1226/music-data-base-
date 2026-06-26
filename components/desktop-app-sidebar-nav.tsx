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
import type { ReactNode } from "react";
import {
    listVisibleDesktopNavItems,
    type DesktopNavAccessContext,
    type DesktopNavView,
} from "../lib/desktop-app-navigation";

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
    "Platform Stability": <BarChart3 size={17}/>,
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
};

/** DESKTOP ONLY — sidebar navigation buttons with explicit view keys. */
export function DesktopAppSidebarNav({
    activeView,
    access,
    onNavigate,
}: DesktopAppSidebarNavProps) {
    const visibleItems = listVisibleDesktopNavItems(access);

    return (
        <nav className="nav desktop-sidebar-nav" aria-label="Main">
            {visibleItems.map((item) => (
                <button
                    key={item.view}
                    type="button"
                    className={activeView === item.view ? "active" : ""}
                    aria-current={activeView === item.view ? "page" : undefined}
                    title={item.view}
                    onClick={() => onNavigate(item.view)}
                >
                    {DESKTOP_NAV_ICONS[item.view]}
                    <span>{item.view}</span>
                </button>
            ))}
        </nav>
    );
}
