import type { SupabaseClient } from "@supabase/supabase-js";
import { isMissingFoundingSetup } from "@/lib/admin-auth";
import { foundingRoleLabel, type FoundingApprovalStatus, type FoundingRole } from "@/lib/founding-onboarding";
import { getErrorMessage, isUuid } from "@/lib/server-supabase";

export type FoundingMemberAdminRow = {
    user_id: string;
    founding_role: FoundingRole;
    approval_status: FoundingApprovalStatus;
    invite_id: string | null;
    display_name: string | null;
    joined_at: string;
    approved_at: string | null;
    rejected_at: string | null;
    updated_at: string;
    email: string;
    username: string;
    roleLabel: string;
};

async function repairOrphanedRedemptions(supabase: SupabaseClient) {
    const rpc = await supabase.rpc("repair_orphaned_founding_redemptions");
    if (!rpc.error) {
        return Number(rpc.data || 0);
    }
    // Fallback when migration RPC is not installed yet.
    const used = await supabase
        .from("founding_invites")
        .select("id,intended_role,redeemed_by,redeemed_at,updated_at")
        .eq("status", "used")
        .not("redeemed_by", "is", null);
    if (used.error) {
        if (isMissingFoundingSetup(used.error)) return 0;
        throw used.error;
    }
    let inserted = 0;
    for (const invite of used.data || []) {
        const userId = String(invite.redeemed_by || "");
        if (!isUuid(userId)) continue;
        const existing = await supabase
            .from("founding_members")
            .select("user_id")
            .eq("user_id", userId)
            .maybeSingle();
        if (existing.error && !isMissingFoundingSetup(existing.error)) throw existing.error;
        if (existing.data) continue;
        const joinedAt = String(invite.redeemed_at || invite.updated_at || new Date().toISOString());
        const create = await supabase.from("founding_members").insert({
            user_id: userId,
            founding_role: invite.intended_role,
            approval_status: "pending",
            invite_id: invite.id,
            display_name: "Founding Member",
            joined_at: joinedAt,
            updated_at: new Date().toISOString(),
        });
        if (!create.error) inserted += 1;
    }
    return inserted;
}

export async function listFoundingMembersForAdmin(supabase: SupabaseClient) {
    await repairOrphanedRedemptions(supabase).catch(() => 0);

    const result = await supabase
        .from("founding_members")
        .select("*")
        .order("joined_at", { ascending: false });

    if (result.error) {
        if (isMissingFoundingSetup(result.error)) {
            return {
                members: [] as FoundingMemberAdminRow[],
                pending: [] as FoundingMemberAdminRow[],
                approved: [] as FoundingMemberAdminRow[],
                rejected: [] as FoundingMemberAdminRow[],
                setupRequired: true as const,
            };
        }
        throw result.error;
    }

    const members = result.data || [];
    const userIds = members.map((member) => String(member.user_id || "")).filter(isUuid);

    const profileMap = new Map<string, { username: string; display_name: string }>();
    if (userIds.length > 0) {
        const [byId, byUserId] = await Promise.all([
            supabase.from("profiles").select("id,user_id,username,display_name").in("id", userIds),
            supabase.from("profiles").select("id,user_id,username,display_name").in("user_id", userIds),
        ]);
        for (const result of [byId, byUserId]) {
            if (result.error) continue;
            for (const profile of result.data || []) {
                const keys = [String(profile.user_id || ""), String(profile.id || "")].filter(isUuid);
                for (const key of keys) {
                    profileMap.set(key, {
                        username: String(profile.username || "").trim(),
                        display_name: String(profile.display_name || "").trim(),
                    });
                }
            }
        }
    }

    const emails = new Map<string, string>();
    await Promise.all(userIds.map(async (memberId) => {
        const lookup = await supabase.auth.admin.getUserById(memberId);
        if (lookup.data.user?.email) emails.set(memberId, lookup.data.user.email);
    }));

    const enriched: FoundingMemberAdminRow[] = members.map((member) => {
        const userId = String(member.user_id || "");
        const profile = profileMap.get(userId);
        const foundingRole = member.founding_role as FoundingRole;
        return {
            user_id: userId,
            founding_role: foundingRole,
            approval_status: member.approval_status as FoundingApprovalStatus,
            invite_id: (member.invite_id as string | null) || null,
            display_name: String(member.display_name || profile?.display_name || "").trim() || null,
            joined_at: String(member.joined_at || ""),
            approved_at: (member.approved_at as string | null) || null,
            rejected_at: (member.rejected_at as string | null) || null,
            updated_at: String(member.updated_at || ""),
            email: emails.get(userId) || "",
            username: profile?.username || "",
            roleLabel: foundingRoleLabel(foundingRole),
        };
    });

    return {
        members: enriched,
        pending: enriched.filter((member) => member.approval_status === "pending"),
        approved: enriched.filter((member) => member.approval_status === "approved"),
        rejected: enriched.filter((member) => member.approval_status === "rejected"),
        setupRequired: false as const,
    };
}

export function getFoundingMembersListErrorMessage(error: unknown) {
    return getErrorMessage(error);
}
