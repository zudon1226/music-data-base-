/**
 * Authoritative account-role resolution for navigation and upload gates.
 * Uses only server-backed profiles.account_type + active user_roles (+ owner/admin).
 * Does NOT infer creator access from artist_profiles / producer_profiles existence.
 */

import { loadFoundingMemberByUserId } from "@/lib/founding-access";
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
    /** Listener-only personal ringtones from Library (not marketplace seller tools). */
    canPersonalRingtones: boolean;
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
            canPersonalRingtones: true,
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
        canPersonalRingtones: !isCreator,
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
    if (!isPlatformOwner && !isAdmin) {
        const member = await loadFoundingMemberByUserId(supabase, userId);
        if (member?.approval_status !== "approved") {
            return resolveCapabilitiesFromExplicitRoles({ primaryRole: "listener" });
        }
    }
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

export const LISTENER_SELF_PROMOTE_BLOCKED_MESSAGE =
    "Listener accounts cannot change to Artist or Producer. Creator access requires explicit owner approval.";

export const ACCOUNT_TYPE_SELF_SERVICE_BLOCKED_MESSAGE =
    "Account type cannot be changed from Profile. Creator access requires explicit owner approval.";

/**
 * Self-service Profile Account Type changes are locked.
 * Trusted role state is written only by signup activation, founding approval, or owner/admin.
 */
export function canSelfServiceChangeAccountType(input: {
    currentPrimaryRole: unknown;
    nextAccountType: unknown;
    isPlatformOwner?: boolean;
    isAdmin?: boolean;
}): { ok: true } | { ok: false; status: 403; error: string } {
    if (input.isPlatformOwner || input.isAdmin) {
        return { ok: true };
    }
    const current = normalizeResolvedAccountRole(input.currentPrimaryRole);
    const next = normalizeResolvedAccountRole(input.nextAccountType);
    if (current === next) {
        return { ok: true };
    }
    return {
        ok: false,
        status: 403,
        error: current === "listener"
            ? LISTENER_SELF_PROMOTE_BLOCKED_MESSAGE
            : ACCOUNT_TYPE_SELF_SERVICE_BLOCKED_MESSAGE,
    };
}

export type OverviewAuthSignal = {
    user_id?: unknown;
    requestedAccountType?: unknown;
    metadataRole?: unknown;
};

const CREATOR_OR_ADMIN_INTENT = new Set([
    "artist",
    "producer",
    "artist_producer",
    "founding_artist",
    "founding_producer",
    "artist_pro",
    "producer_pro",
    "creator",
    "admin",
]);

export function isLaunchNotificationSignupAccount(input: {
    accountType?: unknown;
    requestedAccountType?: unknown;
    metadataRole?: unknown;
}) {
    if (normalizeResolvedAccountRole(input.accountType) !== "listener") return false;
    const requested = String(input.requestedAccountType || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
    const metaRole = String(input.metadataRole || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
    if (requested === "listener") return true;
    if (requested || CREATOR_OR_ADMIN_INTENT.has(metaRole)) return false;
    return metaRole === "listener";
}

export type OverviewFoundingMember = {
    user_id?: unknown;
    approval_status?: unknown;
    founding_role?: unknown;
};

export type OverviewRoleCounts = {
    totalUsers: number;
    listeners: number;
    launchNotificationSignups: number;
    artists: number;
    producers: number;
    admins: number;
};

/**
 * Platform Overview role cards.
 * Members = approved/full-access non-admin app members only.
 * Admins are counted separately and are excluded from Members.
 * Listeners = approved/full-access Listener members only.
 * Launch notification signups = listener/public registrations without app access.
 * Leftover profiles with stale creator metadata are not launch signups.
 * Pending/rejected creator requests are excluded from Members and Listeners.
 */
export function countOverviewRolesFromProfiles(
    profiles: Array<{ id?: unknown; user_id?: unknown; account_type?: unknown; is_admin?: unknown }>,
    activeRoles: Array<{ user_id?: unknown; role?: unknown }>,
    foundingMembers: OverviewFoundingMember[] = [],
    authSignals: OverviewAuthSignal[] = [],
): OverviewRoleCounts {
    const rolesByUser = new Map<string, string[]>();
    for (const row of activeRoles) {
        const userId = String(row.user_id || "").trim();
        const role = String(row.role || "").trim().toLowerCase();
        if (!userId || !role) continue;
        const list = rolesByUser.get(userId) || [];
        list.push(role);
        rolesByUser.set(userId, list);
    }
    const foundingByUser = new Map<string, OverviewFoundingMember>();
    for (const row of foundingMembers) {
        const userId = String(row.user_id || "").trim();
        if (userId) foundingByUser.set(userId, row);
    }
    const authByUser = new Map<string, OverviewAuthSignal>();
    for (const row of authSignals) {
        const userId = String(row.user_id || "").trim();
        if (userId) authByUser.set(userId, row);
    }

    const counts: OverviewRoleCounts = {
        totalUsers: 0,
        listeners: 0,
        launchNotificationSignups: 0,
        artists: 0,
        producers: 0,
        admins: 0,
    };

    const seen = new Set<string>();
    for (const profile of profiles) {
        const id = String(profile.id || "").trim();
        const userId = String(profile.user_id || "").trim();
        const key = id || userId;
        if (!key || seen.has(key) || (userId && seen.has(userId)) || (id && seen.has(id))) continue;
        seen.add(key);
        if (id) seen.add(id);
        if (userId) seen.add(userId);

        const primaryRole = normalizeResolvedAccountRole(profile.account_type);
        const isAdmin = profile.is_admin === true || primaryRole === "admin";
        if (isAdmin) {
            counts.admins += 1;
            continue;
        }

        const founding = foundingByUser.get(id) || (userId ? foundingByUser.get(userId) : undefined);
        const approval = String(founding?.approval_status || "").trim().toLowerCase();
        if (approval === "pending" || approval === "rejected") {
            continue;
        }
        if (approval === "approved") {
            const mergedRoles = [
                ...(rolesByUser.get(id) || []),
                ...(userId && userId !== id ? rolesByUser.get(userId) || [] : []),
            ];
            const caps = resolveCapabilitiesFromExplicitRoles({
                isAdmin: false,
                primaryRole: profile.account_type || founding?.founding_role || primaryRole,
                accountRoles: mergedRoles,
            });
            if (caps.isArtist) counts.artists += 1;
            if (caps.isProducer) counts.producers += 1;
            if (caps.isListenerOnly) counts.listeners += 1;
            counts.totalUsers += 1;
            continue;
        }
        const auth = authByUser.get(id) || (userId ? authByUser.get(userId) : undefined);
        if (isLaunchNotificationSignupAccount({
            accountType: profile.account_type,
            requestedAccountType: auth?.requestedAccountType,
            metadataRole: auth?.metadataRole,
        })) {
            counts.launchNotificationSignups += 1;
        }
    }

    return counts;
}

/** Creator dashboard/connect/payout access — Artist or Producer accounts only. */
export async function requireCreatorAccountAccess(userId: string, email = "") {
    const capabilities = await loadResolvedAccountCapabilities(userId, email);
    if (!capabilities.canUpload && !capabilities.isAdmin) {
        return {
            ok: false as const,
            status: 403,
            error: "Creator access is available for Artist and Producer accounts only.",
            capabilities,
        };
    }
    return { ok: true as const, capabilities };
}

/** Enforce artist/producer audience for Connect, payouts, and creator-type-scoped APIs. */
export async function requireCreatorAudienceAccess(
    userId: string,
    creatorType: "artist" | "producer",
    email = "",
) {
    const base = await requireCreatorAccountAccess(userId, email);
    if (!base.ok) return base;
    const { capabilities } = base;
    if (capabilities.isAdmin) {
        return { ok: true as const, capabilities };
    }
    if (creatorType === "artist" && !capabilities.isArtist) {
        return {
            ok: false as const,
            status: 403,
            error: "Artist account is required for this action.",
            capabilities,
        };
    }
    if (creatorType === "producer" && !capabilities.isProducer) {
        return {
            ok: false as const,
            status: 403,
            error: "Producer account is required for this action.",
            capabilities,
        };
    }
    return { ok: true as const, capabilities };
}
