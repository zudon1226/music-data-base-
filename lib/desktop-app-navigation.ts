/** DESKTOP ONLY — sidebar view keys, access rules, and navigation handler. */

import type { Session } from "@supabase/supabase-js";
import {
    hasDesktopProtectedActionAccess,
    type DesktopProtectedActionAuthSources,
} from "./desktop-protected-action-auth-guard";

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
    | "Platform Stability";

export type DesktopNavAccessContext = {
    accountUserId: string;
    authSession: Session | null;
    isPlatformOwner: boolean;
    getAuthSources?: () => DesktopProtectedActionAuthSources;
};

export type DesktopNavBlockReason = "login-required" | "owner-required";

export type DesktopNavItemDefinition = {
    view: DesktopNavView;
    requiresAuth: boolean;
    requiresOwner: boolean;
};

export const DESKTOP_NAV_ITEMS: DesktopNavItemDefinition[] = [
    { view: "Home", requiresAuth: false, requiresOwner: false },
    { view: "Marketplace", requiresAuth: false, requiresOwner: false },
    { view: "Sales", requiresAuth: true, requiresOwner: false },
    { view: "License History", requiresAuth: true, requiresOwner: false },
    { view: "Trending", requiresAuth: false, requiresOwner: false },
    { view: "Beats", requiresAuth: false, requiresOwner: false },
    { view: "Artists", requiresAuth: false, requiresOwner: false },
    { view: "Videos", requiresAuth: true, requiresOwner: false },
    { view: "Library", requiresAuth: true, requiresOwner: false },
    { view: "Liked", requiresAuth: true, requiresOwner: false },
    { view: "Following", requiresAuth: true, requiresOwner: false },
    { view: "Playlists", requiresAuth: true, requiresOwner: false },
    { view: "Artist Dashboard", requiresAuth: true, requiresOwner: false },
    { view: "Producer Dashboard", requiresAuth: true, requiresOwner: false },
    { view: "Platform Stability", requiresAuth: true, requiresOwner: true },
    { view: "Recently Played", requiresAuth: true, requiresOwner: false },
    { view: "Queue", requiresAuth: true, requiresOwner: false },
    { view: "Profile", requiresAuth: true, requiresOwner: false },
];

export function hasDesktopAccountAccess(context: DesktopNavAccessContext) {
    if (context.getAuthSources) {
        return hasDesktopProtectedActionAccess(context.getAuthSources());
    }
    return hasDesktopProtectedActionAccess({
        readAuthSession: () => context.authSession,
        readAccountUserId: () => context.accountUserId,
        readUser: () => null,
        readActiveUser: () => null,
    });
}

export function evaluateDesktopNavAccess(
    nextView: DesktopNavView,
    context: DesktopNavAccessContext,
): { allowed: true } | { allowed: false; reason: DesktopNavBlockReason } {
    const item = DESKTOP_NAV_ITEMS.find((entry) => entry.view === nextView);
    if (!item) {
        return { allowed: true };
    }
    if (item.requiresOwner && !context.isPlatformOwner) {
        return { allowed: false, reason: "owner-required" };
    }
    if (item.requiresAuth && !hasDesktopAccountAccess(context)) {
        return { allowed: false, reason: "login-required" };
    }
    return { allowed: true };
}

export function listVisibleDesktopNavItems(context: DesktopNavAccessContext) {
    return DESKTOP_NAV_ITEMS.filter((item) => !item.requiresOwner || context.isPlatformOwner);
}

export type DesktopNavHandlerOptions = {
    access: DesktopNavAccessContext;
    navigate: (nextView: DesktopNavView) => void;
    onLoginRequired: () => void;
    onOwnerRequired: () => void;
};

export function createDesktopNavHandler(options: DesktopNavHandlerOptions) {
    const { access, navigate, onLoginRequired, onOwnerRequired } = options;
    return function handleDesktopNav(nextView: DesktopNavView) {
        const decision = evaluateDesktopNavAccess(nextView, access);
        if (!decision.allowed) {
            if (decision.reason === "login-required") {
                onLoginRequired();
            }
            else {
                onOwnerRequired();
            }
            return;
        }
        navigate(nextView);
    };
}
