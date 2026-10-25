import {
    evaluateModerationMediaPreviewAccess,
    logModerationMediaPreviewAccess,
    resolveModerationPreviewViewer,
    type ModerationPreviewMediaType,
} from "@/lib/moderation-media-preview";
import { normalizeVideoStoragePath } from "@/lib/canonical-video";
import { proxyMediaStreamWithRange } from "@/lib/media-stream-range-proxy";
import { normalizeSongStoragePath, resolveSongStoragePath, SONGS_BUCKET } from "@/lib/song-storage-path";
import { getErrorMessage, getSupabaseServerClient, isUuid } from "@/lib/server-supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VIDEOS_BUCKET = "videos";

function audioContentType(path: string) {
    const extension = path.split(".").pop()?.toLowerCase();
    if (extension === "wav") return "audio/wav";
    if (extension === "m4a") return "audio/mp4";
    return "audio/mpeg";
}

function videoContentType(path: string) {
    const extension = path.split(".").pop()?.toLowerCase();
    if (extension === "webm") return "video/webm";
    if (extension === "mov") return "video/quicktime";
    return "video/mp4";
}

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const mediaType = String(searchParams.get("mediaType") || searchParams.get("type") || "").trim().toLowerCase();
        const mediaId = String(searchParams.get("mediaId") || searchParams.get("id") || "").trim();
        if (mediaType !== "song" && mediaType !== "video") {
            return Response.json({ error: "mediaType must be song or video.", code: "INVALID_TYPE" }, { status: 400 });
        }
        if (!isUuid(mediaId)) {
            return Response.json({ error: "Valid mediaId is required.", code: "INVALID_ID" }, { status: 400 });
        }

        const viewer = await resolveModerationPreviewViewer(request);
        const supabase = getSupabaseServerClient();
        const table = mediaType === "song" ? "songs" : "videos";
        const select = mediaType === "song"
            ? "id,user_id,storage_path,audio_url,moderation_state"
            : "id,user_id,storage_path,video_url,moderation_state";

        const { data, error } = await supabase.from(table).select(select).eq("id", mediaId).maybeSingle();
        if (error) {
            return Response.json({ error: getErrorMessage(error), code: "CATALOG_ERROR" }, { status: 500 });
        }

        const access = evaluateModerationMediaPreviewAccess(
            data as Record<string, unknown> | null,
            viewer,
            mediaType as ModerationPreviewMediaType,
        );
        if (!access.ok) {
            const status = access.code === "AUTH_REQUIRED"
                ? 401
                : access.code === "FORBIDDEN"
                    ? 403
                    : access.code === "USE_STANDARD_PLAYBACK"
                        ? 400
                        : 404;
            return Response.json({ error: access.error, code: access.code }, { status });
        }

        const record = data as Record<string, unknown>;
        const storagePath = mediaType === "song"
            ? resolveSongStoragePath(
                String(record.storage_path || ""),
                String(record.audio_url || ""),
            )
            : normalizeVideoStoragePath(String(record.storage_path || record.video_url || ""));
        if (!storagePath) {
            return Response.json({ error: "Missing storage path.", code: "MISSING_PATH" }, { status: 404 });
        }

        logModerationMediaPreviewAccess({
            route: "/api/moderation/media-preview",
            mediaType: mediaType as ModerationPreviewMediaType,
            mediaId,
            viewerUserId: viewer.userId,
            moderationState: String(record.moderation_state || ""),
            reason: access.reason,
        });

        const bucket = mediaType === "song" ? SONGS_BUCKET : VIDEOS_BUCKET;
        const normalizedPath = mediaType === "song" ? normalizeSongStoragePath(storagePath) : storagePath;
        const signed = await supabase.storage.from(bucket).createSignedUrl(normalizedPath, 120);
        if (signed.error || !signed.data?.signedUrl) {
            return Response.json({
                error: getErrorMessage(signed.error) || "Media file could not be loaded.",
                code: "MEDIA_FETCH_FAILED",
            }, { status: 404 });
        }

        if (mediaType === "video") {
            const proxied = await proxyMediaStreamWithRange(signed.data.signedUrl, request, videoContentType(normalizedPath));
            if (!proxied.ok || !proxied.body) {
                return Response.json({ error: proxied.error || "Video file could not be loaded.", code: "MEDIA_FETCH_FAILED" }, { status: proxied.status === 404 ? 404 : 502 });
            }
            return new Response(proxied.body, { status: proxied.status, headers: proxied.headers });
        }

        const upstream = await fetch(signed.data.signedUrl, { cache: "no-store" });
        if (!upstream.ok || !upstream.body) {
            return Response.json({ error: "Audio file could not be loaded.", code: "MEDIA_FETCH_FAILED" }, { status: 502 });
        }
        return new Response(upstream.body, {
            headers: {
                "Content-Type": upstream.headers.get("content-type") || audioContentType(normalizedPath),
                "Cache-Control": "private, no-store",
            },
        });
    }
    catch (error) {
        console.error("[api/moderation/media-preview] server error:", error);
        return Response.json({
            error: error instanceof Error ? error.message : "Media preview could not be loaded.",
        }, { status: 500 });
    }
}
