import { NextResponse } from "next/server";
import { requirePodcastOwner } from "@/lib/podcast-access";
import { requirePodcastRequestCreator } from "@/lib/podcast-route-auth";
import { verifyPodcastStoredMedia } from "@/lib/podcast-storage-verification";
import { getErrorMessage, getSupabaseServerClient, isUuid } from "@/lib/server-supabase";
import {
    buildPodcastArtworkStoragePath,
    buildPodcastMediaStoragePath,
    getPodcastBucket,
    PODCAST_COVERS_BUCKET,
    validatePodcastArtworkDescriptor,
    validatePodcastMediaDescriptor,
} from "@/lib/podcast-validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonResponse(body: Record<string, unknown>, status = 200) {
    return NextResponse.json(body, { status });
}

function cleanText(value: unknown, maxLength: number) {
    return String(value || "").trim().slice(0, maxLength);
}

async function requireOwnedShow(showId: string, userId: string) {
    if (!isUuid(showId)) {
        return { ok: false as const, status: 400, error: "Choose a valid Podcast show." };
    }
    const result = await getSupabaseServerClient()
        .from("podcast_shows")
        .select("id,user_id")
        .eq("id", showId)
        .maybeSingle();
    if (result.error) return { ok: false as const, status: 500, error: getErrorMessage(result.error) };
    if (!result.data) return { ok: false as const, status: 404, error: "Podcast show not found." };
    const owner = await requirePodcastOwner(userId, result.data.user_id);
    if (!owner.ok) return owner;
    return { ok: true as const, ownerId: String(result.data.user_id) };
}

export async function POST(request: Request) {
    try {
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const auth = await requirePodcastRequestCreator(
            request,
            body,
            "/api/podcasts/uploads",
            { requireUploadUnlocked: true },
        );
        if (!auth.ok) return jsonResponse({ error: auth.error }, auth.status);
        const action = cleanText(body.action, 40);
        const fileName = cleanText(body.fileName || body.file_name, 300);
        const contentType = cleanText(body.contentType || body.content_type || body.mimeType, 150);
        const fileSize = Number(body.fileSize ?? body.file_size ?? 0);
        const podcastId = cleanText(body.podcastId || body.podcast_id, 100);
        const supabase = getSupabaseServerClient();

        if (action === "prepare-artwork") {
            const descriptor = validatePodcastArtworkDescriptor({ fileName, contentType, fileSize });
            if (!descriptor.ok) return jsonResponse({ error: descriptor.error }, 400);
            if (podcastId) {
                const show = await requireOwnedShow(podcastId, auth.userId);
                if (!show.ok) return jsonResponse({ error: show.error }, show.status);
                if (show.ownerId !== auth.userId) {
                    return jsonResponse({ error: "Upload artwork from the Podcast owner's account." }, 403);
                }
            }
            const storagePath = buildPodcastArtworkStoragePath({
                userId: auth.userId,
                podcastId: podcastId || undefined,
                fileName,
            });
            const signed = await supabase.storage
                .from(PODCAST_COVERS_BUCKET)
                .createSignedUploadUrl(storagePath, { upsert: false });
            if (signed.error || !signed.data?.token) {
                return jsonResponse({ error: getErrorMessage(signed.error || "Signed artwork upload unavailable.") }, 500);
            }
            return jsonResponse({
                bucket: PODCAST_COVERS_BUCKET,
                storagePath: signed.data.path || storagePath,
                token: signed.data.token,
                signedUrl: signed.data.signedUrl || "",
                publicUrl: supabase.storage.from(PODCAST_COVERS_BUCKET).getPublicUrl(storagePath).data.publicUrl,
                contentType: descriptor.contentType,
            });
        }

        if (action === "prepare-media") {
            const episodeType = body.episodeType === "video" || body.episode_type === "video" ? "video" : "audio";
            const descriptor = validatePodcastMediaDescriptor({ episodeType, fileName, contentType, fileSize });
            if (!descriptor.ok) return jsonResponse({ error: descriptor.error }, 400);
            const show = await requireOwnedShow(podcastId, auth.userId);
            if (!show.ok) return jsonResponse({ error: show.error }, show.status);
            if (show.ownerId !== auth.userId) {
                return jsonResponse({ error: "Upload media from the Podcast owner's account." }, 403);
            }
            const bucket = getPodcastBucket(episodeType);
            const storagePath = buildPodcastMediaStoragePath({
                userId: auth.userId,
                podcastId,
                episodeType,
                fileName,
            });
            const signed = await supabase.storage.from(bucket).createSignedUploadUrl(storagePath, { upsert: false });
            if (signed.error || !signed.data?.token) {
                return jsonResponse({ error: getErrorMessage(signed.error || "Signed Podcast upload unavailable.") }, 500);
            }
            return jsonResponse({
                bucket,
                storagePath: signed.data.path || storagePath,
                token: signed.data.token,
                signedUrl: signed.data.signedUrl || "",
                contentType: descriptor.contentType,
            });
        }

        if (action === "verify-media") {
            const episodeType = body.episodeType === "video" || body.episode_type === "video" ? "video" : "audio";
            const show = await requireOwnedShow(podcastId, auth.userId);
            if (!show.ok) return jsonResponse({ error: show.error }, show.status);
            const verification = await verifyPodcastStoredMedia({
                supabase,
                userId: show.ownerId,
                episodeType,
                storagePath: cleanText(body.storagePath || body.storage_path, 700),
                fileName,
                contentType,
                fileSize,
            });
            if (!verification.ok) return jsonResponse({ error: verification.error, verification }, 400);
            return jsonResponse({ ok: true, verification });
        }

        return jsonResponse({ error: "Unsupported Podcast upload action." }, 400);
    }
    catch (error) {
        console.error("[api/podcasts/uploads] POST failed:", error);
        return jsonResponse({ error: getErrorMessage(error) }, 500);
    }
}
