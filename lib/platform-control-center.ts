export type PlatformHealthLabel = "Healthy" | "Warning" | "Needs attention";

export type PlatformHealthItem = {
    id: string;
    label: string;
    status: PlatformHealthLabel;
    detail: string;
};

export type PlatformOverviewStats = {
    totalUsers: number;
    approvedUsers: number;
    pendingUsers: number;
    rejectedUsers: number;
    artists: number;
    producers: number;
    totalSongs: number;
    totalVideos: number;
    totalRingtones: number;
    totalPlaylists: number;
    totalAlbums: number;
    musicDownloads: number;
    videoDownloads: number;
    ringtoneDownloads: number;
    albumDownloads: number;
    totalMusicPlays: number;
    totalVideoViews: number;
    totalLikes: number;
    totalFollowers: number;
};

export type PlatformActivityItem = {
    id: string;
    kind: string;
    title: string;
    detail: string;
    createdAt: string;
};

export type PlatformControlCenterSnapshot = {
    checkedAt: string;
    overview: PlatformOverviewStats;
    health: PlatformHealthItem[];
    activity: {
        latestSignups: PlatformActivityItem[];
        latestUploads: PlatformActivityItem[];
        latestDeletions: PlatformActivityItem[];
        recentFailedUploads: PlatformActivityItem[];
        recentAuthErrors: PlatformActivityItem[];
        recentStorageErrors: PlatformActivityItem[];
        recentOwnerActions: PlatformActivityItem[];
    };
    flaggedUploadCount: number;
};

export function healthLabelClass(status: PlatformHealthLabel) {
    if (status === "Healthy") return "control-health-healthy";
    if (status === "Warning") return "control-health-warning";
    return "control-health-attention";
}
