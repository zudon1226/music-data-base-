/**
 * Signup account-type activation — promotes profiles.account_type + user_roles
 * from signup intent (requestedAccountType) after legal + beta/approval gates.
 * Auth metadata intent alone never grants capabilities.
 */

import {
    buildAuthUserMetadataAdminPatch,
    sanitizeAuthUserMetadata,
} from "@/lib/auth-user-metadata";
import { loadFoundingMemberByUserId } from "@/lib/founding-access";
import { redeemFoundingInvite } from "@/lib/founding-invite-service";
import { getSignupRequiredPolicyTypes, LEGAL_POLICY_VERSION } from "@/lib/legal-policies";
import { listUserLegalAcceptances } from "@/lib/legal-acceptance-service";
import { repairAuthUserMetadata } from "@/lib/sync-auth-user-metadata";
import {
    DEFAULT_SIGNUP_ACCOUNT_TYPE,
    normalizeSignupAccountType,
    resolveSignupAccountTypeGrants,
    type SignupAccountType,
} from "@/lib/signup-account-type";
import { normalizeResolvedAccountRole } from "@/lib/resolved-account-role";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isPlatformOwnerEmail } from "@/lib/server-supabase";

const LEGACY_FOUNDING_ACCOUNT_TYPES = new Set(["founding_artist", "founding_producer"]);

export type SignupActivationStatus =
    | "listener"
    | "needs_legal"
    | "needs_invite_redeem"
    | "pending_approval"
    | "rejected"
    | "activated"
    | "legacy_preserved"
    | "owner_bypass";

export async function hasCompletedSignupLegalForAccountType(
    userId: string,
    accountType: SignupAccountType,
): Promise<boolean> {
    const required = getSignupRequiredPolicyTypes(accountType);
    const version = LEGAL_POLICY_VERSION;
    const acceptances = await listUserLegalAcceptances(userId);
    const accepted = new Set(
        acceptances
            .filter((row) => String(row.policy_version || "") === version)
            .map((row) => String(row.policy_type || "").trim()),
    );
    return required.every((policy) => accepted.has(policy));
}

export async function applySignupAccountTypeGrants(options: {
    supabase: SupabaseClient;
    userId: string;
    accountType: SignupAccountType;
    grantedBy?: string;
    displayName?: string;
}) {
    const grants = resolveSignupAccountTypeGrants(options.accountType, { founding: false });
    const { data: profileRow } = await options.supabase
        .from("profiles")
        .select("account_type,display_name")
        .or(`id.eq.${options.userId},user_id.eq.${options.userId}`)
        .maybeSingle();

    const existingType = String((profileRow as { account_type?: string } | null)?.account_type || "")
        .trim()
        .toLowerCase();

    if (LEGACY_FOUNDING_ACCOUNT_TYPES.has(existingType)) {
        return { ok: true as const, status: "legacy_preserved" as const, accountType: existingType };
    }

    if (options.accountType === "listener") {
        return { ok: true as const, status: "listener" as const, accountType: "listener" };
    }

    const now = new Date().toISOString();
    const grantor = options.grantedBy || options.userId;

    for (const role of grants.userRoles) {
        await options.supabase
            .from("user_roles")
            .upsert({
                user_id: options.userId,
                role,
                status: "active",
                granted_by: grantor,
                updated_at: now,
            }, { onConflict: "user_id,role" });
    }

    if (grants.userRoles.length > 0) {
        await options.supabase
            .from("user_roles")
            .update({ status: "disabled", updated_at: now })
            .eq("user_id", options.userId)
            .in("role", ["founding_artist", "founding_producer"]);
    }

    const displayName = String(options.displayName || (profileRow as { display_name?: string } | null)?.display_name || "").trim();

    await options.supabase
        .from("profiles")
        .upsert({
            id: options.userId,
            user_id: options.userId,
            account_type: grants.primaryAccountType,
            display_name: displayName || undefined,
            updated_at: now,
        }, { onConflict: "id" });

    await repairAuthUserMetadata(options.supabase, options.userId, {
        displayName: displayName || undefined,
        role: grants.primaryAccountType,
        requestedAccountType: options.accountType,
    }).catch(() => undefined);

    return {
        ok: true as const,
        status: "activated" as const,
        accountType: grants.primaryAccountType,
        userRoles: grants.userRoles,
    };
}

export async function resumeSignupAccountActivation(options: {
    supabase: SupabaseClient;
    userId: string;
    email?: string;
    inviteCode?: string;
    displayName?: string;
}) {
    const email = String(options.email || "").trim();
    if (isPlatformOwnerEmail(email)) {
        return { ok: true as const, status: "owner_bypass" as const };
    }

    const userLookup = await options.supabase.auth.admin.getUserById(options.userId);
    const metadata = (userLookup.data.user?.user_metadata || {}) as Record<string, unknown>;
    const requested = normalizeSignupAccountType(metadata.requestedAccountType)
        || DEFAULT_SIGNUP_ACCOUNT_TYPE;

    const { data: profileData } = await options.supabase
        .from("profiles")
        .select("account_type,display_name")
        .or(`id.eq.${options.userId},user_id.eq.${options.userId}`)
        .maybeSingle();
    const profileAccountType = String((profileData as { account_type?: string } | null)?.account_type || "listener");
    const displayName = options.displayName
        || String((profileData as { display_name?: string } | null)?.display_name || metadata.displayName || "").trim()
        || email.split("@")[0]
        || "Music Data Base user";

    const { createPendingCreatorAccessRequest, revokeUnapprovedCreatorPrivileges } = await import("@/lib/founding-invite-service");
    let member = await loadFoundingMemberByUserId(options.supabase, options.userId);
    const pendingCode = String(options.inviteCode || metadata.pendingInviteCode || "").trim();
    if (!member && pendingCode && requested !== "listener") {
        const redeemed = await redeemFoundingInvite({
            supabase: options.supabase,
            userId: options.userId,
            email,
            displayName,
            rawCode: pendingCode,
            accountType: requested,
        });
        if (redeemed.ok) {
            member = await loadFoundingMemberByUserId(options.supabase, options.userId);
            const cleanMeta = sanitizeAuthUserMetadata(metadata);
            delete cleanMeta.pendingInviteCode;
            const adminPatch = buildAuthUserMetadataAdminPatch(metadata, cleanMeta);
            await options.supabase.auth.admin.updateUserById(options.userId, {
                user_metadata: adminPatch,
            }).catch(() => undefined);
        }
    }

    if (requested !== "listener" && !member) {
        await createPendingCreatorAccessRequest({
            supabase: options.supabase,
            userId: options.userId,
            displayName,
            accountType: requested,
        });
        member = await loadFoundingMemberByUserId(options.supabase, options.userId);
    }

    if (!member || member.approval_status !== "approved") {
        if (normalizeResolvedAccountRole(profileAccountType) !== "listener") {
            await revokeUnapprovedCreatorPrivileges({
                supabase: options.supabase,
                userId: options.userId,
                displayName,
                requestedAccountType: requested,
            });
        }
        if (!member || requested === "listener") {
            return {
                ok: true as const,
                status: "listener" as const,
                requestedAccountType: requested,
                accountType: "listener",
            };
        }
        if (member.approval_status === "rejected") {
            return {
                ok: true as const,
                status: "rejected" as const,
                requestedAccountType: requested,
            };
        }
        return {
            ok: true as const,
            status: "pending_approval" as const,
            requestedAccountType: requested,
        };
    }

    const legalOk = await hasCompletedSignupLegalForAccountType(options.userId, requested);
    if (!legalOk) {
        return {
            ok: true as const,
            status: "needs_legal" as const,
            requestedAccountType: requested,
        };
    }

    const applied = await applySignupAccountTypeGrants({
        supabase: options.supabase,
        userId: options.userId,
        accountType: requested,
        grantedBy: member.approved_by || undefined,
        displayName,
    });
    return {
        ok: true as const,
        status: applied.status === "legacy_preserved" ? "legacy_preserved" : "activated",
        requestedAccountType: requested,
        accountType: applied.accountType,
    };
}
