import type { SupabaseClient } from "@supabase/supabase-js";
import { isMissingFoundingSetup } from "@/lib/admin-auth";
import {
    isBetaAccessCreatorRecord,
    isFoundingCohortMemberRecord,
    isListenerAccessMember,
    resolveBetaAccessDisplayLabel,
} from "@/lib/creator-self-signup";
import {
    type FoundingApprovalStatus,
    type FoundingMemberRecord,
    type FoundingRole,
    foundingRoleDashboard,
} from "@/lib/founding-onboarding";
import { decodeSignupAccountTypeMarker } from "@/lib/signup-account-type";
import { isPlatformOwnerEmail } from "@/lib/server-supabase";

function normalizeAccountTypeForUpload(accountType: string) {
    const normalized = String(accountType || "").trim().toLowerCase();
    if (["artist", "founding_artist", "artist_pro", "creator"].includes(normalized)) return "artist";
    if (["producer", "founding_producer", "producer_pro"].includes(normalized)) return "producer";
    if (["podcaster", "founding_podcaster"].includes(normalized)) return "podcaster";
    return "listener";
}

export type AppAccessDenialReason =
    | "rejected"
    | "email_unverified"
    | "incomplete_registration"
    | "founding_pending"
    | null;

export type FoundingAccessState = {
    /** Invited founding cohort (not self-serve beta access or listener app access). */
    isFoundingMember: boolean;
    isFoundingCohortMember: boolean;
    /** Self-serve Artist/Producer beta gate — not Founding Member designation. */
    isBetaAccessCreator: boolean;
    betaAccessLabel: string | null;
    foundingRole: FoundingRole | null;
    approvalStatus: FoundingApprovalStatus | null;
    member: FoundingMemberRecord | null;
    /** Ordinary app shell + listener/creator features (not founding cohort designation). */
    canAccessApp: boolean;
    appAccessDenialReason: AppAccessDenialReason;
    /**
     * Upload-lock bypass for approved creators only.
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
    isFoundingCohortMember: false,
    isBetaAccessCreator: false,
    betaAccessLabel: null,
    foundingRole: null,
    approvalStatus: null,
    member: null,
    canAccessApp: false,
    appAccessDenialReason: "incomplete_registration",
    canUpload: false,
    dashboardView: null,
    suggestedCreatorDashboard: null,
    badgeLabel: null,
    joinedAt: null,
};

export type ResolveFoundingAccessOptions = {
    isAdmin?: boolean;
    emailVerified?: boolean;
    hasProfile?: boolean;
    accountType?: string | null;
};

function isCreatorUploadAccountType(accountType: string, member: FoundingMemberRecord | null) {
    const marker = member ? decodeSignupAccountTypeMarker(member.social_link) : null;
    if (marker === "listener") return false;
    const normalized = normalizeAccountTypeForUpload(accountType);
    return normalized === "artist" || normalized === "producer" || normalized === "podcaster";
}

function resolveOrdinaryAppAccess(
    member: FoundingMemberRecord | null,
    options: ResolveFoundingAccessOptions,
): { canAccessApp: boolean; appAccessDenialReason: AppAccessDenialReason } {
    if (member?.approval_status === "rejected") {
        return { canAccessApp: false, appAccessDenialReason: "rejected" };
    }
    if (member?.invite_id && member.approval_status === "pending") {
        return { canAccessApp: false, appAccessDenialReason: "founding_pending" };
    }
    if (!options.hasProfile) {
        return { canAccessApp: false, appAccessDenialReason: "incomplete_registration" };
    }
    if (!options.emailVerified) {
        return { canAccessApp: false, appAccessDenialReason: "email_unverified" };
    }
    return { canAccessApp: true, appAccessDenialReason: null };
}

function resolveCanUpload(
    member: FoundingMemberRecord | null,
    options: ResolveFoundingAccessOptions,
) {
    if (member?.approval_status === "rejected") return false;
    if (member?.approval_status !== "approved") return false;
    if (isListenerAccessMember(member)) return false;
    return isCreatorUploadAccountType(String(options.accountType || ""), member);
}

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
    options?: ResolveFoundingAccessOptions,
): FoundingAccessState {
    const accessOptions: ResolveFoundingAccessOptions = {
        emailVerified: options?.emailVerified ?? false,
        hasProfile: options?.hasProfile ?? false,
        accountType: options?.accountType ?? null,
        isAdmin: options?.isAdmin,
    };

    if (isPlatformOwnerEmail(email) || options?.isAdmin) {
        return {
            ...DEFAULT_ACCESS,
            canAccessApp: true,
            appAccessDenialReason: null,
            canUpload: true,
            suggestedCreatorDashboard: "Platform Control Center",
        };
    }

    const { canAccessApp, appAccessDenialReason } = resolveOrdinaryAppAccess(member, accessOptions);
    const canUpload = resolveCanUpload(member, accessOptions);

    if (!member) {
        return {
            ...DEFAULT_ACCESS,
            canAccessApp,
            appAccessDenialReason,
            canUpload,
        };
    }

    const approved = member.approval_status === "approved";
    const suggested = approved ? foundingRoleDashboard(member.founding_role) : null;
    const isFoundingCohortMember = isFoundingCohortMemberRecord(member);
    const isBetaAccessCreator = isBetaAccessCreatorRecord(member);
    const betaAccessLabel = resolveBetaAccessDisplayLabel(member);
    const badgeLabel = isBetaAccessCreator && betaAccessLabel
        ? betaAccessLabel
        : (isListenerAccessMember(member)
            ? "Listener access"
            : (member.badge_label || "Founding Member"));

    return {
        isFoundingMember: isFoundingCohortMember,
        isFoundingCohortMember,
        isBetaAccessCreator,
        betaAccessLabel,
        foundingRole: member.founding_role,
        approvalStatus: member.approval_status,
        member,
        canAccessApp,
        appAccessDenialReason,
        canUpload,
        dashboardView: null,
        suggestedCreatorDashboard: suggested,
        badgeLabel,
        joinedAt: member.joined_at,
    };
}

export async function getFoundingAccessForUser(
    supabase: SupabaseClient,
    userId: string,
    email: string | null | undefined,
): Promise<FoundingAccessState> {
    if (isPlatformOwnerEmail(email)) {
        return resolveFoundingAccess(email, null, { isAdmin: true, emailVerified: true, hasProfile: true });
    }
    const profileResult = await supabase
        .from("profiles")
        .select("is_admin,account_type")
        .or(`id.eq.${userId},user_id.eq.${userId}`)
        .maybeSingle();
    const profile = (profileResult.data || {}) as { is_admin?: boolean; account_type?: string };
    const isAdmin = profile.is_admin === true
        || String(profile.account_type || "").trim().toLowerCase() === "admin";
    if (isAdmin) {
        return resolveFoundingAccess(email, null, {
            isAdmin: true,
            emailVerified: true,
            hasProfile: true,
            accountType: profile.account_type,
        });
    }
    const userLookup = await supabase.auth.admin.getUserById(userId);
    const authUser = userLookup.data.user;
    const emailVerified = Boolean(authUser?.email_confirmed_at || authUser?.confirmed_at);
    const hasProfile = Boolean(profileResult.data);
    const member = await loadFoundingMemberByUserId(supabase, userId);
    return resolveFoundingAccess(email, member, {
        emailVerified,
        hasProfile,
        accountType: profile.account_type,
    });
}

export function canFoundingMemberUploadFromAccess(access: FoundingAccessState, email: string | null | undefined) {
    if (isPlatformOwnerEmail(email)) return true;
    return access.canUpload;
}

export function shouldBlockUninvitedSignup(
    email: string | null | undefined,
    _hasValidInvite: boolean,
) {
    if (isPlatformOwnerEmail(email)) return false;
    return false;
}

export function shouldBlockSelfRoleChange(
    email: string | null | undefined,
    member: FoundingMemberRecord | null,
) {
    if (isPlatformOwnerEmail(email)) return false;
    return Boolean(member);
}
