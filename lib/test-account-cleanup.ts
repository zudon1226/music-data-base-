export type TestAccountReviewLabel = "protected_real_user" | "confirmed_test_account" | "needs_review";

export type TestConfidenceLevel = "High" | "Medium" | "Low";

export type TestAccountReviewRow = {
    userId: string;
    displayName: string;
    email: string;
    createdAt: string;
    confirmedAt: string | null;
    lastSignInAt: string | null;
    role: string;
    approvalStatus: string | null;
    uploadsCount: number;
    playlistsCount: number;
    followersCount: number;
    testConfidence: TestConfidenceLevel;
    flagReasons: string[];
    protectedStatus: string;
    isProtected: boolean;
    manualLabel: TestAccountReviewLabel | null;
    blockReasons: string[];
};

export type TestAccountDependencyPreview = {
    authUser: {
        id: string;
        email: string;
        createdAt: string;
        lastSignInAt: string | null;
    };
    profileRows: number;
    foundingMember: boolean;
    userRoles: number;
    playlists: number;
    playlistItems: number;
    songsOwned: number;
    videosOwned: number;
    albumsOwned: number;
    songLikes: number;
    videoLikes: number;
    artistFollows: number;
    librarySaves: number;
    queueItems: number;
    salesCartItems: number;
    marketplacePreorders: number;
    payouts: number;
    privateStorageObjects: number;
    blockReasons: string[];
    safeToDelete: boolean;
    wouldDeleteAuthUser: boolean;
};

export type TestAccountCleanupActionResult = {
    ok: boolean;
    action: "dry_run" | "delete" | "set_label";
    targetUserId: string;
    preview?: TestAccountDependencyPreview;
    message: string;
    logId?: string;
};

export type TestAccountReviewList = {
    checkedAt: string;
    accounts: TestAccountReviewRow[];
    watchlistMatches: number;
};

export function testConfidenceClass(level: TestConfidenceLevel) {
    if (level === "High") return "cleanup-confidence-high";
    if (level === "Medium") return "cleanup-confidence-medium";
    return "cleanup-confidence-low";
}
