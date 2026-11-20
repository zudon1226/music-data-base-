import type { MixtapeTrack } from "@/lib/mixtape-types";

export type MixtapePlaybackSong = {
    id: string;
    title: string;
    artist: string;
    category: string;
    type: string;
    time: string;
    plays: number;
    likes: number;
    uploaded: string;
    cover: string;
    avatar: string;
    audio: string;
    audioPath?: string;
    ownerId?: string;
    mixtapeId?: string;
};

function formatMixtapeTime(durationSeconds?: number | null) {
    const total = Math.max(0, Math.floor(Number(durationSeconds) || 0));
    const minutes = Math.floor(total / 60);
    const seconds = total % 60;
    return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/** Map a published mixtape track into the global audio engine song shape. */
export function mixtapeTrackToPlaybackSong(track: MixtapeTrack, playableUrl: string): MixtapePlaybackSong {
    const cover = String(track.coverImageUrl || "").trim();
    return {
        id: track.id,
        title: track.title,
        artist: track.creatorName || track.mixtapeTitle || "Mixtape",
        category: "Mixtape",
        type: "Mixtape",
        time: formatMixtapeTime(track.durationSeconds),
        plays: Number(track.playCount) || 0,
        likes: 0,
        uploaded: track.publishedAt || track.createdAt || "",
        cover,
        avatar: cover,
        audio: playableUrl,
        audioPath: track.storagePath,
        ownerId: track.userId,
        mixtapeId: track.mixtapeId,
    };
}