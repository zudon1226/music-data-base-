import type { SupabaseClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { isMissingFoundingSetup } from "@/lib/admin-auth";
import { findAdminUserByEmail } from "@/lib/admin-auth-users";
import {
    type FoundingInviteRecord,
    type FoundingRole,
    isInviteExpired,
    normalizeInviteCode,
    podcasterInviteRoleError,
    resolveInviteStatus,
} from "@/lib/founding-onboarding";
import { getErrorMessage, isPlatformOwnerEmail } from "@/lib/server-supabase";
import {
    type SignupAccountType,
    decodeSignupAccountTypeMarker,
    encodeSignupAccountTypeMarker,
    normalizeSignupAccountType,
    parseSignupAccountTypeInput,
    resolveSignupAccountTypeGrants,
} from "@/lib/signup-account-type";
import { repairAuthUserMetadata } from "@/lib/sync-auth-user-metadata";

function generateInviteCode() {
    return randomBytes(12).toString("hex").toUpperCase();
}

export async function fetchInviteByCode(supabase: SupabaseClient, rawCode: string) {
    const inviteCode = normalizeInviteCode(rawCode);
    if (!inviteCode) return { invite: null as FoundingInviteRecord | null, inviteCode };
    const result = await supabase
        .from("founding_invites")
        .select("*")
        .eq("invite_code", inviteCode)
        .maybeSingle();
    if (result.error) {
        if (isMissingFoundingSetup(result.error)) {
            throw new Error("Founding onboarding tables are not installed. Run the founding onboarding migration.");
        }
        throw result.error;
    }
    const invite = (result.data as FoundingInviteRecord | null) || null;
    if (!invite) return { invite: null, inviteCode };
    const status = resolveInviteStatus(invite);
    if (status !== invite.status && status === "expired") {
        await supabase
            .from("founding_invites")
            .update({ status: "expired", updated_at: new Date().toISOString() })
            .eq("id", invite.id);
        return { invite: { ...invite, status: "expired" as const }, inviteCode };
    }
    return { invite: { ...invite, status }, inviteCode };
}

export async function validateInviteCode(supabase: SupabaseClient, rawCode: string) {
    const { invite, inviteCode } = await fetchInviteByCode(supabase, rawCode);
    if (!inviteCode) {
        return { ok: false as const, error: "Invite code is required." };
    }
    if (!invite) {
        return { ok: false as const, error: "Invite code is invalid." };
    }
    if (invite.status === "used") {
        return { ok: false as const, error: "Invite code has already been used." };
    }
    if (invite.status === "revoked") {
        return { ok: false as const, error: "Invite code has been revoked." };
    }
    if (invite.status === "expired" || isInviteExpired(invite)) {
        return { ok: false as const, error: "Invite code has expired." };
    }
    if (invite.status !== "active") {
        return { ok: false as const, error: "Invite code is no longer active." };
    }
    return {
        ok: true as const,
        invite,
        inviteCode,
        intendedRole: invite.intended_role as FoundingRole,
    };
}

async function checkPodcasterInviteRole(
    supabase: SupabaseClient,
    rawCode: string,
    accountType: SignupAccountType,
) {
    try {
        const { invite } = await fetchInviteByCode(supabase, rawCode);
        if (!invite) return { ok: true as const };
        const error = podcasterInviteRoleError(accountType, invite.intended_role);
        return error ? { ok: false as const, error } : { ok: true as const };
    }
    catch (error) {
        return { ok: false as const, error: getErrorMessage(error) };
    }
}

async function persistRequestedSignupAccountType(options: {
    supabase: SupabaseClient;
    userId: string;
    displayName: string;
    accountType: SignupAccountType;
}) {
    const marker = encodeSignupAccountTypeMarker(options.accountType);
    await options.supabase
        .from("founding_members")
        .update({
            social_link: marker,
            updated_at: new Date().toISOString(),
        })
        .eq("user_id", options.userId)
        .then(() => undefined, () => undefined);
    await repairAuthUserMetadata(options.supabase, options.userId, {
        displayName: options.displayName,
        role: "listener",
        requestedAccountType: options.accountType,
    }).catch(() => undefined);
}

function foundingRoleForSignupAccountType(accountType: SignupAccountType): FoundingRole {
    if (accountType === "podcaster") return "founding_podcaster";
    return accountType === "producer" ? "founding_producer" : "founding_artist";
}

export async function createPendingCreatorAccessRequest(options: {
    supabase: SupabaseClient;
    userId: string;
    displayName: string;
    accountType: SignupAccountType;
}) {
    const existing = await options.supabase
        .from("founding_members")
        .select("*")
        .eq("user_id", options.userId)
        .maybeSingle();
    if (existing.error && !isMissingFoundingSetup(existing.error)) {
        throw existing.error;
    }
    if (existing.data) {
        await persistRequestedSignupAccountType(options);
        return { ok: true as const, member: existing.data, created: false };
    }

    const now = new Date().toISOString();
    const inserted = await options.supabase
        .from("founding_members")
        .upsert({
            user_id: options.userId,
            founding_role: foundingRoleForSignupAccountType(options.accountType),
            approval_status: "pending",
            display_name: options.displayName,
            social_link: encodeSignupAccountTypeMarker(options.accountType),
            joined_at: now,
            updated_at: now,
        }, { onConflict: "user_id" })
        .select("*")
        .maybeSingle();
    if (inserted.error) {
        throw inserted.error;
    }
    await persistRequestedSignupAccountType(options);
    return { ok: true as const, member: inserted.data, created: true };
}

export async function revokeUnapprovedCreatorPrivileges(options: {
    supabase: SupabaseClient;
    userId: string;
    displayName?: string;
    requestedAccountType?: SignupAccountType;
}) {
    const now = new Date().toISOString();
    await options.supabase
        .from("user_roles")
        .update({ status: "disabled", updated_at: now })
        .eq("user_id", options.userId)
        .in("role", ["founding_artist", "founding_producer", "artist", "producer", "artist_pro", "producer_pro", "creator", "creator_free", "founding_podcaster", "podcaster"]);
    await options.supabase
        .from("profiles")
        .upsert({
            id: options.userId,
            user_id: options.userId,
            account_type: "listener",
            display_name: String(options.displayName || "").trim() || undefined,
            updated_at: now,
        }, { onConflict: "id" });
    await repairAuthUserMetadata(options.supabase, options.userId, {
        displayName: String(options.displayName || "").trim() || undefined,
        role: "listener",
        requestedAccountType: options.requestedAccountType || "listener",
    }).catch(() => undefined);
}

export async function redeemFoundingInvite(options: {
    supabase: SupabaseClient;
    userId: string;
    email: string;
    displayName: string;
    rawCode: string;
    accountType?: unknown;
}) {
    const displayName = String(options.displayName || "").trim() || options.email.split("@")[0] || "Founding Member";
    const parsedAccountType = parseSignupAccountTypeInput(options.accountType);
    if (!parsedAccountType.ok) {
        return { ok: false as const, error: parsedAccountType.error };
    }
    const accountType = parsedAccountType.accountType;

    // Must run before the atomic RPC, which consumes the invite without knowing the account type.
    const roleCheck = await checkPodcasterInviteRole(options.supabase, options.rawCode, accountType);
    if (!roleCheck.ok) {
        return { ok: false as const, error: roleCheck.error };
    }

    const rpc = await options.supabase.rpc("redeem_founding_invite_atomic", {
        p_user_id: options.userId,
        p_raw_code: options.rawCode,
        p_display_name: displayName,
    });
    if (!rpc.error) {
        const payload = (rpc.data || {}) as {
            ok?: boolean;
            error?: string;
            member?: Record<string, unknown>;
            intended_role?: FoundingRole;
        };
        if (!payload.ok) {
            return { ok: false as const, error: payload.error || "Invite redemption failed." };
        }
        await options.supabase
            .from("profiles")
            .upsert({
                id: options.userId,
                user_id: options.userId,
                display_name: displayName,
                account_type: "listener",
                updated_at: new Date().toISOString(),
            }, { onConflict: "id" })
            .then(() => undefined, () => undefined);
        await persistRequestedSignupAccountType({
            supabase: options.supabase,
            userId: options.userId,
            displayName,
            accountType,
        });
        return {
            ok: true as const,
            member: payload.member,
            intendedRole: (payload.intended_role || payload.member?.founding_role) as FoundingRole,
            accountType,
        };
    }

    const rpcMissing = /could not find the function|schema cache|does not exist/i.test(getErrorMessage(rpc.error));
    if (!rpcMissing) {
        return { ok: false as const, error: getErrorMessage(rpc.error) };
    }

    // Fallback path when atomic RPC migration is not installed yet.
    const { invite, inviteCode } = await fetchInviteByCode(options.supabase, options.rawCode);
    if (!inviteCode) {
        return { ok: false as const, error: "Invite code is required." };
    }
    if (!invite) {
        return { ok: false as const, error: "Invite code is invalid." };
    }

    const existingMember = await options.supabase
        .from("founding_members")
        .select("*")
        .eq("user_id", options.userId)
        .maybeSingle();
    if (existingMember.error && !isMissingFoundingSetup(existingMember.error)) {
        return { ok: false as const, error: getErrorMessage(existingMember.error) };
    }
    if (existingMember.data) {
        const member = existingMember.data as { invite_id?: string | null; approval_status?: string; founding_role?: FoundingRole };
        if (member.invite_id === invite.id && member.approval_status === "pending") {
            await persistRequestedSignupAccountType({
                supabase: options.supabase,
                userId: options.userId,
                displayName,
                accountType,
            });
            return {
                ok: true as const,
                member: existingMember.data,
                intendedRole: (member.founding_role || invite.intended_role) as FoundingRole,
                accountType,
            };
        }
        return { ok: false as const, error: "A founding membership is already linked to this account." };
    }

    if (invite.status === "used" && invite.redeemed_by === options.userId) {
        const repaired = await options.supabase
            .from("founding_members")
            .upsert({
                user_id: options.userId,
                founding_role: invite.intended_role,
                approval_status: "pending",
                invite_id: invite.id,
                display_name: displayName,
                social_link: encodeSignupAccountTypeMarker(accountType),
                joined_at: invite.redeemed_at || new Date().toISOString(),
                updated_at: new Date().toISOString(),
            }, { onConflict: "user_id" })
            .select("*")
            .single();
        if (repaired.error) {
            return { ok: false as const, error: getErrorMessage(repaired.error) };
        }
        await persistRequestedSignupAccountType({
            supabase: options.supabase,
            userId: options.userId,
            displayName,
            accountType,
        });
        return {
            ok: true as const,
            member: repaired.data,
            intendedRole: invite.intended_role as FoundingRole,
            accountType,
        };
    }

    const validation = await validateInviteCode(options.supabase, options.rawCode);
    if (!validation.ok) {
        return { ok: false as const, error: validation.error };
    }

    const now = new Date().toISOString();
    const memberInsert = await options.supabase
        .from("founding_members")
        .insert({
            user_id: options.userId,
            founding_role: validation.intendedRole,
            approval_status: "pending",
            invite_id: invite.id,
            display_name: displayName,
            social_link: encodeSignupAccountTypeMarker(accountType),
            joined_at: now,
            updated_at: now,
        })
        .select("*")
        .single();

    if (memberInsert.error) {
        return { ok: false as const, error: getErrorMessage(memberInsert.error) };
    }

    const consume = await options.supabase
        .from("founding_invites")
        .update({
            status: "used",
            redeemed_by: options.userId,
            redeemed_at: now,
            updated_at: now,
        })
        .eq("id", invite.id)
        .eq("status", "active")
        .select("id")
        .maybeSingle();

    if (consume.error || !consume.data) {
        await options.supabase.from("founding_members").delete().eq("user_id", options.userId);
        return { ok: false as const, error: "Invite code has already been used or revoked." };
    }

    await options.supabase
        .from("profiles")
        .upsert({
            id: options.userId,
            user_id: options.userId,
            display_name: displayName,
            account_type: "listener",
            updated_at: now,
        }, { onConflict: "id" })
        .then(() => undefined, () => undefined);

    await persistRequestedSignupAccountType({
        supabase: options.supabase,
        userId: options.userId,
        displayName,
        accountType,
    });

    return {
        ok: true as const,
        member: memberInsert.data,
        intendedRole: validation.intendedRole,
        accountType,
    };
}

export async function createFoundingInvite(options: {
    supabase: SupabaseClient;
    createdBy: string;
    intendedRole: FoundingRole;
    expiresAt?: string | null;
}) {
    const now = new Date().toISOString();
    const inviteCode = generateInviteCode();
    const insert = await options.supabase
        .from("founding_invites")
        .insert({
            invite_code: inviteCode,
            intended_role: options.intendedRole,
            status: "active",
            created_by: options.createdBy,
            expires_at: options.expiresAt || null,
            created_at: now,
            updated_at: now,
        })
        .select("*")
        .single();
    if (insert.error) throw insert.error;
    return insert.data as FoundingInviteRecord;
}

export async function revokeFoundingInvite(supabase: SupabaseClient, inviteId: string) {
    const now = new Date().toISOString();
    const result = await supabase
        .from("founding_invites")
        .update({ status: "revoked", updated_at: now })
        .eq("id", inviteId)
        .eq("status", "active")
        .select("*")
        .maybeSingle();
    if (result.error) throw result.error;
    if (!result.data) return { ok: false as const, error: "Only active invites can be revoked." };
    return { ok: true as const, invite: result.data as FoundingInviteRecord };
}

export async function setFoundingMemberApproval(options: {
    supabase: SupabaseClient;
    userId: string;
    approvalStatus: "approved" | "rejected";
    reviewerId: string;
}) {
    const now = new Date().toISOString();
    const updatePayload: Record<string, unknown> = {
        approval_status: options.approvalStatus,
        updated_at: now,
    };
    if (options.approvalStatus === "approved") {
        updatePayload.approved_at = now;
        updatePayload.approved_by = options.reviewerId;
        updatePayload.rejected_at = null;
        updatePayload.rejected_by = null;
    }
    else {
        updatePayload.rejected_at = now;
        updatePayload.rejected_by = options.reviewerId;
    }

    const result = await options.supabase
        .from("founding_members")
        .update(updatePayload)
        .eq("user_id", options.userId)
        .select("*")
        .maybeSingle();

    if (result.error) throw result.error;
    if (!result.data) return { ok: false as const, error: "Founding member not found." };

    const member = result.data as {
        founding_role: FoundingRole;
        display_name?: string | null;
        invite_id?: string | null;
        social_link?: string | null;
    };

    const userLookup = await options.supabase.auth.admin.getUserById(options.userId);
    const metadata = (userLookup.data.user?.user_metadata || {}) as Record<string, unknown>;
    const requestedType = decodeSignupAccountTypeMarker(member.social_link)
        || normalizeSignupAccountType(metadata.requestedAccountType)
        || (member.founding_role === "founding_podcaster"
            ? "podcaster"
            : member.founding_role === "founding_producer" ? "producer" : "artist");
    const grants = resolveSignupAccountTypeGrants(requestedType, { founding: false });

    if (options.approvalStatus === "approved") {
        if (grants.userRoles.length === 0) {
            await options.supabase
                .from("user_roles")
                .update({ status: "disabled", updated_at: now })
                .eq("user_id", options.userId)
                .in("role", ["founding_artist", "founding_producer", "artist", "producer", "founding_podcaster", "podcaster"]);
            await options.supabase
                .from("profiles")
                .upsert({
                    id: options.userId,
                    user_id: options.userId,
                    account_type: "listener",
                    display_name: String(member.display_name || "").trim() || undefined,
                    updated_at: now,
                }, { onConflict: "id" });
            await repairAuthUserMetadata(options.supabase, options.userId, {
                displayName: String(member.display_name || "").trim() || undefined,
                role: "listener",
                requestedAccountType: requestedType,
            }).catch(() => undefined);
        }
        else {
            const { applySignupAccountTypeGrants } = await import("@/lib/signup-account-activation");
            await applySignupAccountTypeGrants({
                supabase: options.supabase,
                userId: options.userId,
                accountType: requestedType,
                grantedBy: options.reviewerId,
                displayName: String(member.display_name || "").trim() || undefined,
            });
        }
    }
    else {
        // Rejection must not reactivate or reuse the invite.
        await options.supabase
            .from("user_roles")
            .update({ status: "disabled", updated_at: now })
            .eq("user_id", options.userId)
            .in("role", ["founding_artist", "founding_producer", "artist", "producer", "founding_podcaster", "podcaster", member.founding_role]);
        if (member.invite_id) {
            await options.supabase
                .from("founding_invites")
                .update({ status: "used", updated_at: now })
                .eq("id", member.invite_id)
                .in("status", ["active", "used"]);
        }
    }

    return { ok: true as const, member: result.data };
}

/** Disabled by the Listener branch of setFoundingMemberApproval. */
const LISTENER_APPROVAL_DISABLED_ROLES = ["founding_artist", "founding_producer", "artist", "producer", "founding_podcaster", "podcaster"];
/** Not disabled by that branch, so the grant refuses instead of silently keeping them. */
const LISTENER_GRANT_BLOCKING_ROLES = ["admin", "artist_pro", "producer_pro", "creator"];

async function loadActiveRoles(supabase: SupabaseClient, userId: string) {
    const result = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .eq("status", "active");
    if (result.error) throw result.error;
    return (result.data || []).map((row) => String(row.role || "").trim().toLowerCase()).filter(Boolean);
}

async function loadProfileAccess(supabase: SupabaseClient, userId: string) {
    const result = await supabase
        .from("profiles")
        .select("account_type,is_admin,display_name")
        .or(`id.eq.${userId},user_id.eq.${userId}`)
        .limit(1);
    if (result.error) throw result.error;
    const row = (result.data || [])[0] as { account_type?: string | null; is_admin?: boolean | null; display_name?: string | null } | undefined;
    if (!row) return null;
    return {
        accountType: String(row.account_type || "").trim().toLowerCase(),
        isAdmin: row.is_admin === true,
        displayName: String(row.display_name || "").trim(),
    };
}

/**
 * Admin/owner-only: approved app access for an existing Listener without an invite.
 * Keeps account_type = listener and never grants creator/admin roles.
 */
export async function grantListenerAppAccess(options: {
    supabase: SupabaseClient;
    email: string;
    reviewerId: string;
}) {
    const email = options.email.trim().toLowerCase();
    if (!email) return { ok: false as const, status: 400, error: "Listener email is required." };
    if (isPlatformOwnerEmail(email)) {
        return { ok: false as const, status: 400, error: "The platform owner account cannot receive Listener access." };
    }

    const user = await findAdminUserByEmail(options.supabase, email);
    if (!user) return { ok: false as const, status: 404, error: "No account found for that email." };
    const targetUserId = user.id;
    if (targetUserId === options.reviewerId) {
        return { ok: false as const, status: 400, error: "You cannot grant Listener access to your own account." };
    }

    const profile = await loadProfileAccess(options.supabase, targetUserId);
    if (!profile) return { ok: false as const, status: 400, error: "That account has no profile yet." };
    if (profile.accountType !== "listener") {
        return { ok: false as const, status: 400, error: "Listener access can only be granted to Listener accounts." };
    }
    if (profile.isAdmin) {
        return { ok: false as const, status: 400, error: "Admin accounts cannot receive Listener access." };
    }
    const activeRoles = await loadActiveRoles(options.supabase, targetUserId);
    const blockingRole = activeRoles.find((role) => LISTENER_GRANT_BLOCKING_ROLES.includes(role));
    if (blockingRole) {
        return { ok: false as const, status: 400, error: `That account has an active ${blockingRole} role. Resolve it before granting Listener access.` };
    }

    const existing = await options.supabase
        .from("founding_members")
        .select("approval_status,social_link")
        .eq("user_id", targetUserId)
        .maybeSingle();
    if (existing.error) throw existing.error;
    if (existing.data) {
        const existingRow = existing.data as { approval_status?: string; social_link?: string | null };
        if (existingRow.approval_status === "approved" && decodeSignupAccountTypeMarker(existingRow.social_link) === "listener") {
            return { ok: true as const, alreadyApproved: true, userId: targetUserId };
        }
        return {
            ok: false as const,
            status: 409,
            error: "That account already has a founding membership record. Use Pending Approvals instead.",
        };
    }

    const now = new Date().toISOString();
    // founding_role has no listener value; the listener marker in social_link drives approval grants.
    const insert = await options.supabase
        .from("founding_members")
        .insert({
            user_id: targetUserId,
            founding_role: "founding_artist",
            approval_status: "pending",
            invite_id: null,
            display_name: profile.displayName || null,
            social_link: encodeSignupAccountTypeMarker("listener"),
            joined_at: now,
            updated_at: now,
        })
        .select("user_id")
        .single();
    if (insert.error) return { ok: false as const, status: 400, error: getErrorMessage(insert.error) };

    const rollback = async () => {
        await options.supabase.from("founding_members").delete().eq("user_id", targetUserId);
    };

    try {
        const approved = await setFoundingMemberApproval({
            supabase: options.supabase,
            userId: targetUserId,
            approvalStatus: "approved",
            reviewerId: options.reviewerId,
        });
        if (!approved.ok) {
            await rollback();
            return { ok: false as const, status: 400, error: approved.error };
        }

        const after = await loadProfileAccess(options.supabase, targetUserId);
        const rolesAfter = await loadActiveRoles(options.supabase, targetUserId);
        const leakedRole = rolesAfter.find((role) =>
            LISTENER_APPROVAL_DISABLED_ROLES.includes(role) || LISTENER_GRANT_BLOCKING_ROLES.includes(role));
        if (!after || after.accountType !== "listener" || after.isAdmin || leakedRole) {
            await rollback();
            return { ok: false as const, status: 500, error: "Listener access verification failed; the grant was rolled back." };
        }
        return { ok: true as const, alreadyApproved: false, userId: targetUserId, member: approved.member };
    }
    catch (error) {
        await rollback();
        throw error;
    }
}
