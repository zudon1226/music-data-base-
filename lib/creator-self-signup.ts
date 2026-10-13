/**
 * Artist / Producer self-signup (beta access) — no schema changes.
 * Reuses founding_members.approval_status as a technical gate; founding cohort = invite_id set.
 */

import type { FoundingMemberRecord } from "@/lib/founding-onboarding";
import { parseTruthyFlag } from "@/lib/founding-onboarding";
import {
    decodeSignupAccountTypeMarker,
    normalizeSignupAccountType,
    signupAccountTypeLabel,
    type SignupAccountType,
} from "@/lib/signup-account-type";

export const CREATOR_SELF_SIGNUP_ENV = "NEXT_PUBLIC_CREATOR_SELF_SIGNUP_ENABLED";

export const SELF_SERVE_CREATOR_SIGNUP_TYPES = ["artist", "producer", "artist_producer"] as const;

export type SelfServeCreatorSignupType = (typeof SELF_SERVE_CREATOR_SIGNUP_TYPES)[number];

export function isCreatorSelfSignupEnabled() {
    return parseTruthyFlag(process.env.NEXT_PUBLIC_CREATOR_SELF_SIGNUP_ENABLED);
}

export function isSelfServeCreatorSignupType(value: unknown): value is SelfServeCreatorSignupType {
    const normalized = normalizeSignupAccountType(value);
    return (SELF_SERVE_CREATOR_SIGNUP_TYPES as readonly string[]).includes(String(normalized || ""));
}

export function creatorBetaAccessBadgeLabel(accountType: SignupAccountType): string {
    if (accountType === "producer") {
        return "Producer — Beta Access";
    }
    if (accountType === "artist_producer") {
        return "Artist & Producer — Beta Access";
    }
    if (accountType === "artist") {
        return "Artist — Beta Access";
    }
    return "Beta Access";
}

export function isListenerAccessMember(member: Pick<FoundingMemberRecord, "social_link"> | null | undefined) {
    return decodeSignupAccountTypeMarker(member?.social_link) === "listener";
}

/** Invited founding cohort (Founding Member UX, admin lists, founding profile card). */
export function isFoundingCohortMemberRecord(
    member: Pick<FoundingMemberRecord, "invite_id" | "social_link"> | null | undefined,
) {
    if (!member) return false;
    if (isListenerAccessMember(member)) return false;
    return Boolean(member.invite_id);
}

/** Self-serve creator beta gate row — approved access without founding cohort designation. */
export function isBetaAccessCreatorRecord(
    member: Pick<FoundingMemberRecord, "invite_id" | "social_link" | "approval_status" | "badge_label"> | null | undefined,
) {
    if (!member || member.approval_status !== "approved") return false;
    if (isFoundingCohortMemberRecord(member)) return false;
    if (isListenerAccessMember(member)) return false;
    const requested = decodeSignupAccountTypeMarker(member.social_link);
    if (requested && isSelfServeCreatorSignupType(requested)) {
        return true;
    }
    const badge = String(member.badge_label || "").trim();
    return badge.endsWith("— Beta Access");
}

export function resolveBetaAccessDisplayLabel(
    member: Pick<FoundingMemberRecord, "social_link" | "badge_label"> | null | undefined,
): string | null {
    if (!member) return null;
    const badge = String(member.badge_label || "").trim();
    if (badge.endsWith("— Beta Access")) {
        return badge;
    }
    const requested = decodeSignupAccountTypeMarker(member.social_link);
    if (requested && isSelfServeCreatorSignupType(requested)) {
        return creatorBetaAccessBadgeLabel(requested);
    }
    return null;
}

export function shouldCountAsFoundingCohortMember(
    member: Pick<FoundingMemberRecord, "invite_id" | "social_link" | "approval_status"> | null | undefined,
) {
    if (!member || member.approval_status !== "approved") {
        return member?.approval_status === "pending" && Boolean(member.invite_id);
    }
    return isFoundingCohortMemberRecord(member);
}

export function foundingCohortRoleLabel(
    member: Pick<FoundingMemberRecord, "social_link"> | null | undefined,
    fallback: string,
) {
    const requested = decodeSignupAccountTypeMarker(member?.social_link);
    if (requested && requested !== "listener") {
        return signupAccountTypeLabel(requested);
    }
    return fallback;
}
