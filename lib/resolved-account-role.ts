/**
 * Authoritative account-role resolution for navigation and upload gates.
 * Uses only server-backed profiles.account_type + active user_roles (+ owner/admin).
 * Does NOT infer creator access from artist_profiles / producer_profiles existence.
 */

import { getSupabaseServerClient, isPlatformOwnerEmail, isUuid } from "@/lib/server-supabase";

export type ResolvedAccountRole = "listener" | "artist" | "producer" | "admin";

export type ResolvedAccountCapabilities = {
    primaryRole: ResolvedAccountRole;
    roles: string[];
    isAdmin: boolean;
    isArtist: boolean;
    isProducer: boolean;
    isListenerOnly: boolean;
    canUpload: boolean;
    canArtistDashboard: boolean;
    canProducerDashboard: boolean;
    canSales: boolean;
    canMyRingtones: boolean;
};

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

export function normalizeResolvedAccountRole(value: unknown): ResolvedAccountRole {
    const normalized = String(value || "").trim().toLowerCase();
    if (normalized === "admin") return "admin";
    if (
        normalized === "artist"
        || normalized === "founding_artist"
        || normalized === "artist_pro"
        || normalized === "creator"
    ) {
        return "artist";
    }
    if (
        normalized === "producer"
        || normalized === "founding_producer"
        || normalized === "producer_pro"
    ) {
        return "producer";
    }
    return "listener";
}

export function collectExplicitAccountRoles(input: {
    primaryRole?: unknown;
    accountRoles?: Iterable<string> | null;
    isAdmin?: boolean;
}): Set<string> {
    const roles = new Set<string>();
    for (const role of input.accountRoles || []) {
        const clean = String(role || "").trim().toLowerCase();
        if (clean) roles.add(clean);
    }
    const primary = normalizeResolvedAccountRole(input.primaryRole);
    if (primary !== "listener") roles.add(primary);
    if (input.isAdmin) roles.add("admin");
    return roles;
}

export function resolveCapabilitiesFromExplicitRoles(input: {
    isPlatformOwner?: boolean;
    isAdmin?: boolean;
    primaryRole?: unknown;
    accountRoles?: Iterable<string> | null;
}): ResolvedAccountCapabilities {
    const isPlatformOwner = Boolean(input.isPlatformOwner);
    const roles = collectExplicitAccountRoles({
        primaryRole: input.primaryRole,
        accountRoles: input.accountRoles,
        isAdmin: input.isAdmin || isPlatformOwner,
    });
    const isAdmin = isPlatformOwner || Boolean(input.isAdmin) || roles.has("admin");
    const isArtist = isAdmin
        || roles.has("artist")
        || roles.has("founding_artist")
        || roles.has("artist_pro")
        || roles.has("creator");
    const isProducer = isAdmin
        || roles.has("producer")
        || roles.has("founding_producer")
        || roles.has("producer_pro");
    const isCreator = isArtist || isProducer || [...roles].some((role) => CREATOR_ROLE_TOKENS.has(role));

    if (isPlatformOwner || isAdmin) {
        return {
            primaryRole: "admin",
            roles: [...roles],
            isAdmin: true,
            isArtist: true,
            isProducer: true,
            isListenerOnly: false,
            canUpload: true,
            canArtistDashboard: true,
            canProducerDashboard: true,
            canSales: true,
            canMyRingtones: true,
        };
    }

    const primaryRole = isArtist && isProducer
        ? normalizeResolvedAccountRole(input.primaryRole) === "producer"
            ? "producer"
            : "artist"
        : isArtist
            ? "artist"
            : isProducer
                ? "producer"
                : "listener";

    return {
        primaryRole,
        roles: [...roles],
        isAdmin: false,
        isArtist,
        isProducer,
        isListenerOnly: !isCreator,
        canUpload: isCreator,
        canArtistDashboard: isArtist,
        canProducerDashboard: isProducer,
        canSales: isCreator,
        canMyRingtones: isCreator,
    };
}

export async function loadResolvedAccountCapabilities(userId: string, email = ""): Promise<ResolvedAccountCapabilities> {
    if (!userId || !isUuid(userId)) {
        return resolveCapabilitiesFromExplicitRoles({ primaryRole: "listener" });
    }

    const isPlatformOwner = isPlatformOwnerEmail(email);
    const supabase = getSupabaseServerClient();
    const { data: profileData } = await supabase
        .from("profiles")
        .select("account_type,is_admin")
        .or(`id.eq.${userId},user_id.eq.${userId}`)
        .maybeSingle();
    const profileRow = (profileData || {}) as { account_type?: string; is_admin?: boolean };
    const primaryRole = normalizeResolvedAccountRole(profileRow.account_type);
    const isAdmin = profileRow.is_admin === true;
    const roleSet = new Set<string>();
    if (primaryRole !== "listener") roleSet.add(primaryRole);
    if (isAdmin) roleSet.add("admin");

    try {
        const rolesResult = await supabase
            .from("user_roles")
            .select("role")
            .eq("user_id", userId)
            .eq("status", "active");
        for (const row of rolesResult.data || []) {
            const clean = String((row as { role?: string }).role || "").trim().toLowerCase();
            if (!clean) continue;
            const normalized = normalizeResolvedAccountRole(clean);
            // profiles.account_type is authoritative. A Listener profile must not inherit
            // Artist/Producer chrome from stale founding_* / invite user_roles rows.
            if (
                primaryRole === "listener"
                && !isAdmin
                && !isPlatformOwner
                && (normalized === "artist" || normalized === "producer" || normalized === "admin")
            ) {
                continue;
            }
            roleSet.add(clean);
        }
    } catch {
        // user_roles may be unavailable
    }

    return resolveCapabilitiesFromExplicitRoles({
        isPlatformOwner,
        isAdmin: isAdmin || roleSet.has("admin"),
        primaryRole: profileRow.account_type || primaryRole,
        accountRoles: roleSet,
    });
}

export async function requireCreatorUploadAccess(userId: string, email = "") {
    const capabilities = await loadResolvedAccountCapabilities(userId, email);
    if (!capabilities.canUpload) {
        return {
            ok: false as const,
            status: 403,
            error: "Upload is available for Artist and Producer accounts only.",
            capabilities,
        };
    }
    return { ok: true as const, capabilities };
}
