import type { SupabaseClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { isMissingFoundingSetup } from "@/lib/admin-auth";
import {
    type FoundingInviteRecord,
    type FoundingRole,
    isInviteExpired,
    mapFoundingRoleToAccountType,
    normalizeInviteCode,
    resolveInviteStatus,
} from "@/lib/founding-onboarding";
import { getErrorMessage } from "@/lib/server-supabase";
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

export async function redeemFoundingInvite(options: {
    supabase: SupabaseClient;
    userId: string;
    email: string;
    displayName: string;
    rawCode: string;
}) {
    const validation = await validateInviteCode(options.supabase, options.rawCode);
    if (!validation.ok) {
        return { ok: false as const, error: validation.error };
    }

    const now = new Date().toISOString();
    const invite = validation.invite;
    const accountType = mapFoundingRoleToAccountType(validation.intendedRole);

    const existingMember = await options.supabase
        .from("founding_members")
        .select("*")
        .eq("user_id", options.userId)
        .maybeSingle();
    if (existingMember.error && !isMissingFoundingSetup(existingMember.error)) {
        return { ok: false as const, error: getErrorMessage(existingMember.error) };
    }
    if (existingMember.data) {
        const member = existingMember.data as { invite_id?: string | null; approval_status?: string };
        if (member.invite_id === invite.id && member.approval_status === "pending") {
            return {
                ok: true as const,
                member: existingMember.data,
                intendedRole: validation.intendedRole,
            };
        }
        return { ok: false as const, error: "A founding membership is already linked to this account." };
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
        return { ok: false as const, error: "Invite code has already been used or revoked." };
    }

    const memberUpsert = await options.supabase
        .from("founding_members")
        .upsert({
            user_id: options.userId,
            founding_role: validation.intendedRole,
            approval_status: "pending",
            invite_id: invite.id,
            display_name: options.displayName,
            joined_at: now,
            updated_at: now,
        }, { onConflict: "user_id" })
        .select("*")
        .single();

    if (memberUpsert.error) {
        return { ok: false as const, error: getErrorMessage(memberUpsert.error) };
    }

    const profileUpsert = await options.supabase
        .from("profiles")
        .upsert({
            id: options.userId,
            user_id: options.userId,
            account_type: accountType,
            display_name: options.displayName,
            updated_at: now,
        }, { onConflict: "id" });

    if (profileUpsert.error) {
        return { ok: false as const, error: getErrorMessage(profileUpsert.error) };
    }

    const roleUpsert = await options.supabase
        .from("user_roles")
        .upsert({
            user_id: options.userId,
            role: accountType,
            status: "active",
            granted_by: invite.created_by,
            updated_at: now,
        }, { onConflict: "user_id,role" });

    if (roleUpsert.error) {
        return { ok: false as const, error: getErrorMessage(roleUpsert.error) };
    }

    await repairAuthUserMetadata(options.supabase, options.userId, {
        displayName: options.displayName,
        role: accountType,
    }).catch(() => undefined);

    return {
        ok: true as const,
        member: memberUpsert.data,
        intendedRole: validation.intendedRole,
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

    const member = result.data as { founding_role: FoundingRole; display_name?: string | null };
    if (options.approvalStatus === "approved") {
        await options.supabase
            .from("user_roles")
            .upsert({
                user_id: options.userId,
                role: member.founding_role,
                status: "active",
                granted_by: options.reviewerId,
                updated_at: now,
            }, { onConflict: "user_id,role" });
        await repairAuthUserMetadata(options.supabase, options.userId, {
            displayName: String(member.display_name || "").trim() || undefined,
            role: member.founding_role,
        }).catch(() => undefined);
    }
    else {
        await options.supabase
            .from("user_roles")
            .update({ status: "disabled", updated_at: now })
            .eq("user_id", options.userId)
            .eq("role", member.founding_role);
    }

    return { ok: true as const, member: result.data };
}
