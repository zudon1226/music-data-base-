/**
 * Artist Studio / Producer Studio upload context helpers.
 * Presentation-only — upload validation and storage stay in page handlers/APIs.
 */

export type CreatorStudioKind = "artist" | "producer" | "video";

export type CreatorStudioUploadMode =
    | "song"
    | "video"
    | "beat"
    | "instrumental"
    | "producerVideo"
    | "album"
    | "producerAlbum";

export type CreatorStudioModeTab = {
    mode: CreatorStudioUploadMode;
    labelKey:
        | "upload.uploadSong"
        | "upload.uploadVideo"
        | "upload.uploadAlbum"
        | "upload.uploadBeat"
        | "upload.uploadInstrumental"
        | "upload.uploadProducerVideo"
        | "upload.uploadProducerAlbum";
};

export const ARTIST_STUDIO_UPLOAD_MODES: CreatorStudioModeTab[] = [
    { mode: "song", labelKey: "upload.uploadSong" },
    { mode: "video", labelKey: "upload.uploadVideo" },
    { mode: "album", labelKey: "upload.uploadAlbum" },
];

export const VIDEO_CREATOR_STUDIO_UPLOAD_MODES: CreatorStudioModeTab[] = [
    { mode: "video", labelKey: "upload.uploadVideo" },
];

export const PRODUCER_STUDIO_UPLOAD_MODES: CreatorStudioModeTab[] = [
    { mode: "song", labelKey: "upload.uploadSong" },
    { mode: "beat", labelKey: "upload.uploadBeat" },
    { mode: "instrumental", labelKey: "upload.uploadInstrumental" },
    { mode: "producerVideo", labelKey: "upload.uploadProducerVideo" },
    { mode: "producerAlbum", labelKey: "upload.uploadProducerAlbum" },
];

export function uploadModesForStudio(studio: CreatorStudioKind): CreatorStudioModeTab[] {
    if (studio === "video") return VIDEO_CREATOR_STUDIO_UPLOAD_MODES;
    return studio === "producer" ? PRODUCER_STUDIO_UPLOAD_MODES : ARTIST_STUDIO_UPLOAD_MODES;
}

export function defaultUploadModeForStudio(studio: CreatorStudioKind): CreatorStudioUploadMode {
    if (studio === "video") return "video";
    return studio === "producer" ? "beat" : "song";
}

export function resolveCreatorStudio(input: {
    preferStudio?: CreatorStudioKind | null;
    canArtistDashboard: boolean;
    canProducerDashboard: boolean;
    canCreatorDashboard?: boolean;
    view?: string;
}): CreatorStudioKind {
    if (input.view === "Creator Dashboard" && input.canCreatorDashboard) return "video";
    if (input.view === "Producer Dashboard" && input.canProducerDashboard) return "producer";
    if (input.view === "Artist Dashboard" && input.canArtistDashboard) return "artist";
    if (
        input.canCreatorDashboard
        && !input.canArtistDashboard
        && !input.canProducerDashboard
    ) {
        return "video";
    }
    if (input.preferStudio === "video" && input.canCreatorDashboard) return "video";
    if (input.preferStudio === "producer" && input.canProducerDashboard) return "producer";
    if (input.preferStudio === "artist" && input.canArtistDashboard) return "artist";
    if (input.canProducerDashboard && !input.canArtistDashboard) return "producer";
    return "artist";
}

export function isBeatLikeUploadMode(mode: CreatorStudioUploadMode): boolean {
    return mode === "beat" || mode === "instrumental";
}

export function isAlbumUploadMode(mode: CreatorStudioUploadMode): boolean {
    return mode === "album" || mode === "producerAlbum";
}

export function isVideoUploadMode(mode: CreatorStudioUploadMode): boolean {
    return mode === "video" || mode === "producerVideo";
}
