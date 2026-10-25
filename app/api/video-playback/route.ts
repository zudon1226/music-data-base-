import {
    evaluateVideoPlaybackAccess,
    resolveCatalogVideoForPlayback,
    resolveVideoPlaybackViewer,
    VideoPlaybackGuardError,
} from "@/lib/video-playback-guard";
import { proxyMediaStreamWithRange } from "@/lib/media-stream-range-proxy";
import { getErrorMessage, getSupabaseServerClient } from "@/lib/server-supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VIDEOS_BUCKET = "videos";

function videoContentType(path: string) {
    const ext = path.split(".").pop()?.toLowerCase();
    if (ext === "webm") return "video/webm";
    if (ext === "mov") return "video/quicktime";
    return "video/mp4";
}

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const path = searchParams.get("path") || "";
        const videoId = String(searchParams.get("videoId") || "").trim();
        const supabase = getSupabaseServerClient();
        const viewer = await resolveVideoPlaybackViewer(request);
        const catalog = await resolveCatalogVideoForPlayback(supabase, { videoId, rawPath: path });
        const access = evaluateVideoPlaybackAccess(catalog.video, viewer);

        if (!access.ok) {
            return Response.json({ error: access.error, code: access.code }, { status: 404 });
        }

        if (catalog.pathError || !catalog.storagePath) {
            return Response.json({
                error: "Video path does not match the catalog record.",
                code: catalog.pathError || "MISSING_PATH",
            }, { status: 400 });
        }
        const storagePath = catalog.storagePath;

        const signed = await supabase.storage.from(VIDEOS_BUCKET).createSignedUrl(storagePath, 120);
        if (signed.error || !signed.data?.signedUrl) {
            const message = getErrorMessage(signed.error) || "Video file could not be loaded.";
            return Response.json({ error: message, code: "VIDEO_FETCH_FAILED" }, { status: 404 });
        }

        const contentType = videoContentType(storagePath);
        const proxied = await proxyMediaStreamWithRange(signed.data.signedUrl, request, contentType);
        if (!proxied.ok) {
            return Response.json({ error: proxied.error, code: "VIDEO_FETCH_FAILED" }, { status: proxied.status === 404 ? 404 : 502 });
        }
        if (!proxied.body) {
            return Response.json({ error: "Video file could not be loaded.", code: "VIDEO_FETCH_FAILED" }, { status: 502 });
        }

        return new Response(proxied.body, {
            status: proxied.status,
            headers: proxied.headers,
        });
    }
    catch (error) {
        if (error instanceof VideoPlaybackGuardError) {
            return Response.json({ error: error.message, code: error.code }, { status: 503 });
        }
        console.error("[api/video-playback] server error:", error);
        return Response.json({
            error: error instanceof Error ? error.message : "Video file could not be loaded.",
        }, { status: 500 });
    }
}
