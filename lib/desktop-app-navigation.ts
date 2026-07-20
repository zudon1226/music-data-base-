/** DESKTOP ONLY — sidebar view keys and role-driven navigation routing. */

import type { Session } from "@supabase/supabase-js";
import {
    canAccessNavView,
    type NavCapabilityFlags,
    resolveNavCapabilities,
} from "@/lib/role-based-navigation";

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
    | "Notifications"
    | "Artist Dashboard"
    | "Artist Profile"
    | "Producer Dashboard"
    | "Producer Profile"
    | "My Ringtones"
    | "Ringtone Marketplace"
    | "My Purchased Ringtones"
    | "Favorite Ringtones"
    | "Platform Control Center";

export type DesktopNavAccessContext = {
    accountUserId: string;
    authSession: Session | null;
    isAuthenticated: boolean;
    isPlatformOwner: boolean;
    canCreateRingtones?: boolean;
    capabilities?: NavCapabilityFlags;
};

export type DesktopNavBlockReason =
    | "owner-required"
    | "ringtone-creator-required"
    | "artist-required"
    | "producer-required"
    | "creator-required"
    | "role-required";

export type DesktopNavItemDefinition = {
    view: DesktopNavView;
    requiresOwner?: boolean;
    requiresRingtoneCreator?: boolean;
    requiresArtistDashboard?: boolean;
    requiresProducerDashboard?: boolean;
    requiresCreator?: boolean;
};

export const DESKTOP_NAV_ITEMS: DesktopNavItemDefinition[] = [
    { view: "Home" },
    { view: "Marketplace" },
    { view: "Ringtone Marketplace" },
    { view: "My Purchased Ringtones" },
    { view: "Favorite Ringtones" },
    { view: "Library" },
    { view: "Liked" },
    { view: "Following" },
    { view: "Playlists" },
    { view: "Recently Played" },
    { view: "Queue" },
    { view: "Profile" },
    // Notifications is topbar-only (not a sidebar item) — opened via NotificationCenterPanel.
    { view: "Sales", requiresCreator: true },
    { view: "Artist Dashboard", requiresArtistDashboard: true },
    { view: "Producer Dashboard", requiresProducerDashboard: true },
    { view: "My Ringtones", requiresRingtoneCreator: true },
    { view: "Platform Control Center", requiresOwner: true },
];

export function resolveDesktopNavCapabilities(context: DesktopNavAccessContext): NavCapabilityFlags {
    if (context.capabilities) return context.capabilities;
    return resolveNavCapabilities({
        isPlatformOwner: context.isPlatformOwner,
        canCreateRingtones: context.canCreateRingtones,
    });
}

/**
 * Sidebar navigation routes to the target view when the role allows it.
 * Platform Control Center is owner-gated; creator pages are role-gated.
 */
export function evaluateDesktopNavAccess(
    nextView: DesktopNavView,
    context: DesktopNavAccessContext,
): { allowed: true } | { allowed: false; reason: DesktopNavBlockReason } {
    const capabilities = resolveDesktopNavCapabilities(context);
    const item = DESKTOP_NAV_ITEMS.find((entry) => entry.view === nextView);

    if (item?.requiresOwner && !capabilities.canPlatformControlCenter) {
        return { allowed: false, reason: "owner-required" };
    }
    if (item?.requiresArtistDashboard && !capabilities.canArtistDashboard) {
        return { allowed: false, reason: "artist-required" };
    }
    if (item?.requiresProducerDashboard && !capabilities.canProducerDashboard) {
        return { allowed: false, reason: "producer-required" };
    }
    if (item?.requiresCreator && !capabilities.canSales) {
        return { allowed: false, reason: "creator-required" };
    }
    if (item?.requiresRingtoneCreator && !capabilities.canMyRingtones) {
        return { allowed: false, reason: "ringtone-creator-required" };
    }
    if (!canAccessNavView(nextView, capabilities)) {
        return { allowed: false, reason: "role-required" };
    }
    return { allowed: true };
}

export function listVisibleDesktopNavItems(context: DesktopNavAccessContext) {
    const capabilities = resolveDesktopNavCapabilities(context);
    return DESKTOP_NAV_ITEMS.filter((item) => canAccessNavView(item.view, capabilities));
}

export function shouldShowUploadControl(context: DesktopNavAccessContext) {
    return resolveDesktopNavCapabilities(context).canUpload;
}

export function shouldShowArtistDashboardControl(context: DesktopNavAccessContext) {
    return resolveDesktopNavCapabilities(context).canArtistDashboard;
}

export function shouldShowProducerDashboardControl(context: DesktopNavAccessContext) {
    return resolveDesktopNavCapabilities(context).canProducerDashboard;
}

/** @deprecated Prefer role capabilities via resolveDesktopNavCapabilities. */
export function hasDesktopAccountAccess(_context: DesktopNavAccessContext) {
    return true;
}

export type DesktopNavHandlerOptions = {
    access: DesktopNavAccessContext;
    navigate: (nextView: DesktopNavView) => void;
    onOwnerRequired: () => void;
    onRingtoneCreatorRequired?: () => void;
    onRoleRequired?: (reason: DesktopNavBlockReason) => void;
};

/** Shared sidebar click router — every button calls this, then setView. */
export function createDesktopNavHandler(options: DesktopNavHandlerOptions) {
    const {
        access,
        navigate,
        onOwnerRequired,
        onRingtoneCreatorRequired,
        onRoleRequired,
    } = options;
    return function handleDesktopNav(nextView: DesktopNavView) {
        const decision = evaluateDesktopNavAccess(nextView, access);
        if (!decision.allowed) {
            if (decision.reason === "ringtone-creator-required") {
                (onRingtoneCreatorRequired || onOwnerRequired)();
                return;
            }
            if (decision.reason === "owner-required") {
                onOwnerRequired();
                return;
            }
            if (onRoleRequired) {
                onRoleRequired(decision.reason);
                return;
            }
            onOwnerRequired();
            return;
        }
        navigate(nextView);
    };
}
