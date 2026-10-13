/**
 * Trusted signup account type — server records intent in founding_members.social_link
 * and signup legal acceptances. Auth user_metadata alone must not grant creator activation.
 */

import { loadFoundingMemberByUserId } from "@/lib/founding-access";
import { isSelfServeCreatorSignupType } from "@/lib/creator-self-signup";
import { listUserLegalAcceptances } from "@/lib/legal-acceptance-service";
import { LEGAL_POLICY_VERSION, signupRequiresCreatorUploadAgreement } from "@/lib/legal-policies";
import {
    decodeSignupAccountTypeMarker,
    encodeSignupAccountTypeMarker,
    normalizeSignupAccountType,
    type SignupAccountType,
    DEFAULT_SIGNUP_ACCOUNT_TYPE,
} from "@/lib/signup-account-type";
import type { SupabaseClient } from "@supabase/supabase-js";

export const LISTENER_SIGNUP_ACCOUNT_TYPE_LOCKED_MESSAGE =
    "This account registered as a Listener. Creator access requires a separate Artist or Producer signup.";

export const SIGNUP_ACCOUNT_TYPE_MISMATCH_MESSAGE =
    "Signup account type cannot be changed after registration legal acceptance.";

function foundingRoleForSignupAccountType(accountType: SignupAccountType) {
    if (accountType === "podcaster") return "founding_podcaster" as const;
    return accountType === "producer" ? "founding_producer" as const : "founding_artist" as const;
}

export function inferListenerOnlySignupFromAcceptanceRows(
    acceptances: Array<{ policy_type?: string; policy_version?: string }>,
) {
    const version = LEGAL_POLICY_VERSION;
    const types = new Set(
        acceptances
            .filter((row) => String(row.policy_version || "") === version)
            .map((row) => String(row.policy_type || "").trim()),
    );
    const hasTerms = types.has("terms");
    const hasPrivacy = types.has("privacy");
    const hasCreatorUpload = types.has("creator_upload");
    return hasTerms && hasPrivacy && !hasCreatorUpload;
}

export async function inferListenerOnlySignupFromLegal(userId: string) {
    const acceptances = await listUserLegalAcceptances(userId);
    return inferListenerOnlySignupFromAcceptanceRows(acceptances);
}

export function trustedSignupAccountTypeFromMember(
    member: { social_link?: string | null } | null | undefined,
): SignupAccountType | null {
    return decodeSignupAccountTypeMarker(member?.social_link);
}

export async function resolveTrustedSignupAccountType(options: {
    supabase: SupabaseClient;
    userId: string;
    member?: { social_link?: string | null; invite_id?: string | null } | null;
    metadataRequestedAccountType?: unknown;
}): Promise<SignupAccountType> {
    const member = options.member
        ?? await loadFoundingMemberByUserId(options.supabase, options.userId);
    const fromMarker = trustedSignupAccountTypeFromMember(member);
    if (fromMarker) {
        return fromMarker;
    }

    if (await inferListenerOnlySignupFromLegal(options.userId)) {
        return "listener";
    }

    const metadataType = normalizeSignupAccountType(options.metadataRequestedAccountType);
    if (metadataType && signupRequiresCreatorUploadAgreement(metadataType)) {
        return DEFAULT_SIGNUP_ACCOUNT_TYPE;
    }

    return metadataType || DEFAULT_SIGNUP_ACCOUNT_TYPE;
}

export async function assertSignupAccountTypeRegistrationAllowed(input: {
    supabase: SupabaseClient;
    userId: string;
    accountType: SignupAccountType;
}) {
    const member = await loadFoundingMemberByUserId(input.supabase, input.userId);
    const lockedMarker = trustedSignupAccountTypeFromMember(member);
    if (lockedMarker && lockedMarker !== input.accountType) {
        return {
            ok: false as const,
            status: 403,
            error: SIGNUP_ACCOUNT_TYPE_MISMATCH_MESSAGE,
        };
    }

    if (!lockedMarker && await inferListenerOnlySignupFromLegal(input.userId)) {
        if (input.accountType !== "listener") {
            return {
                ok: false as const,
                status: 403,
                error: LISTENER_SIGNUP_ACCOUNT_TYPE_LOCKED_MESSAGE,
            };
        }
    }

    const { data: profileData } = await input.supabase
        .from("profiles")
        .select("account_type")
        .or(`id.eq.${input.userId},user_id.eq.${input.userId}`)
        .maybeSingle();
    const profileType = normalizeResolvedAccountRoleSafe(
        (profileData as { account_type?: string } | null)?.account_type,
    );
    if (
        profileType === "listener"
        && input.accountType !== "listener"
        && (await inferListenerOnlySignupFromLegal(input.userId))
    ) {
        return {
            ok: false as const,
            status: 403,
            error: LISTENER_SIGNUP_ACCOUNT_TYPE_LOCKED_MESSAGE,
        };
    }

    return { ok: true as const };
}

function normalizeResolvedAccountRoleSafe(value: unknown) {
    const normalized = String(value || "").trim().toLowerCase();
    if (normalized === "admin") return "admin";
    if (["artist", "founding_artist", "artist_pro", "creator"].includes(normalized)) return "artist";
    if (["producer", "founding_producer", "producer_pro"].includes(normalized)) return "producer";
    if (["podcaster", "founding_podcaster"].includes(normalized)) return "podcaster";
    return "listener";
}

/** Persist immutable signup intent for creator/podcaster (not Listener). */
export async function lockSignupAccountTypeAtRegistration(options: {
    supabase: SupabaseClient;
    userId: string;
    accountType: SignupAccountType;
    displayName?: string;
}) {
    if (options.accountType === "listener") {
        return { ok: true as const, locked: false as const };
    }

    const existing = await loadFoundingMemberByUserId(options.supabase, options.userId);
    const marker = encodeSignupAccountTypeMarker(options.accountType);
    if (existing) {
        const current = trustedSignupAccountTypeFromMember(existing);
        if (current && current !== options.accountType) {
            return {
                ok: false as const,
                status: 403,
                error: SIGNUP_ACCOUNT_TYPE_MISMATCH_MESSAGE,
            };
        }
        if (current === options.accountType) {
            return { ok: true as const, locked: true as const };
        }
        const now = new Date().toISOString();
        const update = await options.supabase
            .from("founding_members")
            .update({
                social_link: marker,
                updated_at: now,
            })
            .eq("user_id", options.userId)
            .select("user_id")
            .maybeSingle();
        if (update.error) throw update.error;
        return { ok: true as const, locked: true as const };
    }

    const now = new Date().toISOString();
    const insert = await options.supabase
        .from("founding_members")
        .insert({
            user_id: options.userId,
            founding_role: foundingRoleForSignupAccountType(options.accountType),
            approval_status: "pending",
            invite_id: null,
            display_name: String(options.displayName || "").trim() || null,
            social_link: marker,
            joined_at: now,
            updated_at: now,
        })
        .select("user_id")
        .maybeSingle();
    if (insert.error) {
        return { ok: false as const, status: 400, error: insert.error.message };
    }
    return { ok: true as const, locked: true as const };
}

export function metadataClaimsCreatorEscalation(
    trusted: SignupAccountType,
    metadataRequested: unknown,
) {
    const meta = normalizeSignupAccountType(metadataRequested);
    if (!meta || meta === "listener") return false;
    if (trusted === "listener" && isSelfServeCreatorSignupType(meta)) return true;
    if (trusted !== meta && signupRequiresCreatorUploadAgreement(meta)) return true;
    return false;
}
