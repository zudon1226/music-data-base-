/** Client helper for paid-listener music/video downloads (one request per click). */

import type { Session } from "@supabase/supabase-js";
import { readAccessTokenFromSession } from "@/lib/client-api-auth";
import { PREMIUM_LISTENER_DOWNLOAD_REQUIRED_MESSAGE } from "@/lib/billing/listener-download-access";
import { parseFilenameFromContentDisposition } from "@/lib/media-download-filename";

export { PREMIUM_LISTENER_DOWNLOAD_REQUIRED_MESSAGE };

export type MediaDownloadKind = "music" | "video";

function authHeaders(session: Session | null | undefined) {
    const token = readAccessTokenFromSession(session);
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    return headers;
}

function triggerBrowserFileDownload(blob: Blob, filename: string) {
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = filename;
    anchor.rel = "noopener";
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
}

export async function downloadAuthorizedMediaFile(input: {
    kind: MediaDownloadKind;
    contentId: string;
    userId: string;
    session: Session | null;
}) {
    const path = input.kind === "music"
        ? `/api/songs/${encodeURIComponent(input.contentId)}/download`
        : `/api/videos/${encodeURIComponent(input.contentId)}/download`;

    const response = await fetch(path, {
        method: "POST",
        headers: authHeaders(input.session),
        body: JSON.stringify({ userId: input.userId }),
        cache: "no-store",
    });

    const contentType = String(response.headers.get("content-type") || "").toLowerCase();
    if (!response.ok) {
        const body = await response.json().catch(() => ({})) as Record<string, unknown>;
        return {
            ok: false as const,
            status: response.status,
            code: String(body.code || ""),
            error: String(body.error || "Download failed."),
            openSubscriptions: String(body.code || "") === "PREMIUM_LISTENER_REQUIRED"
                || String(body.error || "").includes("Premium Listener"),
        };
    }

    if (contentType.includes("application/json")) {
        const body = await response.json().catch(() => ({})) as Record<string, unknown>;
        return {
            ok: false as const,
            status: response.status,
            code: String(body.code || "UNEXPECTED_JSON_DOWNLOAD"),
            error: String(body.error || "Download returned JSON instead of a media file."),
            openSubscriptions: false,
        };
    }

    const blob = await response.blob();
    const filename = parseFilenameFromContentDisposition(response.headers.get("content-disposition"))
        || (input.kind === "video" ? "video.mp4" : "track.mp3");
    triggerBrowserFileDownload(blob, filename);
    return {
        ok: true as const,
        status: response.status,
        filename,
    };
}
