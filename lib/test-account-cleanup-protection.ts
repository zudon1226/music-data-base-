/**
 * Cleanup Center account-protection decisions.
 * Founding protection follows the invited cohort (invite_id), not every approved
 * founding_members row. Ordinary Artist/Producer/Listener signup reuses that table
 * as an app-access gate and must stay deletable when every other safeguard allows it.
 */

import { isFoundingCohortMemberRecord } from "./creator-self-signup";
import type { TestAccountReviewLabel } from "./test-account-cleanup";

export const APPROVED_FOUNDING_CLEANUP_BLOCK_REASON = "Approved founding artist/producer is protected";

export type CleanupFoundingRecord = {
    approval_status?: string | null;
    founding_role?: string | null;
    invite_id?: string | null;
    social_link?: string | null;
};

export type CleanupActivityCounts = {
    uploadsCount: number;
    playlistsCount: number;
    followersCount: number;
    purchasesCount: number;
    payoutsCount: number;
};

export type CleanupProtectionInput = {
    isPlatformOwner: boolean;
    isRecognizedRealUser: boolean;
    isAdminUser: boolean;
    profile?: { is_admin?: boolean | null; account_type?: string | null } | null;
    founding?: CleanupFoundingRecord | null;
    manualLabel: TestAccountReviewLabel | null;
    counts: CleanupActivityCounts;
};

/** Approved invited founding cohort only. Ordinary approved signup rows return null. */
export function foundingCleanupBlockReason(
    founding: CleanupFoundingRecord | null | undefined,
): string | null {
    if (!founding) return null;
    if (String(founding.approval_status || "").trim().toLowerCase() !== "approved") return null;
    if (!isFoundingCohortMemberRecord({
        invite_id: founding.invite_id ?? null,
        social_link: founding.social_link ?? null,
    })) {
        return null;
    }
    return APPROVED_FOUNDING_CLEANUP_BLOCK_REASON;
}

export function buildCleanupBlockReasons(input: CleanupProtectionInput) {
    const blockReasons: string[] = [];
    const counts = input.counts;

    if (input.isPlatformOwner) {
        blockReasons.push("Platform owner account is permanently protected");
    }
    if (input.isRecognizedRealUser) {
        blockReasons.push("Recognized real-user email is protected");
    }
    if (input.isAdminUser) {
        blockReasons.push("Admin account is protected");
    }
    if (input.profile?.is_admin || input.profile?.account_type === "admin") {
        blockReasons.push("Profile is marked as admin");
    }
    const foundingReason = foundingCleanupBlockReason(input.founding);
    if (foundingReason) {
        blockReasons.push(foundingReason);
    }
    if (input.manualLabel === "protected_real_user") {
        blockReasons.push("Manually marked as protected real user");
    }
    if (counts.uploadsCount > 0) {
        blockReasons.push(`Account owns ${counts.uploadsCount} upload(s)`);
    }
    if (counts.playlistsCount > 0) {
        blockReasons.push(`Account owns ${counts.playlistsCount} playlist(s)`);
    }
    if (counts.followersCount > 0) {
        blockReasons.push(`Account has ${counts.followersCount} follower/follow relationship(s)`);
    }
    if (counts.purchasesCount > 0) {
        blockReasons.push(`Account has ${counts.purchasesCount} purchase/preorder record(s)`);
    }
    if (counts.payoutsCount > 0) {
        blockReasons.push(`Account has ${counts.payoutsCount} payout record(s)`);
    }

    let protectedStatus = "Reviewable";
    if (blockReasons.length > 0) protectedStatus = "Protected";
    else if (input.manualLabel === "confirmed_test_account") protectedStatus = "Confirmed test account";
    else if (input.manualLabel === "needs_review") protectedStatus = "Needs review";

    return {
        isProtected: blockReasons.length > 0,
        blockReasons,
        protectedStatus,
    };
}
