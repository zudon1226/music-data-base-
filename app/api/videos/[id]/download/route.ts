import { NextResponse } from "next/server";
import {
    authorizeMediaDownload,
    isDownloadEnabledFlag,
    recordMediaDownloadEvent,
} from "@/lib/media-download-auth";
import {
    buildMediaContentDisposition,
    buildMediaDownloadFilename,
    extensionFromStoragePath,
    mimeTypeForMediaExtension,
} from "@/lib/media-download-filename";
import { ACCESS_TOKEN_BODY_KEYS, getRecordString, requireMatchingUserId } from "@/lib/request-auth";
import { getErrorMessage, getSupabaseServerClient, isUuid } from "@/lib/server-supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VIDEOS_BUCKET = "videos";
const VIDEOS_PUBLIC_MARKER = `/storage/v1/object/public/${VIDEOS_BUCKET}/`;

function json(body: Record<string, unknown>, status = 200) {
    return NextResponse.json(body, { status });
}

function normalizeVideoStoragePath(rawPath: string | null | undefined) {
    return decodeURIComponent(String(rawPath || "").trim()).replace(/^\/+/, "");
}

function resolveVideoStoragePath(storagePath: string | null | undefined, videoUrl: string | null | undefined) {
    const normalized = normalizeVideoStoragePath(storagePath);
    if (normalized.includes("/")) return normalized;

    const cleanUrl = String(videoUrl || "").trim();
    if (!cleanUrl) return normalized;

    try {
        const url = new URL(cleanUrl);
        const markerIndex = url.href.indexOf(VIDEOS_PUBLIC_MARKER);
        if (markerIndex >= 0) {
            const path = url.href.slice(markerIndex + VIDEOS_PUBLIC_MARKER.length).split("?")[0] || "";
            return normalizeVideoStoragePath(decodeURIComponent(path));
        }
    } catch {
        const markerIndex = cleanUrl.indexOf(VIDEOS_PUBLIC_MARKER);
        if (markerIndex >= 0) {
            const path = cleanUrl.slice(markerIndex + VIDEOS_PUBLIC_MARKER.length).split("?")[0] || "";
            return normalizeVideoStoragePath(decodeURIComponent(path));
        }
    }
    return normalized;
}

type Params = { params: Promise<{ id: string }> };

/**
 * Paid-listener / owner / admin video download.
 * Streams one video attachment after server-side entitlement checks.
 * Never returns permanent public storage URLs.
 */
export async function POST(request: Request, context: Params) {
    try {
        const { id: videoId } = await context.params;
        if (!isUuid(videoId)) return json({ error: "Invalid video id.", code: "INVALID_ID" }, 400);

        const body = await request.json().catch(() => ({})) as Record<string, unknown>;
        const userId = String(body.userId || body.sessionUserId || "").trim();
        if (!userId || !isUuid(userId)) {
            return json({ error: "Authentication is required.", code: "AUTH_REQUIRED" }, 401);
        }

        const accessToken = getRecordString(body, ACCESS_TOKEN_BODY_KEYS);
        const auth = await requireMatchingUserId(request, "/api/videos/[id]/download", userId, { accessToken });
        if (!auth.ok) return json({ error: auth.error, code: "AUTH_REQUIRED" }, auth.status);

        const supabase = getSupabaseServerClient();
        let videoData: Record<string, unknown> | null = null;

        const videoResult = await supabase
            .from("videos")
            .select("id,title,user_id,artist_id,producer_id,producer_profile_id,storage_path,video_url,download_enabled")
            .eq("id", videoId)
            .maybeSingle();

        if (videoResult.error) {
            const missingColumn = /download_enabled/i.test(getErrorMessage(videoResult.error));
            if (!missingColumn) return json({ error: getErrorMessage(videoResult.error) }, 500);
            const fallback = await supabase
                .from("videos")
                .select("id,title,user_id,artist_id,producer_id,producer_profile_id,storage_path,video_url")
                .eq("id", videoId)
                .maybeSingle();
            if (fallback.error) return json({ error: getErrorMessage(fallback.error) }, 500);
            if (!fallback.data) return json({ error: "Video not found.", code: "NOT_FOUND" }, 404);
            videoData = { ...fallback.data, download_enabled: true };
        } else {
            videoData = videoResult.data;
        }

        if (!videoData) return json({ error: "Video not found.", code: "NOT_FOUND" }, 404);

        if (!isDownloadEnabledFlag(videoData.download_enabled)) {
            return json({
                error: "This video is not available for download.",
                code: "DOWNLOAD_DISABLED",
            }, 403);
        }

        const entitlement = await authorizeMediaDownload({
            userId,
            contentOwnerUserIds: [
                videoData.user_id as string,
                videoData.artist_id as string,
                videoData.producer_id as string,
                videoData.producer_profile_id as string,
            ],
        });
        if (!entitlement.ok) {
            return json({ error: entitlement.error, code: entitlement.code }, entitlement.status);
        }

        const storagePath = resolveVideoStoragePath(
            videoData.storage_path as string,
            videoData.video_url as string,
        );
        if (!storagePath) {
            return json({ error: "Downloadable video file was not found.", code: "FILE_NOT_FOUND" }, 404);
        }

        const downloaded = await supabase.storage.from(VIDEOS_BUCKET).download(storagePath);
        if (downloaded.error || !downloaded.data) {
            const message = getErrorMessage(downloaded.error) || "Unable to load video file.";
            const missing = /not found|does not exist|404|Object not found/i.test(message);
            return json({
                error: message,
                code: missing ? "FILE_NOT_FOUND" : "VIDEO_FETCH_FAILED",
            }, missing ? 404 : 500);
        }

        const bytes = Buffer.from(await downloaded.data.arrayBuffer());
        const filename = buildMediaDownloadFilename(videoData.title, storagePath, "video");
        const ext = extensionFromStoragePath(storagePath) || "mp4";
        const contentType = mimeTypeForMediaExtension(ext, "video");
        const contentDisposition = buildMediaContentDisposition(filename);

        await recordMediaDownloadEvent({
            userId,
            contentId: videoId,
            contentType: "video",
            filename,
            title: typeof videoData.title === "string" ? videoData.title : null,
            accessMode: entitlement.accessMode,
            planName: entitlement.planName,
            planSlug: entitlement.planSlug,
            deliveryStatus: "delivered",
        });

        return new NextResponse(bytes, {
            status: 200,
            headers: {
                "Content-Type": contentType,
                "Content-Disposition": contentDisposition,
                "Cache-Control": "private, no-store",
                "X-Content-Type-Options": "nosniff",
                "Content-Length": String(bytes.byteLength),
            },
        });
    } catch (error) {
        console.error("[api/videos/:id/download] failed:", error);
        return json({ error: getErrorMessage(error) }, 500);
    }
}
