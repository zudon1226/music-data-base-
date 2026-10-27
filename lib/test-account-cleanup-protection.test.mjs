/**
 * Cleanup Center founding-protection classification.
 * Run: node --import ./scripts/register-cleanup-protection-test.mjs lib/test-account-cleanup-protection.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
    APPROVED_FOUNDING_CLEANUP_BLOCK_REASON,
    buildCleanupBlockReasons,
    foundingCleanupBlockReason,
} from "./test-account-cleanup-protection.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const service = readFileSync(path.join(root, "lib/test-account-cleanup-service.ts"), "utf8");
const zeroActivity = {
    uploadsCount: 0,
    playlistsCount: 0,
    followersCount: 0,
    purchasesCount: 0,
    payoutsCount: 0,
};

function decision(overrides = {}) {
    return buildCleanupBlockReasons({
        isPlatformOwner: false,
        isRecognizedRealUser: false,
        isAdminUser: false,
        profile: { is_admin: false, account_type: "artist" },
        founding: null,
        manualLabel: null,
        counts: zeroActivity,
        ...overrides,
    });
}

const invitedFoundingArtist = {
    approval_status: "approved",
    founding_role: "founding_artist",
    invite_id: "11111111-1111-4111-8111-111111111111",
    social_link: "mdb_signup_account_type=artist",
};

const ordinaryArtist = {
    approval_status: "approved",
    founding_role: "founding_artist",
    invite_id: null,
    social_link: "mdb_signup_account_type=artist",
};

const ordinaryProducer = {
    approval_status: "approved",
    founding_role: "founding_producer",
    invite_id: null,
    social_link: "mdb_signup_account_type=producer",
};

const listenerAccess = {
    approval_status: "approved",
    founding_role: "founding_artist",
    invite_id: null,
    social_link: "mdb_signup_account_type=listener",
};

assert.equal(foundingCleanupBlockReason(invitedFoundingArtist), APPROVED_FOUNDING_CLEANUP_BLOCK_REASON);
assert.equal(
    foundingCleanupBlockReason({
        ...invitedFoundingArtist,
        founding_role: "founding_producer",
        social_link: "mdb_signup_account_type=producer",
    }),
    APPROVED_FOUNDING_CLEANUP_BLOCK_REASON,
);
assert.equal(
    foundingCleanupBlockReason({
        ...invitedFoundingArtist,
        founding_role: "founding_podcaster",
        social_link: "https://example.com/founder",
    }),
    APPROVED_FOUNDING_CLEANUP_BLOCK_REASON,
);

assert.equal(foundingCleanupBlockReason(ordinaryArtist), null);
assert.equal(foundingCleanupBlockReason(ordinaryProducer), null);
assert.equal(foundingCleanupBlockReason({
    ...ordinaryArtist,
    social_link: "mdb_signup_account_type=artist_producer",
}), null);
assert.equal(foundingCleanupBlockReason(listenerAccess), null);
assert.equal(foundingCleanupBlockReason({
    ...invitedFoundingArtist,
    approval_status: "pending",
}), null);
assert.equal(foundingCleanupBlockReason({
    ...invitedFoundingArtist,
    approval_status: "rejected",
}), null);
assert.equal(foundingCleanupBlockReason(null), null);
assert.equal(foundingCleanupBlockReason({
    approval_status: "approved",
    founding_role: "founding_artist",
    invite_id: "",
    social_link: "mdb_signup_account_type=artist",
}), null);

const protectedFounding = decision({
    profile: { is_admin: false, account_type: "artist" },
    founding: invitedFoundingArtist,
    manualLabel: "confirmed_test_account",
});
assert.equal(protectedFounding.isProtected, true);
assert.deepEqual(protectedFounding.blockReasons, [APPROVED_FOUNDING_CLEANUP_BLOCK_REASON]);
assert.equal(protectedFounding.protectedStatus, "Protected");

const disposableArtist = decision({
    profile: { is_admin: false, account_type: "artist" },
    founding: ordinaryArtist,
    manualLabel: "confirmed_test_account",
});
assert.equal(disposableArtist.isProtected, false);
assert.deepEqual(disposableArtist.blockReasons, []);
assert.equal(disposableArtist.protectedStatus, "Confirmed test account");

const disposableListener = decision({
    profile: { is_admin: false, account_type: "listener" },
    founding: listenerAccess,
});
assert.equal(disposableListener.isProtected, false);
assert.deepEqual(disposableListener.blockReasons, []);

const disposableWithUploads = decision({
    founding: ordinaryProducer,
    counts: { ...zeroActivity, uploadsCount: 2 },
});
assert.equal(disposableWithUploads.isProtected, true);
assert.deepEqual(disposableWithUploads.blockReasons, ["Account owns 2 upload(s)"]);
assert.equal(disposableWithUploads.blockReasons.includes(APPROVED_FOUNDING_CLEANUP_BLOCK_REASON), false);

const foundingWithActivity = decision({
    founding: invitedFoundingArtist,
    counts: { ...zeroActivity, playlistsCount: 1, payoutsCount: 1 },
});
assert.equal(foundingWithActivity.isProtected, true);
assert.ok(foundingWithActivity.blockReasons.includes(APPROVED_FOUNDING_CLEANUP_BLOCK_REASON));
assert.ok(foundingWithActivity.blockReasons.includes("Account owns 1 playlist(s)"));
assert.ok(foundingWithActivity.blockReasons.includes("Account has 1 payout record(s)"));

const ownerStillProtected = decision({
    isPlatformOwner: true,
    isRecognizedRealUser: true,
    founding: ordinaryArtist,
});
assert.equal(ownerStillProtected.isProtected, true);
assert.ok(ownerStillProtected.blockReasons.includes("Platform owner account is permanently protected"));
assert.equal(ownerStillProtected.blockReasons.includes(APPROVED_FOUNDING_CLEANUP_BLOCK_REASON), false);

const manualRealUser = decision({
    founding: listenerAccess,
    manualLabel: "protected_real_user",
});
assert.deepEqual(manualRealUser.blockReasons, ["Manually marked as protected real user"]);

const adminStillProtected = decision({
    isAdminUser: true,
    profile: { is_admin: true, account_type: "admin" },
    founding: ordinaryProducer,
});
assert.ok(adminStillProtected.blockReasons.includes("Admin account is protected"));
assert.ok(adminStillProtected.blockReasons.includes("Profile is marked as admin"));
assert.equal(adminStillProtected.blockReasons.includes(APPROVED_FOUNDING_CLEANUP_BLOCK_REASON), false);

assert.match(service, /buildCleanupBlockReasons\(/);
assert.match(service, /invite_id,social_link/);
assert.equal(service.includes('if (founding?.approval_status === "approved")'), false);
assert.match(service, /Approved invited founding artists and producers are protected/);
assert.match(
    readFileSync(path.join(root, "lib/test-account-cleanup-protection.ts"), "utf8"),
    /isFoundingCohortMemberRecord/,
);

console.log("PASS cleanup founding protection classification");
