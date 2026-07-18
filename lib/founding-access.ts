import type { SupabaseClient } from "@supabase/supabase-js";
import { isMissingFoundingSetup } from "@/lib/admin-auth";
import {
    type FoundingApprovalStatus,
    type FoundingMemberRecord,
    type FoundingRole,
    foundingRoleDashboard,
    isFoundingBetaLocked,
} from "@/lib/founding-onboarding";
import { isPlatformOwnerEmail } from "@/lib/server-supabase";

export type FoundingAccessState = {
    isFoundingMember: boolean;
    foundingRole: FoundingRole | null;
    approvalStatus: FoundingApprovalStatus | null;
    member: FoundingMemberRecord | null;
    /** Beta gate only — never used for creator chrome or post-login navigation. */
    canAccessApp: boolean;
    /**
     * Upload-lock bypass for approved founding members.
     * Does NOT grant Upload button / Artist Studio / My Ringtones visibility.
     * Creator chrome comes only from profiles.account_type + user_roles.
     */
    canUpload: boolean;
    /**
     * @deprecated Never use for navigation. Always null.
     * Founding invite role must not force Artist/Producer Dashboard.
     */
    dashboardView: string | null;
    /** Informational only — which creator dashboard the invite intended. */
    suggestedCreatorDashboard: string | null;
    badgeLabel: string | null;
    joinedAt: string | null;
};

const DEFAULT_ACCESS: FoundingAccessState = {
    isFoundingMember: false,
    foundingRole: null,
    approvalStatus: null,
    member: null,
    canAccessApp: true,
    canUpload: false,
    dashboardView: null,
    suggestedCreatorDashboard: null,
    badgeLabel: null,
    joinedAt: null,
};

export async function loadFoundingMemberByUserId(
    supabase: SupabaseClient,
    userId: string,
): Promise<FoundingMemberRecord | null> {
    if (!userId) return null;
    const result = await supabase
        .from("founding_members")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();
    if (result.error) {
        if (isMissingFoundingSetup(result.error)) return null;
        throw result.error;
    }
    return (result.data as FoundingMemberRecord | null) || null;
}

export function resolveFoundingAccess(
    email: string | null | undefined,
    member: FoundingMemberRecord | null,
): FoundingAccessState {
    if (isPlatformOwnerEmail(email)) {
        return {
            ...DEFAULT_ACCESS,
            canAccessApp: true,
            canUpload: true,
            suggestedCreatorDashboard: "Platform Control Center",
        };
    }

    if (!member) {
        if (isFoundingBetaLocked()) {
            return {
                ...DEFAULT_ACCESS,
                canAccessApp: false,
                canUpload: false,
            };
        }
        return DEFAULT_ACCESS;
    }

    const approved = member.approval_status === "approved";
    const suggested = approved ? foundingRoleDashboard(member.founding_role) : null;

    return {
        isFoundingMember: true,
        foundingRole: member.founding_role,
        approvalStatus: member.approval_status,
        member,
        canAccessApp: approved,
        // Upload-lock bypass only — not navigation/chrome.
        canUpload: approved,
        // CRITICAL: never auto-route Listeners (or anyone) from founding role.
        dashboardView: null,
        suggestedCreatorDashboard: suggested,
        badgeLabel: member.badge_label || "Founding Member",
        joinedAt: member.joined_at,
    };
}

export async function getFoundingAccessForUser(
    supabase: SupabaseClient,
    userId: string,
    email: string | null | undefined,
): Promise<FoundingAccessState> {
    if (isPlatformOwnerEmail(email)) {
        return resolveFoundingAccess(email, null);
    }
    const member = await loadFoundingMemberByUserId(supabase, userId);
    return resolveFoundingAccess(email, member);
}

export function canFoundingMemberUploadFromAccess(access: FoundingAccessState, email: string | null | undefined) {
    if (isPlatformOwnerEmail(email)) return true;
    return access.canUpload;
}

export function shouldBlockUninvitedSignup(email: string | null | undefined, hasValidInvite: boolean) {
    if (!isFoundingBetaLocked()) return false;
    if (isPlatformOwnerEmail(email)) return false;
    return !hasValidInvite;
}

export function shouldBlockSelfRoleChange(
    email: string | null | undefined,
    member: FoundingMemberRecord | null,
) {
    if (isPlatformOwnerEmail(email)) return false;
    return Boolean(member);
}
