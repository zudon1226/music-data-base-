/** DESKTOP ONLY — sidebar view keys and navigation routing (no auth gating on clicks). */

import type { Session } from "@supabase/supabase-js";

export type DesktopNavView =
    | "Home"
    | "Marketplace"
    | "Sales"
    | "License History"
    | "Trending"
    | "Beats"
    | "Artists"
    | "Videos"
    | "Library"
    | "Liked"
    | "Following"
    | "Recently Played"
    | "Queue"
    | "Playlists"
    | "Profile"
    | "Artist Dashboard"
    | "Artist Profile"
    | "Producer Dashboard"
    | "Producer Profile"
    | "Platform Control Center";

/** Sidebar routing context — owner flag only; do not gate navigation on auth here. */
export type DesktopNavAccessContext = {
    accountUserId: string;
    authSession: Session | null;
    isAuthenticated: boolean;
    isPlatformOwner: boolean;
};

export type DesktopNavBlockReason = "owner-required";

export type DesktopNavItemDefinition = {
    view: DesktopNavView;
    requiresOwner: boolean;
};

export const DESKTOP_NAV_ITEMS: DesktopNavItemDefinition[] = [
    { view: "Home", requiresOwner: false },
    { view: "Marketplace", requiresOwner: false },
    { view: "Sales", requiresOwner: false },
    { view: "License History", requiresOwner: false },
    { view: "Trending", requiresOwner: false },
    { view: "Beats", requiresOwner: false },
    { view: "Artists", requiresOwner: false },
    { view: "Videos", requiresOwner: false },
    { view: "Library", requiresOwner: false },
    { view: "Liked", requiresOwner: false },
    { view: "Following", requiresOwner: false },
    { view: "Playlists", requiresOwner: false },
    { view: "Artist Dashboard", requiresOwner: false },
    { view: "Producer Dashboard", requiresOwner: false },
    { view: "Platform Control Center", requiresOwner: true },
    { view: "Recently Played", requiresOwner: false },
    { view: "Queue", requiresOwner: false },
    { view: "Profile", requiresOwner: false },
];

/**
 * Sidebar navigation must always route to the target view.
 * Only Platform Control Center is owner-gated.
 */
export function evaluateDesktopNavAccess(
    nextView: DesktopNavView,
    context: DesktopNavAccessContext,
): { allowed: true } | { allowed: false; reason: DesktopNavBlockReason } {
    const item = DESKTOP_NAV_ITEMS.find((entry) => entry.view === nextView);
    if (item?.requiresOwner && !context.isPlatformOwner) {
        return { allowed: false, reason: "owner-required" };
    }
    return { allowed: true };
}

export function listVisibleDesktopNavItems(context: DesktopNavAccessContext) {
    return DESKTOP_NAV_ITEMS.filter((item) => !item.requiresOwner || context.isPlatformOwner);
}

/** @deprecated Sidebar navigation no longer gates on auth at click time. */
export function hasDesktopAccountAccess(_context: DesktopNavAccessContext) {
    return true;
}

export type DesktopNavHandlerOptions = {
    access: DesktopNavAccessContext;
    navigate: (nextView: DesktopNavView) => void;
    onOwnerRequired: () => void;
};

/** Shared sidebar click router — every button calls this, then setView. */
export function createDesktopNavHandler(options: DesktopNavHandlerOptions) {
    const { access, navigate, onOwnerRequired } = options;
    return function handleDesktopNav(nextView: DesktopNavView) {
        const decision = evaluateDesktopNavAccess(nextView, access);
        if (!decision.allowed) {
            onOwnerRequired();
            return;
        }
        navigate(nextView);
    };
}
