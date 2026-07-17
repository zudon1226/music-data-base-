/**
 * Role-driven navigation visibility for the SPA shell.
 * Server-side authorization remains authoritative for mutating APIs.
 */

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
    foundingRole?: string | null;
    canCreateRingtones?: boolean;
    hasArtistProfile?: boolean;
    hasProducerProfile?: boolean;
};

const CREATOR_ROLES = new Set(["artist", "producer", "admin", "creator", "founding_artist", "founding_producer"]);

export function normalizeNavRole(value: unknown): NavAccountRole {
    const normalized = String(value || "").trim().toLowerCase();
    if (normalized === "admin") return "admin";
    if (normalized === "artist" || normalized === "founding_artist") return "artist";
    if (normalized === "producer" || normalized === "founding_producer") return "producer";
    return "listener";
}

export function collectNavRoles(input: ResolveNavCapabilitiesInput): Set<string> {
    const roles = new Set<string>();
    for (const role of input.accountRoles || []) {
        const clean = String(role || "").trim().toLowerCase();
        if (clean) roles.add(clean);
    }
    const primary = normalizeNavRole(input.primaryRole);
    if (primary !== "listener") roles.add(primary);
    const founding = String(input.foundingRole || "").trim().toLowerCase();
    if (founding === "founding_artist" || founding === "artist") roles.add("artist");
    if (founding === "founding_producer" || founding === "producer") roles.add("producer");
    if (input.hasArtistProfile) roles.add("artist");
    if (input.hasProducerProfile) roles.add("producer");
    if (input.isPlatformOwner || input.isAdmin) roles.add("admin");
    return roles;
}

export function resolveNavCapabilities(input: ResolveNavCapabilitiesInput): NavCapabilityFlags {
    const roles = collectNavRoles(input);
    const isPlatformOwner = Boolean(input.isPlatformOwner);
    const isAdmin = isPlatformOwner || Boolean(input.isAdmin) || roles.has("admin");
    const isArtist = isAdmin || roles.has("artist") || roles.has("founding_artist") || Boolean(input.hasArtistProfile);
    const isProducer = isAdmin || roles.has("producer") || roles.has("founding_producer") || Boolean(input.hasProducerProfile);
    const isCreator = isArtist || isProducer || Boolean(input.canCreateRingtones)
        || [...roles].some((role) => CREATOR_ROLES.has(role));

    if (isPlatformOwner || isAdmin) {
        return {
            isPlatformOwner,
            isAdmin: true,
            isArtist: true,
            isProducer: true,
            isListenerOnly: false,
            canUpload: true,
            canArtistDashboard: true,
            canProducerDashboard: true,
            // PCC UI/API remain platform-owner gated server-side.
            canPlatformControlCenter: isPlatformOwner,
            canSales: true,
            canMyRingtones: true,
        };
    }

    return {
        isPlatformOwner: false,
        isAdmin: false,
        isArtist,
        isProducer,
        isListenerOnly: !isArtist && !isProducer,
        canUpload: isCreator,
        canArtistDashboard: isArtist,
        canProducerDashboard: isProducer,
        canPlatformControlCenter: false,
        canSales: isCreator,
        canMyRingtones: isCreator || Boolean(input.canCreateRingtones),
    };
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
    "Notifications",
] as const;

/**
 * Extra consumer destinations still reachable via Home tabs / deep links
 * without appearing in the Listener sidebar.
 */
export const LISTENER_ACCESSIBLE_VIEWS = [
    ...LISTENER_NAV_VIEWS,
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
