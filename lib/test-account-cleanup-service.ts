import type { SupabaseClient, User } from "@supabase/supabase-js";
import { isAdminUserId } from "@/lib/admin-auth";
import type {
    TestAccountCleanupActionResult,
    TestAccountDependencyPreview,
    TestAccountReviewLabel,
    TestAccountReviewList,
    TestAccountReviewRow,
    TestConfidenceLevel,
} from "@/lib/test-account-cleanup";
import { getErrorMessage, isPlatformOwnerEmail, PLATFORM_OWNER_EMAIL, safeSelect } from "@/lib/server-supabase";

const TEST_EMAIL_PREFIXES = [
    "browser-probe-",
    "sweep-",
    "verify",
    "diag-",
    "dbg-",
    "vidsave-",
    "desktop.pipeline.test",
    "prod-smoke-",
    "probe-",
    "control-center-probe-",
    "founding-probe-",
    "cleanup-probe-",
];

const TEST_DISPLAY_NAME_PATTERNS = [
    /^sweep probe$/i,
    /^verify$/i,
    /^browser probe$/i,
    /diagnostic/i,
    /\btest probe\b/i,
    /\bprobe user\b/i,
];

const TEMPORARY_EMAIL_DOMAINS = [
    "probe.local",
    "example.com",
    "test.local",
];

const WATCHLIST_EMAILS = [
    "xegoxal867@dysonc.com",
];

const RECOGNIZED_REAL_USER_EMAILS = new Set([
    PLATFORM_OWNER_EMAIL,
]);

type AuthUserRecord = {
    id: string;
    email: string;
    createdAt: string;
    confirmedAt: string | null;
    lastSignInAt: string | null;
    displayName: string;
};

type ProfileRecord = {
    id: string;
    user_id: string | null;
    display_name: string | null;
    account_type: string | null;
    is_admin: boolean | null;
};

type FoundingRecord = {
    user_id: string;
    approval_status: string;
    founding_role: string;
};

type LabelRecord = {
    user_id: string;
    label: TestAccountReviewLabel;
    notes: string | null;
};

type ActivityCounts = {
    uploadsCount: number;
    playlistsCount: number;
    followersCount: number;
    purchasesCount: number;
    payoutsCount: number;
};

function normalizeEmail(email: string) {
    return email.trim().toLowerCase();
}

function emailLocalPart(email: string) {
    return normalizeEmail(email).split("@")[0] || "";
}

function emailDomain(email: string) {
    return normalizeEmail(email).split("@")[1] || "";
}

function isWatchlistEmail(email: string) {
    return WATCHLIST_EMAILS.includes(normalizeEmail(email));
}

function hasTestEmailPrefix(email: string) {
    const local = emailLocalPart(email);
    return TEST_EMAIL_PREFIXES.some((prefix) => local.startsWith(prefix.toLowerCase()));
}

function hasTemporaryDomain(email: string) {
    const domain = emailDomain(email);
    return TEMPORARY_EMAIL_DOMAINS.some((item) => domain === item || domain.endsWith(`.${item}`));
}

function hasTestDisplayName(displayName: string) {
    const value = displayName.trim();
    if (!value) return false;
    return TEST_DISPLAY_NAME_PATTERNS.some((pattern) => pattern.test(value));
}

function hasRapidAuthTimestamps(user: AuthUserRecord) {
    const created = Date.parse(user.createdAt);
    const confirmed = user.confirmedAt ? Date.parse(user.confirmedAt) : NaN;
    const lastSignIn = user.lastSignInAt ? Date.parse(user.lastSignInAt) : NaN;
    if (Number.isNaN(created)) return false;
    const rapidWindowMs = 5 * 60 * 1000;
    const confirmedRapid = !Number.isNaN(confirmed) && Math.abs(confirmed - created) <= rapidWindowMs;
    const signInRapid = !Number.isNaN(lastSignIn) && Math.abs(lastSignIn - created) <= rapidWindowMs;
    return confirmedRapid && signInRapid;
}

function hasNoMeaningfulActivity(counts: ActivityCounts) {
    return counts.uploadsCount === 0
        && counts.playlistsCount === 0
        && counts.followersCount === 0
        && counts.purchasesCount === 0
        && counts.payoutsCount === 0;
}

function classifyConfidence(score: number, manualLabel: TestAccountReviewLabel | null): TestConfidenceLevel {
    if (manualLabel === "confirmed_test_account") return "High";
    if (score >= 5) return "High";
    if (score >= 3) return "Medium";
    return "Low";
}

function buildDetection(user: AuthUserRecord, manualLabel: TestAccountReviewLabel | null, counts: ActivityCounts) {
    const reasons: string[] = [];
    let score = 0;

    if (manualLabel === "confirmed_test_account") {
        reasons.push("Manually marked as confirmed test account");
        score += 5;
    }
    if (manualLabel === "needs_review") {
        reasons.push("Manually marked as needs review");
        score += 2;
    }
    if (isWatchlistEmail(user.email)) {
        reasons.push("On owner watchlist for manual review");
        score += 2;
    }
    if (hasTestEmailPrefix(user.email)) {
        reasons.push("Email matches automated test prefix");
        score += 3;
    }
    if (hasTemporaryDomain(user.email)) {
        reasons.push("Email uses a temporary test domain");
        score += 3;
    }
    if (hasTestDisplayName(user.displayName)) {
        reasons.push("Display name matches diagnostic/test naming");
        score += 2;
    }
    if (hasRapidAuthTimestamps(user)) {
        reasons.push("Account was created, confirmed, and signed in rapidly");
        score += 2;
    }
    if (hasNoMeaningfulActivity(counts)) {
        reasons.push("No meaningful uploads, playlists, followers, purchases, or payouts");
        score += 1;
    }

    return {
        reasons,
        score,
        confidence: classifyConfidence(score, manualLabel),
        flagged: score >= 1 || isWatchlistEmail(user.email) || manualLabel !== null,
    };
}

async function countRows(
    supabase: SupabaseClient,
    table: string,
    filters: Array<[string, "eq", string | number | boolean]> = [],
) {
    let query = supabase.from(table).select("*", { count: "exact", head: true });
    for (const [column, operator, value] of filters) {
        if (operator === "eq") query = query.eq(column, value);
    }
    const result = await query;
    if (result.error) return 0;
    return result.count || 0;
}

async function getActivityCounts(supabase: SupabaseClient, userId: string): Promise<ActivityCounts> {
    const [
        songsCount,
        videosCount,
        playlistsCount,
        artistFollowsCount,
        salesCartCount,
        preorderBuyerCount,
        preorderCreatorCount,
        payoutsCount,
    ] = await Promise.all([
        countRows(supabase, "songs", [["user_id", "eq", userId]]),
        countRows(supabase, "videos", [["user_id", "eq", userId]]),
        countRows(supabase, "playlists", [["user_id", "eq", userId]]),
        countRows(supabase, "artist_follows", [["user_id", "eq", userId]]),
        countRows(supabase, "sales_cart_items", [["user_id", "eq", userId]]),
        countRows(supabase, "marketplace_preorders", [["buyer_user_id", "eq", userId]]),
        countRows(supabase, "marketplace_preorders", [["creator_user_id", "eq", userId]]),
        countRows(supabase, "payouts", [["user_id", "eq", userId]]),
    ]);

    return {
        uploadsCount: songsCount + videosCount,
        playlistsCount,
        followersCount: artistFollowsCount,
        purchasesCount: salesCartCount + preorderBuyerCount + preorderCreatorCount,
        payoutsCount,
    };
}

async function loadAuthUsers(supabase: SupabaseClient, maxPages = 10) {
    const users: User[] = [];
    let page = 1;
    while (page <= maxPages) {
        const result = await supabase.auth.admin.listUsers({ page, perPage: 200 });
        if (result.error) throw result.error;
        users.push(...(result.data.users || []));
        if ((result.data.users || []).length < 200) break;
        page += 1;
    }
    return users;
}

function mapAuthUser(user: User, profile: ProfileRecord | undefined): AuthUserRecord {
    const metadata = (user.user_metadata || {}) as Record<string, unknown>;
    const appMetadata = (user.app_metadata || {}) as Record<string, unknown>;
    return {
        id: user.id,
        email: String(user.email || ""),
        createdAt: user.created_at || "",
        confirmedAt: user.confirmed_at || user.email_confirmed_at || null,
        lastSignInAt: user.last_sign_in_at || null,
        displayName: String(profile?.display_name || metadata.displayName || metadata.display_name || appMetadata.display_name || ""),
    };
}

async function evaluateProtection(
    supabase: SupabaseClient,
    user: AuthUserRecord,
    profile: ProfileRecord | undefined,
    founding: FoundingRecord | undefined,
    manualLabel: TestAccountReviewLabel | null,
    counts: ActivityCounts,
) {
    const blockReasons: string[] = [];

    if (isPlatformOwnerEmail(user.email)) {
        blockReasons.push("Platform owner account is permanently protected");
    }
    if (RECOGNIZED_REAL_USER_EMAILS.has(normalizeEmail(user.email))) {
        blockReasons.push("Recognized real-user email is protected");
    }
    if (await isAdminUserId(user.id)) {
        blockReasons.push("Admin account is protected");
    }
    if (profile?.is_admin || profile?.account_type === "admin") {
        blockReasons.push("Profile is marked as admin");
    }
    if (founding?.approval_status === "approved") {
        blockReasons.push("Approved founding artist/producer is protected");
    }
    if (manualLabel === "protected_real_user") {
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
    else if (manualLabel === "confirmed_test_account") protectedStatus = "Confirmed test account";
    else if (manualLabel === "needs_review") protectedStatus = "Needs review";

    return {
        isProtected: blockReasons.length > 0,
        blockReasons,
        protectedStatus,
    };
}

async function buildReviewRow(
    supabase: SupabaseClient,
    user: AuthUserRecord,
    profile: ProfileRecord | undefined,
    founding: FoundingRecord | undefined,
    manualLabel: TestAccountReviewLabel | null,
): Promise<TestAccountReviewRow | null> {
    const counts = await getActivityCounts(supabase, user.id);
    const detection = buildDetection(user, manualLabel, counts);
    if (!detection.flagged) return null;

    const protection = await evaluateProtection(supabase, user, profile, founding, manualLabel, counts);

    return {
        userId: user.id,
        displayName: user.displayName || profile?.display_name || "Unknown user",
        email: user.email,
        createdAt: user.createdAt,
        confirmedAt: user.confirmedAt,
        lastSignInAt: user.lastSignInAt,
        role: profile?.account_type || founding?.founding_role || "listener",
        approvalStatus: founding?.approval_status || null,
        uploadsCount: counts.uploadsCount,
        playlistsCount: counts.playlistsCount,
        followersCount: counts.followersCount,
        testConfidence: detection.confidence,
        flagReasons: detection.reasons,
        protectedStatus: protection.protectedStatus,
        isProtected: protection.isProtected,
        manualLabel,
        blockReasons: protection.blockReasons,
    };
}

export async function listTestAccountReviewAccounts(supabase: SupabaseClient): Promise<TestAccountReviewList> {
    const [profiles, foundingMembers, labels, authUsers] = await Promise.all([
        safeSelect<ProfileRecord>(supabase.from("profiles").select("id,user_id,display_name,account_type,is_admin")),
        safeSelect<FoundingRecord>(supabase.from("founding_members").select("user_id,approval_status,founding_role")),
        safeSelect<LabelRecord>(supabase.from("test_account_review_labels").select("user_id,label,notes")),
        loadAuthUsers(supabase),
    ]);

    const profileByUserId = new Map<string, ProfileRecord>();
    for (const profile of profiles) {
        profileByUserId.set(String(profile.user_id || profile.id), profile);
    }
    const foundingByUserId = new Map(foundingMembers.map((row) => [row.user_id, row]));
    const labelByUserId = new Map(labels.map((row) => [row.user_id, row.label]));

    const watchlistEmails = new Set(WATCHLIST_EMAILS.map(normalizeEmail));
    const accounts: TestAccountReviewRow[] = [];

    for (const authUser of authUsers) {
        const mapped = mapAuthUser(authUser, profileByUserId.get(authUser.id));
        const row = await buildReviewRow(
            supabase,
            mapped,
            profileByUserId.get(authUser.id),
            foundingByUserId.get(authUser.id),
            labelByUserId.get(authUser.id) || null,
        );
        if (row) accounts.push(row);
    }

    accounts.sort((left, right) => {
        const confidenceRank = { High: 0, Medium: 1, Low: 2 };
        const leftRank = confidenceRank[left.testConfidence];
        const rightRank = confidenceRank[right.testConfidence];
        if (leftRank !== rightRank) return leftRank - rightRank;
        return Date.parse(right.createdAt || "0") - Date.parse(left.createdAt || "0");
    });

    return {
        checkedAt: new Date().toISOString(),
        accounts,
        watchlistMatches: accounts.filter((row) => watchlistEmails.has(normalizeEmail(row.email))).length,
    };
}

async function countPrivateStorageObjects(supabase: SupabaseClient, userId: string) {
    const buckets = ["licenses", "downloads", "user-media-queues"];
    let total = 0;
    for (const bucket of buckets) {
        const result = await supabase.storage.from(bucket).list(userId, { limit: 100 });
        if (!result.error && result.data) total += result.data.length;
    }
    return total;
}

export async function buildTestAccountDependencyPreview(
    supabase: SupabaseClient,
    targetUserId: string,
): Promise<TestAccountDependencyPreview> {
    const userResult = await supabase.auth.admin.getUserById(targetUserId);
    if (userResult.error || !userResult.data.user) {
        throw new Error("Target auth user was not found.");
    }

    const authUser = mapAuthUser(userResult.data.user, undefined);
    const [profileRows, foundingMember, userRoles, playlists, songsOwned, videosOwned, albumsOwned, songLikes, videoLikes, artistFollows, librarySaves, queueItems, salesCartItems, marketplacePreordersBuyer, marketplacePreordersCreator, payouts, privateStorageObjects, foundingRow, labelRows] = await Promise.all([
        countRows(supabase, "profiles", [["user_id", "eq", targetUserId]]),
        countRows(supabase, "founding_members", [["user_id", "eq", targetUserId]]),
        countRows(supabase, "user_roles", [["user_id", "eq", targetUserId]]),
        countRows(supabase, "playlists", [["user_id", "eq", targetUserId]]),
        countRows(supabase, "songs", [["user_id", "eq", targetUserId]]),
        countRows(supabase, "videos", [["user_id", "eq", targetUserId]]),
        countRows(supabase, "albums", [["user_id", "eq", targetUserId]]),
        countRows(supabase, "song_likes", [["user_id", "eq", targetUserId]]),
        countRows(supabase, "video_likes", [["user_id", "eq", targetUserId]]),
        countRows(supabase, "artist_follows", [["user_id", "eq", targetUserId]]),
        countRows(supabase, "library_saves", [["user_id", "eq", targetUserId]]),
        countRows(supabase, "user_media_queue_items", [["user_id", "eq", targetUserId]]),
        countRows(supabase, "sales_cart_items", [["user_id", "eq", targetUserId]]),
        countRows(supabase, "marketplace_preorders", [["buyer_user_id", "eq", targetUserId]]),
        countRows(supabase, "marketplace_preorders", [["creator_user_id", "eq", targetUserId]]),
        countRows(supabase, "payouts", [["user_id", "eq", targetUserId]]),
        countPrivateStorageObjects(supabase, targetUserId),
        safeSelect<FoundingRecord>(supabase.from("founding_members").select("user_id,approval_status,founding_role").eq("user_id", targetUserId).limit(1)),
        safeSelect<LabelRecord>(supabase.from("test_account_review_labels").select("user_id,label,notes").eq("user_id", targetUserId).limit(1)),
    ]);

    const playlistIdRows = await safeSelect<{ id: string }>(supabase.from("playlists").select("id").eq("user_id", targetUserId));
    let playlistItems = 0;
    if (playlistIdRows.length > 0) {
        const ids = playlistIdRows.map((row) => row.id);
        const itemsResult = await supabase.from("playlist_items").select("*", { count: "exact", head: true }).in("playlist_id", ids);
        playlistItems = itemsResult.error ? 0 : (itemsResult.count || 0);
    }

    const profile = await safeSelect<ProfileRecord>(supabase.from("profiles").select("id,user_id,display_name,account_type,is_admin").eq("user_id", targetUserId).limit(1));
    const counts: ActivityCounts = {
        uploadsCount: songsOwned + videosOwned,
        playlistsCount: playlists,
        followersCount: artistFollows,
        purchasesCount: salesCartItems + marketplacePreordersBuyer + marketplacePreordersCreator,
        payoutsCount: payouts,
    };
    const protection = await evaluateProtection(
        supabase,
        authUser,
        profile[0],
        foundingRow[0],
        labelRows[0]?.label || null,
        counts,
    );

    const preview: TestAccountDependencyPreview = {
        authUser: {
            id: authUser.id,
            email: authUser.email,
            createdAt: authUser.createdAt,
            lastSignInAt: authUser.lastSignInAt,
        },
        profileRows,
        foundingMember: foundingMember > 0,
        userRoles,
        playlists,
        playlistItems,
        songsOwned,
        videosOwned,
        albumsOwned,
        songLikes,
        videoLikes,
        artistFollows,
        librarySaves,
        queueItems,
        salesCartItems,
        marketplacePreorders: marketplacePreordersBuyer + marketplacePreordersCreator,
        payouts,
        privateStorageObjects,
        blockReasons: protection.blockReasons,
        safeToDelete: !protection.isProtected,
        wouldDeleteAuthUser: !protection.isProtected,
    };

    return preview;
}

async function writeCleanupLog(
    supabase: SupabaseClient,
    action: "dry_run" | "delete" | "set_label",
    targetUserId: string,
    ownerUserId: string,
    result: "success" | "blocked" | "failed",
    detail: Record<string, unknown>,
) {
    const insert = await supabase.from("test_account_cleanup_logs").insert({
        action,
        target_user_id: targetUserId,
        owner_user_id: ownerUserId,
        result,
        detail,
    }).select("id").maybeSingle();
    return insert.data?.id || "";
}

export async function runTestAccountDryRun(
    supabase: SupabaseClient,
    targetUserId: string,
    ownerUserId: string,
): Promise<TestAccountCleanupActionResult> {
    const preview = await buildTestAccountDependencyPreview(supabase, targetUserId);
    const logId = await writeCleanupLog(supabase, "dry_run", targetUserId, ownerUserId, preview.safeToDelete ? "success" : "blocked", {
        safeToDelete: preview.safeToDelete,
        blockReasons: preview.blockReasons,
    });
    return {
        ok: true,
        action: "dry_run",
        targetUserId,
        preview,
        message: preview.safeToDelete
            ? "Dry-run complete. Cleanup appears safe for this disposable account."
            : `Dry-run blocked: ${preview.blockReasons.join("; ")}`,
        logId,
    };
}

export async function deleteTestAccount(
    supabase: SupabaseClient,
    targetUserId: string,
    ownerUserId: string,
): Promise<TestAccountCleanupActionResult> {
    if (targetUserId === ownerUserId) {
        const logId = await writeCleanupLog(supabase, "delete", targetUserId, ownerUserId, "blocked", {
            reason: "Owner cannot delete their own account through cleanup center.",
        });
        return {
            ok: false,
            action: "delete",
            targetUserId,
            message: "Platform owner account cannot be deleted.",
            logId,
        };
    }

    const preview = await buildTestAccountDependencyPreview(supabase, targetUserId);
    if (!preview.safeToDelete) {
        const logId = await writeCleanupLog(supabase, "delete", targetUserId, ownerUserId, "blocked", {
            blockReasons: preview.blockReasons,
        });
        return {
            ok: false,
            action: "delete",
            targetUserId,
            preview,
            message: `Deletion blocked: ${preview.blockReasons.join("; ")}`,
            logId,
        };
    }

    try {
        const deleteResult = await supabase.auth.admin.deleteUser(targetUserId);
        if (deleteResult.error) {
            throw deleteResult.error;
        }
        const logId = await writeCleanupLog(supabase, "delete", targetUserId, ownerUserId, "success", {
            deletedAuthUserId: targetUserId,
            preview,
        });
        return {
            ok: true,
            action: "delete",
            targetUserId,
            preview,
            message: "Test account deleted successfully.",
            logId,
        };
    }
    catch (error) {
        const logId = await writeCleanupLog(supabase, "delete", targetUserId, ownerUserId, "failed", {
            error: getErrorMessage(error),
        });
        return {
            ok: false,
            action: "delete",
            targetUserId,
            preview,
            message: getErrorMessage(error),
            logId,
        };
    }
}

export async function setTestAccountReviewLabel(
    supabase: SupabaseClient,
    targetUserId: string,
    ownerUserId: string,
    label: TestAccountReviewLabel,
    notes = "",
): Promise<TestAccountCleanupActionResult> {
    const upsert = await supabase.from("test_account_review_labels").upsert({
        user_id: targetUserId,
        label,
        notes: notes.trim() || null,
        marked_by: ownerUserId,
        updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });
    if (upsert.error) {
        return {
            ok: false,
            action: "set_label",
            targetUserId,
            message: getErrorMessage(upsert.error),
        };
    }
    const logId = await writeCleanupLog(supabase, "set_label", targetUserId, ownerUserId, "success", {
        label,
        notes: notes.trim() || null,
    });
    return {
        ok: true,
        action: "set_label",
        targetUserId,
        message: `Saved review label: ${label}.`,
        logId,
    };
}

export function getTestAccountDetectionRules() {
    return {
        emailPrefixes: TEST_EMAIL_PREFIXES,
        displayNamePatterns: TEST_DISPLAY_NAME_PATTERNS.map((pattern) => String(pattern)),
        temporaryDomains: TEMPORARY_EMAIL_DOMAINS,
        watchlistEmails: WATCHLIST_EMAILS,
        recognizedRealUserEmails: [...RECOGNIZED_REAL_USER_EMAILS],
    };
}

export function getProtectedUserRules() {
    return [
        "Platform owner email is permanently protected",
        "Any admin account is protected",
        "Approved founding artists/producers are protected",
        "Manually marked protected real users are protected",
        "Accounts with uploads, playlists, followers, purchases, or payouts are protected",
        "Deletion requires dry-run safety and explicit owner confirmation",
    ];
}
