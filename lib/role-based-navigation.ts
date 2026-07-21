/**
 * Role-driven navigation visibility for the SPA shell.
 * Server-side authorization remains authoritative for mutating APIs.
 * Creator access comes only from explicit account roles — never from profile-table existence.
 */

import {
    normalizeResolvedAccountRole,
    resolveCapabilitiesFromExplicitRoles,
    type ResolvedAccountCapabilities,
} from "@/lib/resolved-account-role";

export type NavAccountRole = "listener" | "artist" | "producer" | "admin";

export type NavCapabilityFlags = {
    isPlatformOwner: boolean;
    isAdmin: boolean;
    isArtist: boolean;
    isProducer: boolean;
    isListenerOnly: boolean;
    canUpload: boolean;
    canArtistDashboard: boolean;
    canProducerDashboard: boolean;
    canPlatformControlCenter: boolean;
    canSales: boolean;
    canMyRingtones: boolean;
};

export type ResolveNavCapabilitiesInput = {
    isPlatformOwner?: boolean;
    isAdmin?: boolean;
    accountRoles?: Iterable<string>;
    primaryRole?: string | null;
    /** @deprecated Ignored — use explicit accountRoles / primaryRole only. */
    foundingRole?: string | null;
    /** @deprecated Ignored for upload/dashboard gates. */
    canCreateRingtones?: boolean;
    /** @deprecated Ignored — profile rows must not grant creator nav. */
    hasArtistProfile?: boolean;
    /** @deprecated Ignored — profile rows must not grant creator nav. */
    hasProducerProfile?: boolean;
    /** When false, force listener-only chrome until server roles arrive. */
    rolesReady?: boolean;
};

export function normalizeNavRole(value: unknown): NavAccountRole {
    return normalizeResolvedAccountRole(value);
}

export function collectNavRoles(input: ResolveNavCapabilitiesInput): Set<string> {
    const roles = new Set<string>();
    for (const role of input.accountRoles || []) {
        const clean = String(role || "").trim().toLowerCase();
        if (clean) roles.add(clean);
    }
    const primary = normalizeNavRole(input.primaryRole);
    if (primary !== "listener") roles.add(primary);
    if (input.isPlatformOwner || input.isAdmin) roles.add("admin");
    return roles;
}

function toNavFlags(
    resolved: ResolvedAccountCapabilities,
    isPlatformOwner: boolean,
): NavCapabilityFlags {
    return {
        isPlatformOwner,
        isAdmin: resolved.isAdmin,
        isArtist: resolved.isArtist,
        isProducer: resolved.isProducer,
        isListenerOnly: resolved.isListenerOnly,
        canUpload: resolved.canUpload,
        canArtistDashboard: resolved.canArtistDashboard,
        canProducerDashboard: resolved.canProducerDashboard,
        canPlatformControlCenter: isPlatformOwner,
        canSales: resolved.canSales,
        canMyRingtones: resolved.canMyRingtones,
    };
}

const CREATOR_ROLE_TOKENS = new Set([
    "artist",
    "producer",
    "admin",
    "creator",
    "founding_artist",
    "founding_producer",
    "artist_pro",
    "producer_pro",
]);

/**
 * When the authoritative primary role is Listener, drop stale creator/founding
 * role tokens that may linger in client caches or invite leftovers.
 */
export function sanitizeNavRolesForPrimary(
    primaryRole: unknown,
    accountRoles: Iterable<string>,
    options: { isPlatformOwner?: boolean; isAdmin?: boolean } = {},
): string[] {
    const primary = normalizeNavRole(primaryRole);
    const roles = [...accountRoles]
        .map((role) => String(role || "").trim().toLowerCase())
        .filter(Boolean);
    if (options.isPlatformOwner || options.isAdmin || primary === "admin") {
        return roles;
    }
    if (primary === "listener") {
        return roles.filter((role) => !CREATOR_ROLE_TOKENS.has(role) && normalizeNavRole(role) === "listener");
    }
    return roles;
}

export function resolveNavCapabilities(input: ResolveNavCapabilitiesInput): NavCapabilityFlags {
    const isPlatformOwner = Boolean(input.isPlatformOwner);
    if (!isPlatformOwner && input.rolesReady === false) {
        return {
            isPlatformOwner: false,
            isAdmin: false,
            isArtist: false,
            isProducer: false,
            isListenerOnly: true,
            canUpload: false,
            canArtistDashboard: false,
            canProducerDashboard: false,
            canPlatformControlCenter: false,
            canSales: false,
            canMyRingtones: false,
        };
    }

    const primaryRole = input.primaryRole || "listener";
    const sanitizedRoles = sanitizeNavRolesForPrimary(
        primaryRole,
        collectNavRoles(input),
        { isPlatformOwner, isAdmin: input.isAdmin },
    );
    const resolved = resolveCapabilitiesFromExplicitRoles({
        isPlatformOwner,
        isAdmin: input.isAdmin,
        primaryRole,
        accountRoles: sanitizedRoles,
    });
    return toNavFlags(resolved, isPlatformOwner);
}

/**
 * Consumer destinations shown in Listener navigation.
 * Favorite Ringtones stays a separate ringtone destination.
 */
export const LISTENER_NAV_VIEWS = [
    "Home",
    "Marketplace",
    "Ringtone Marketplace",
    "My Purchased Ringtones",
    "Favorite Ringtones",
    "Library",
    "Liked",
    "Following",
    "Playlists",
    "Recently Played",
    "Queue",
    "Profile",
] as const;

/**
 * Extra consumer destinations still reachable via topbar / Home tabs / deep links
 * without appearing in the Listener sidebar.
 * Notifications page is opened from the topbar dropdown "View all" control.
 */
export const LISTENER_ACCESSIBLE_VIEWS = [
    ...LISTENER_NAV_VIEWS,
    "Notifications",
    "License History",
    "Trending",
    "Beats",
    "Artists",
    "Videos",
] as const;

export function canAccessNavView(view: string, capabilities: NavCapabilityFlags): boolean {
    if (capabilities.canPlatformControlCenter) return true;
    if (view === "Platform Control Center") return capabilities.canPlatformControlCenter;
    if (view === "Artist Dashboard" || view === "Artist Profile") return capabilities.canArtistDashboard;
    if (view === "Producer Dashboard" || view === "Producer Profile") return capabilities.canProducerDashboard;
    if (view === "Sales") return capabilities.canSales;
    if (view === "My Ringtones") return capabilities.canMyRingtones;
    if ((LISTENER_ACCESSIBLE_VIEWS as readonly string[]).includes(view)) return true;
    return false;
}
