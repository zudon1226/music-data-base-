import type { SupabaseClient } from "@supabase/supabase-js";
import { EXPECTED_STORAGE_BUCKETS, REQUIRED_LAUNCH_TABLES } from "@/lib/launch-readiness";
import type {
    PlatformActivityItem,
    PlatformControlCenterSnapshot,
    PlatformHealthItem,
    PlatformHealthLabel,
    PlatformOverviewStats,
} from "@/lib/platform-control-center";
import { PUBLIC_RINGTONE_STATUSES } from "@/lib/ringtone-constants";
import { countOverviewRolesFromProfiles, type OverviewAuthSignal, type OverviewRoleCounts } from "@/lib/resolved-account-role";
import { getErrorMessage, getPublicSiteUrl } from "@/lib/server-supabase";

const EMPTY_OVERVIEW_ROLE_COUNTS: OverviewRoleCounts = {
    totalUsers: 0,
    listeners: 0,
    launchNotificationSignups: 0,
    artists: 0,
    producers: 0,
    admins: 0,
};

function healthStatus(ok: boolean, warning = false): PlatformHealthLabel {
    if (ok) return "Healthy";
    if (warning) return "Warning";
    return "Needs attention";
}

async function countRows(supabase: SupabaseClient, table: string, filters: Array<[string, string, unknown]> = []) {
    let query = supabase.from(table).select("*", { count: "exact", head: true });
    for (const [column, operator, value] of filters) {
        if (operator === "eq") query = query.eq(column, value);
        if (operator === "in") query = query.in(column, value as string[]);
        if (operator === "not_is") query = query.not(column, "is", value);
    }
    const result = await query;
    if (result.error) return { count: 0, error: getErrorMessage(result.error) };
    return { count: result.count || 0, error: "" };
}

async function loadOverviewRoleCounts(supabase: SupabaseClient): Promise<OverviewRoleCounts & { error: string }> {
    const pageSize = 1000;
    const profiles: Array<{ id?: string; user_id?: string; account_type?: string; is_admin?: boolean }> = [];
    let from = 0;
    while (true) {
        const page = await supabase
            .from("profiles")
            .select("id,user_id,account_type,is_admin")
            .range(from, from + pageSize - 1);
        if (page.error) {
            return { ...EMPTY_OVERVIEW_ROLE_COUNTS, error: getErrorMessage(page.error) };
        }
        const batch = page.data || [];
        profiles.push(...batch);
        if (batch.length < pageSize) break;
        from += pageSize;
    }

    const activeRoles: Array<{ user_id?: string; role?: string }> = [];
    from = 0;
    while (true) {
        const page = await supabase
            .from("user_roles")
            .select("user_id,role")
            .eq("status", "active")
            .range(from, from + pageSize - 1);
        if (page.error) {
            if (!/does not exist|schema cache/i.test(getErrorMessage(page.error))) {
                return { ...EMPTY_OVERVIEW_ROLE_COUNTS, error: getErrorMessage(page.error) };
            }
            break;
        }
        const batch = page.data || [];
        activeRoles.push(...batch);
        if (batch.length < pageSize) break;
        from += pageSize;
    }

    const foundingMembers: Array<{ user_id?: string; approval_status?: string; founding_role?: string }> = [];
    from = 0;
    while (true) {
        const page = await supabase
            .from("founding_members")
            .select("user_id,approval_status,founding_role")
            .range(from, from + pageSize - 1);
        if (page.error) {
            if (!/does not exist|schema cache/i.test(getErrorMessage(page.error))) {
                return { ...EMPTY_OVERVIEW_ROLE_COUNTS, error: getErrorMessage(page.error) };
            }
            break;
        }
        const batch = page.data || [];
        foundingMembers.push(...batch);
        if (batch.length < pageSize) break;
        from += pageSize;
    }

    const userIds = profiles.flatMap((profile) => [profile.id, profile.user_id].filter(Boolean) as string[]);
    const counted = countOverviewRolesFromProfiles(
        profiles,
        activeRoles,
        foundingMembers,
        await loadOverviewAuthSignals(supabase, userIds),
    );
    return { ...counted, error: "" };
}

async function loadOverviewAuthSignals(supabase: SupabaseClient, userIds: string[]): Promise<OverviewAuthSignal[]> {
    const uniqueIds = [...new Set(userIds.map((value) => String(value || "").trim()).filter(Boolean))];
    const signals: OverviewAuthSignal[] = [];
    await Promise.all(uniqueIds.map(async (userId) => {
        const listed = await supabase.auth.admin.getUserById(userId);
        const user = listed.data?.user;
        if (listed.error || !user) return;
        const metadata = (user.user_metadata || {}) as Record<string, unknown>;
        signals.push({
            user_id: user.id,
            requestedAccountType: metadata.requestedAccountType || metadata.requested_account_type,
            metadataRole: metadata.role,
        });
    }));
    return signals;
}

async function sumColumn(supabase: SupabaseClient, table: string, column: string) {
    const result = await supabase.from(table).select(column).limit(5000);
    if (result.error || !result.data) return 0;
    return result.data.reduce((sum, row) => {
        const record = row as unknown as Record<string, unknown>;
        return sum + Number(record[column] || 0);
    }, 0);
}

async function loadPodcastOverviewMetrics(supabase: SupabaseClient) {
    const [showsResult, episodesResult, audioEpisodesResult, videoEpisodesResult] = await Promise.all([
        countRows(supabase, "podcast_shows"),
        countRows(supabase, "podcast_episodes"),
        countRows(supabase, "podcast_episodes", [["episode_type", "eq", "audio"]]),
        countRows(supabase, "podcast_episodes", [["episode_type", "eq", "video"]]),
    ]);

    let totalPodcastAudioPlays = 0;
    let totalPodcastVideoViews = 0;
    const pageSize = 1000;
    let from = 0;
    for (;;) {
        const engagement = await supabase
            .from("podcast_episodes")
            .select("episode_type,play_count,view_count")
            .range(from, from + pageSize - 1);
        if (engagement.error || !engagement.data) break;
        for (const row of engagement.data) {
            const record = row as { episode_type?: string; play_count?: number | null; view_count?: number | null };
            const episodeType = String(record.episode_type || "");
            if (episodeType === "audio") {
                totalPodcastAudioPlays += Math.max(0, Number(record.play_count || 0));
            }
            if (episodeType === "video") {
                totalPodcastVideoViews += Math.max(0, Number(record.view_count || 0));
            }
        }
        if (engagement.data.length < pageSize) break;
        from += pageSize;
    }

    return {
        totalPodcastShows: showsResult.count,
        totalPodcastEpisodes: episodesResult.count,
        totalPodcastAudioEpisodes: audioEpisodesResult.count,
        totalPodcastVideoEpisodes: videoEpisodesResult.count,
        totalPodcastAudioPlays,
        totalPodcastVideoViews,
    };
}

/**
 * Platform-wide completed media downloads.
 * Canonical source: public.media_downloads (one row per user+content; re-downloads bump download_count).
 * Only delivery_status = 'delivered' rows are included.
 */
async function sumDeliveredMediaDownloadCounts(
    supabase: SupabaseClient,
    contentType: "music" | "video" | "album",
): Promise<{ total: number; error: string }> {
    const pageSize = 1000;
    let from = 0;
    let total = 0;
    for (;;) {
        const result = await supabase
            .from("media_downloads")
            .select("id,download_count")
            .eq("content_type", contentType)
            .eq("delivery_status", "delivered")
            .range(from, from + pageSize - 1);
        if (result.error) {
            return { total: 0, error: getErrorMessage(result.error) };
        }
        const rows = result.data || [];
        for (const row of rows) {
            const record = row as { download_count?: number | null };
            total += Math.max(0, Number(record.download_count ?? 1));
        }
        if (rows.length < pageSize) break;
        from += pageSize;
    }
    return { total, error: "" };
}

function toActivity(
    id: string,
    kind: string,
    title: string,
    detail: string,
    createdAt: string,
): PlatformActivityItem {
    return { id, kind, title, detail, createdAt };
}

export async function buildPlatformControlCenterSnapshot(supabase: SupabaseClient): Promise<PlatformControlCenterSnapshot> {
    const siteUrl = getPublicSiteUrl();
    const usesLocalhost = siteUrl.includes("localhost") || siteUrl.includes("127.0.0.1");
    const onVercel = Boolean(String(process.env.VERCEL || "").trim());
    const deployedCommitSha = (process.env.VERCEL_GIT_COMMIT_SHA || process.env.VERCEL_GIT_COMMIT_REF || "").trim().slice(0, 12);
    const deployedCommit = deployedCommitSha || (onVercel ? "not-deployed" : "local-workspace");

    const [
        roleCounts,
        approvedResult,
        pendingResult,
        rejectedResult,
        songsResult,
        videosResult,
        ringtonesResult,
        playlistsResult,
        albumsResult,
        songLikesResult,
        videoLikesResult,
        followersResult,
        queueItemsResult,
        deleteLogsResult,
        launchChecklistResult,
        platformErrorsResult,
        latestProfiles,
        latestSongs,
        latestVideos,
        deleteLogs,
        failedUploads,
        storageErrors,
        foundingMembersRecent,
        foundingInvitesRecent,
    ] = await Promise.all([
        loadOverviewRoleCounts(supabase),
        countRows(supabase, "founding_members", [["approval_status", "eq", "approved"]]),
        countRows(supabase, "founding_members", [["approval_status", "eq", "pending"]]),
        countRows(supabase, "founding_members", [["approval_status", "eq", "rejected"]]),
        countRows(supabase, "songs"),
        countRows(supabase, "videos"),
        countRows(supabase, "ringtone_products", [
            ["status", "in", [...PUBLIC_RINGTONE_STATUSES]],
            ["published_at", "not_is", null],
        ]),
        countRows(supabase, "playlists"),
        countRows(supabase, "albums"),
        countRows(supabase, "song_likes"),
        countRows(supabase, "video_likes"),
        countRows(supabase, "artist_follows"),
        countRows(supabase, "user_media_queue_items"),
        countRows(supabase, "storage_cleanup_delete_logs"),
        supabase.from("launch_checklist").select("area,status,details").eq("area", "Security/RLS audit").maybeSingle(),
        supabase.from("platform_errors").select("id,category,action,message,created_at,status").order("created_at", { ascending: false }).limit(40),
        supabase.from("profiles").select("id,display_name,account_type,created_at").order("created_at", { ascending: false }).limit(8),
        supabase.from("songs").select("id,title,artist,created_at,user_id").order("created_at", { ascending: false }).limit(8),
        supabase.from("videos").select("id,title,artist,created_at,user_id").order("created_at", { ascending: false }).limit(8),
        supabase.from("storage_cleanup_delete_logs").select("id,bucket,file_name,deleted_by,created_at").order("created_at", { ascending: false }).limit(8),
        supabase.from("platform_errors").select("id,category,action,message,created_at,status").eq("category", "upload").order("created_at", { ascending: false }).limit(8),
        supabase.from("platform_errors").select("id,category,action,message,created_at,status").eq("category", "storage").order("created_at", { ascending: false }).limit(8),
        supabase.from("founding_members").select("user_id,founding_role,approval_status,display_name,updated_at,approved_by,rejected_by").order("updated_at", { ascending: false }).limit(8),
        supabase.from("founding_invites").select("id,invite_code,status,intended_role,updated_at,created_by").order("updated_at", { ascending: false }).limit(8),
    ]);

    const [
        totalMusicPlays,
        totalVideoViews,
        musicDownloadsResult,
        videoDownloadsResult,
        albumDownloadsResult,
        ringtoneDownloadsResult,
        podcastOverview,
    ] = await Promise.all([
        sumColumn(supabase, "songs", "plays"),
        sumColumn(supabase, "videos", "views"),
        sumDeliveredMediaDownloadCounts(supabase, "music"),
        sumDeliveredMediaDownloadCounts(supabase, "video"),
        sumDeliveredMediaDownloadCounts(supabase, "album"),
        countRows(supabase, "ringtone_downloads"),
        loadPodcastOverviewMetrics(supabase),
    ]);

    const downloadQueryError = [
        musicDownloadsResult.error,
        videoDownloadsResult.error,
        albumDownloadsResult.error,
        ringtoneDownloadsResult.error,
    ].find(Boolean);
    if (downloadQueryError) {
        throw new Error(`Platform download metrics unavailable: ${downloadQueryError}`);
    }

    // Members = approved/full-access non-admin accounts only. Admins are separate.
    // Listeners = approved/full-access Listener members only.
    // Launch notification signups = notification-only registered accounts, not app members.
    // Artists/Producers = explicitly approved creators. Admins are separate.
    const overview: PlatformOverviewStats = {
        totalUsers: roleCounts.totalUsers,
        listeners: roleCounts.listeners,
        launchNotificationSignups: roleCounts.launchNotificationSignups,
        admins: roleCounts.admins,
        approvedUsers: approvedResult.count,
        pendingUsers: pendingResult.count,
        rejectedUsers: rejectedResult.count,
        artists: roleCounts.artists,
        producers: roleCounts.producers,
        totalSongs: songsResult.count,
        totalVideos: videosResult.count,
        totalRingtones: ringtonesResult.count,
        totalPlaylists: playlistsResult.count,
        totalAlbums: albumsResult.count,
        musicDownloads: musicDownloadsResult.total,
        videoDownloads: videoDownloadsResult.total,
        ringtoneDownloads: ringtoneDownloadsResult.count,
        albumDownloads: albumDownloadsResult.total,
        totalMusicPlays,
        totalVideoViews,
        totalLikes: songLikesResult.count + videoLikesResult.count,
        totalFollowers: followersResult.count,
        totalPodcastShows: podcastOverview.totalPodcastShows,
        totalPodcastEpisodes: podcastOverview.totalPodcastEpisodes,
        totalPodcastAudioEpisodes: podcastOverview.totalPodcastAudioEpisodes,
        totalPodcastVideoEpisodes: podcastOverview.totalPodcastVideoEpisodes,
        totalPodcastAudioPlays: podcastOverview.totalPodcastAudioPlays,
        totalPodcastVideoViews: podcastOverview.totalPodcastVideoViews,
    };

    let authOk = true;
    let authDetail = "Authentication service reachable.";
    try {
        const authProbe = await supabase.auth.admin.listUsers({ page: 1, perPage: 1 });
        if (authProbe.error) {
            authOk = false;
            authDetail = getErrorMessage(authProbe.error);
        }
    }
    catch (error) {
        authOk = false;
        authDetail = getErrorMessage(error);
    }

    const tableChecks = await Promise.all(REQUIRED_LAUNCH_TABLES.slice(0, 12).map(async (table) => {
        const result = await supabase.from(table).select("*", { count: "exact", head: true });
        return { table, ok: !result.error };
    }));
    const tablesOk = tableChecks.every((item) => item.ok);
    const bucketList = await supabase.storage.listBuckets();
    const bucketNames = new Set((bucketList.data || []).map((bucket) => bucket.name));
    const bucketsOk = EXPECTED_STORAGE_BUCKETS.every((name) => bucketNames.has(name));

    const rlsChecklist = launchChecklistResult.data as { status?: string; details?: string } | null;
    const rlsPassed = rlsChecklist?.status === "passed";
    const uploadErrors = (platformErrorsResult.data || []).filter((row) => String(row.category || "") === "upload");
    const uploadCompatibilityOk = uploadErrors.filter((row) => row.status !== "resolved").length < 5;

    const health: PlatformHealthItem[] = [
        {
            id: "supabase",
            label: "Supabase connection",
            status: healthStatus(!roleCounts.error),
            detail: roleCounts.error ? roleCounts.error : "Connected to production Supabase project.",
        },
        {
            id: "auth",
            label: "Authentication",
            status: healthStatus(authOk),
            detail: authDetail,
        },
        {
            id: "database",
            label: "Database",
            status: healthStatus(tablesOk, !tablesOk),
            detail: tablesOk ? "Core launch tables are reachable." : "One or more core tables failed probe queries.",
        },
        {
            id: "storage",
            label: "Storage",
            status: healthStatus(bucketsOk, !bucketsOk),
            detail: bucketsOk ? "Expected media buckets are present." : "Missing one or more expected storage buckets.",
        },
        {
            id: "vercel",
            label: "Vercel production URL",
            status: healthStatus(!usesLocalhost, usesLocalhost),
            detail: usesLocalhost ? "Site URL still points to localhost." : siteUrl,
        },
        {
            id: "commit",
            label: "Latest deployed commit",
            status: onVercel && deployedCommit === "not-deployed" ? "Warning" : "Healthy",
            detail: deployedCommit,
        },
        {
            id: "rls",
            label: "RLS status",
            status: rlsPassed ? "Healthy" : rlsChecklist ? "Warning" : "Needs attention",
            detail: rlsChecklist?.details || "Security/RLS audit checklist item not recorded yet.",
        },
        {
            id: "upload-compat",
            label: "Upload compatibility",
            status: uploadCompatibilityOk ? "Healthy" : "Needs attention",
            detail: uploadCompatibilityOk ? "Recent upload error volume is within expected bounds." : `${uploadErrors.length} recent upload errors logged.`,
        },
        {
            id: "queue",
            label: "Queue persistence",
            status: queueItemsResult.error ? "Needs attention" : "Healthy",
            detail: queueItemsResult.error ? queueItemsResult.error : `${queueItemsResult.count} persisted queue items tracked.`,
        },
        {
            id: "delete-lifecycle",
            label: "Delete lifecycle",
            status: deleteLogsResult.error ? "Warning" : "Healthy",
            detail: deleteLogsResult.error ? deleteLogsResult.error : `${deleteLogsResult.count} storage cleanup delete logs recorded.`,
        },
    ];

    const latestUploads = [
        ...(latestSongs.data || []).map((row) => toActivity(
            `song-${row.id}`,
            "upload",
            String(row.title || "Song upload"),
            String(row.artist || "Unknown artist"),
            String(row.created_at || ""),
        )),
        ...(latestVideos.data || []).map((row) => toActivity(
            `video-${row.id}`,
            "upload",
            String(row.title || "Video upload"),
            String(row.artist || "Unknown artist"),
            String(row.created_at || ""),
        )),
    ].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, 8);

    const authErrors = (platformErrorsResult.data || []).filter((row) => {
        const haystack = `${row.category || ""} ${row.action || ""} ${row.message || ""}`.toLowerCase();
        return haystack.includes("auth") || haystack.includes("session") || haystack.includes("login");
    }).slice(0, 8).map((row) => toActivity(
        String(row.id),
        "auth-error",
        String(row.action || row.category || "Auth error"),
        String(row.message || ""),
        String(row.created_at || ""),
    ));

    const ownerActions = [
        ...(foundingMembersRecent.data || []).filter((row) => row.approved_by || row.rejected_by).map((row) => toActivity(
            `member-${row.user_id}`,
            "founding-review",
            `${row.founding_role} ${row.approval_status}`,
            String(row.display_name || row.user_id || ""),
            String(row.updated_at || ""),
        )),
        ...(foundingInvitesRecent.data || []).filter((row) => row.status === "revoked" || row.status === "used").map((row) => toActivity(
            String(row.id),
            "founding-invite",
            `Invite ${row.status}`,
            `${row.intended_role} ${row.invite_code ? row.invite_code.slice(0, 8) : ""}`,
            String(row.updated_at || ""),
        )),
    ].slice(0, 8);

    return {
        checkedAt: new Date().toISOString(),
        overview,
        health,
        activity: {
            latestSignups: (latestProfiles.data || []).map((row) => toActivity(
                String(row.id),
                "signup",
                String(row.display_name || "New profile"),
                String(row.account_type || "listener"),
                String(row.created_at || ""),
            )),
            latestUploads,
            latestDeletions: (deleteLogs.data || []).map((row) => toActivity(
                String(row.id),
                "deletion",
                String(row.file_name || "Storage delete"),
                String(row.bucket || "storage"),
                String(row.created_at || ""),
            )),
            recentFailedUploads: (failedUploads.data || []).map((row) => toActivity(
                String(row.id),
                "failed-upload",
                String(row.action || "Upload failed"),
                String(row.message || ""),
                String(row.created_at || ""),
            )),
            recentAuthErrors: authErrors,
            recentStorageErrors: (storageErrors.data || []).map((row) => toActivity(
                String(row.id),
                "storage-error",
                String(row.action || "Storage error"),
                String(row.message || ""),
                String(row.created_at || ""),
            )),
            recentOwnerActions: ownerActions,
        },
        flaggedUploadCount: (failedUploads.data || []).filter((row) => row.status !== "resolved").length,
    };
}
