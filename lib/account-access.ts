/**
 * Authoritative account access snapshot.
 * Single server-trusted source for navigation capabilities and diagnostics.
 *
 * Capability rules:
 * - profiles.account_type + active user_roles (filtered) only
 * - Never grant creator chrome from founding_members, invite role, or auth metadata
 * - Founding membership only affects beta app access (canAccessApp), not Upload/Dashboard
 */

import {
    loadResolvedAccountCapabilities,
    type ResolvedAccountCapabilities,
} from "@/lib/resolved-account-role";
import {
    resolveNavCapabilities,
    type NavCapabilityFlags,
} from "@/lib/role-based-navigation";
import { isPlatformOwnerEmail } from "@/lib/server-supabase";

export const ACCOUNT_ACCESS_TRACE_PREFIX = "[mdb.access]";

export type AccountAccessTrace = {
    userId: string;
    email: string;
    profileAccountType: string;
    authMetadataRole: string;
    foundingRole: string | null;
    foundingApprovalStatus: string | null;
    explicitRoles: string[];
    primaryRole: string;
    isListenerOnly: boolean;
    canUpload: boolean;
    canArtistDashboard: boolean;
    canProducerDashboard: boolean;
    canMyRingtones: boolean;
    canSales: boolean;
    divergenceNotes: string[];
};

export type AccountAccessSnapshot = {
    capabilities: ResolvedAccountCapabilities;
    nav: NavCapabilityFlags;
    trace: AccountAccessTrace;
};

export function buildAccessDivergenceNotes(input: {
    profileAccountType: string;
    authMetadataRole: string;
    foundingRole: string | null;
    foundingApprovalStatus: string | null;
    caps: ResolvedAccountCapabilities;
}): string[] {
    const notes: string[] = [];
    const meta = String(input.authMetadataRole || "").trim().toLowerCase();
    const profile = String(input.profileAccountType || "").trim().toLowerCase() || "listener";
    if (meta && meta !== profile && meta !== input.caps.primaryRole) {
        notes.push(`auth_metadata.role=${meta} ignored; profile.account_type=${profile} authoritative`);
    }
    if (input.foundingRole && input.caps.isListenerOnly) {
        notes.push(
            `founding_role=${input.foundingRole} approval=${input.foundingApprovalStatus || "none"} does not grant creator chrome`,
        );
    }
    if (input.foundingApprovalStatus === "approved" && input.caps.isListenerOnly) {
        notes.push("approved founding member with Listener account_type → consumer navigation only");
    }
    return notes;
}

export async function loadAccountAccessSnapshot(input: {
    userId: string;
    email?: string;
    profileAccountType?: string;
    authMetadataRole?: string;
    foundingRole?: string | null;
    foundingApprovalStatus?: string | null;
}): Promise<AccountAccessSnapshot> {
    const email = String(input.email || "").trim();
    const caps = await loadResolvedAccountCapabilities(input.userId, email);
    const isPlatformOwner = isPlatformOwnerEmail(email);
    const nav = resolveNavCapabilities({
        isPlatformOwner,
        isAdmin: caps.isAdmin,
        primaryRole: caps.primaryRole,
        accountRoles: caps.roles,
        rolesReady: true,
    });
    const profileAccountType = String(input.profileAccountType || caps.primaryRole || "listener");
    const authMetadataRole = String(input.authMetadataRole || "").trim().toLowerCase();
    const foundingRole = input.foundingRole ? String(input.foundingRole) : null;
    const foundingApprovalStatus = input.foundingApprovalStatus
        ? String(input.foundingApprovalStatus)
        : null;
    const trace: AccountAccessTrace = {
        userId: input.userId,
        email,
        profileAccountType,
        authMetadataRole,
        foundingRole,
        foundingApprovalStatus,
        explicitRoles: caps.roles,
        primaryRole: caps.primaryRole,
        isListenerOnly: caps.isListenerOnly,
        canUpload: nav.canUpload,
        canArtistDashboard: nav.canArtistDashboard,
        canProducerDashboard: nav.canProducerDashboard,
        canMyRingtones: nav.canMyRingtones,
        canSales: nav.canSales,
        divergenceNotes: buildAccessDivergenceNotes({
            profileAccountType,
            authMetadataRole,
            foundingRole,
            foundingApprovalStatus,
            caps,
        }),
    };
    return { capabilities: caps, nav, trace };
}

export function logAccountAccessTrace(trace: AccountAccessTrace, stage: string) {
    console.info(ACCOUNT_ACCESS_TRACE_PREFIX, stage, {
        userId: trace.userId,
        email: trace.email,
        primaryRole: trace.primaryRole,
        isListenerOnly: trace.isListenerOnly,
        canUpload: trace.canUpload,
        canArtistDashboard: trace.canArtistDashboard,
        canProducerDashboard: trace.canProducerDashboard,
        profileAccountType: trace.profileAccountType,
        authMetadataRole: trace.authMetadataRole,
        foundingRole: trace.foundingRole,
        foundingApprovalStatus: trace.foundingApprovalStatus,
        roles: trace.explicitRoles,
        divergenceNotes: trace.divergenceNotes,
    });
}

/** Post-login destination: never use founding dashboard for Listeners. */
export function resolvePostAuthDestination(input: {
    isPlatformOwner?: boolean;
    canArtistDashboard?: boolean;
    canProducerDashboard?: boolean;
    requestedView?: string | null;
}): "Home" | "Artist Dashboard" | "Producer Dashboard" | "Platform Control Center" {
    if (input.isPlatformOwner) {
        return "Home";
    }
    const requested = String(input.requestedView || "").trim();
    if (requested === "Artist Dashboard" && input.canArtistDashboard) return "Artist Dashboard";
    if (requested === "Producer Dashboard" && input.canProducerDashboard) return "Producer Dashboard";
    return "Home";
}
