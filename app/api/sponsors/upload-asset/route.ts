import { NextResponse } from "next/server";
import {
    SPONSOR_ALLOWED_IMAGE_MIME_TYPES,
    SPONSOR_ASSET_MAX_BYTES,
    SPONSOR_STORAGE_BUCKET,
} from "@/lib/sponsor-constants";
import {
    buildSponsorAssetStoragePath,
    createSponsorAssetRecord,
    getSponsorApplication,
} from "@/lib/sponsor-service";
import { requireMatchingUserId } from "@/lib/request-auth";
import { getErrorMessage, getSupabaseServerClient, isUuid } from "@/lib/server-supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(body: Record<string, unknown>, status = 200) {
    return NextResponse.json(body, { status });
}

function extensionForMime(mimeType: string) {
    if (mimeType.includes("jpeg") || mimeType.includes("jpg")) return "jpg";
    if (mimeType.includes("png")) return "png";
    if (mimeType.includes("webp")) return "webp";
    if (mimeType.includes("gif")) return "gif";
    return "png";
}

export async function POST(request: Request) {
    try {
        const body = await request.json().catch(() => ({})) as Record<string, unknown>;
        const userId = String(body.userId || body.sessionUserId || "").trim();
        const applicationId = String(body.applicationId || "").trim();
        if (!userId || !isUuid(userId)) return json({ error: "userId is required." }, 400);
        if (!applicationId || !isUuid(applicationId)) return json({ error: "applicationId is required." }, 400);

        const auth = await requireMatchingUserId(request, "/api/sponsors/upload-asset", userId);
        if (!auth.ok) return json({ error: auth.error }, auth.status);

        const application = await getSponsorApplication(applicationId, userId);
        if (!application) return json({ error: "Application not found." }, 404);

        const mime = String(body.mimeType || body.contentType || "").trim().toLowerCase();
        if (!(SPONSOR_ALLOWED_IMAGE_MIME_TYPES as readonly string[]).includes(mime)) {
            return json({ error: "Unsupported image type.", allowed: SPONSOR_ALLOWED_IMAGE_MIME_TYPES }, 400);
        }
        const byteLength = Math.round(Number(body.byteLength ?? body.fileSize) || 0);
        if (byteLength <= 0 || byteLength > SPONSOR_ASSET_MAX_BYTES) {
            return json({ error: "Invalid file size.", maxBytes: SPONSOR_ASSET_MAX_BYTES }, 400);
        }

        const assetType = String(body.assetType || "logo").trim().toLowerCase();
        const storagePath = buildSponsorAssetStoragePath(userId, assetType, extensionForMime(mime));
        const supabase = getSupabaseServerClient();
        const signedUpload = await supabase.storage
            .from(SPONSOR_STORAGE_BUCKET)
            .createSignedUploadUrl(storagePath, { upsert: false });
        if (signedUpload.error || !signedUpload.data?.token) {
            return json({ error: getErrorMessage(signedUpload.error || "Signed upload failed.") }, 500);
        }

        const asset = await createSponsorAssetRecord({
            applicationId,
            userId,
            assetType,
            storagePath: signedUpload.data.path || storagePath,
            mimeType: mime,
            fileSizeBytes: byteLength,
            altText: String(body.altText || ""),
            destinationUrl: String(body.destinationUrl || ""),
        });

        return json({
            asset,
            bucket: SPONSOR_STORAGE_BUCKET,
            storagePath: signedUpload.data.path || storagePath,
            token: signedUpload.data.token,
            signedUrl: signedUpload.data.signedUrl || "",
            maxBytes: SPONSOR_ASSET_MAX_BYTES,
        }, 201);
    } catch (error) {
        console.error("[api/sponsors/upload-asset] POST failed:", error);
        return json({ error: getErrorMessage(error) }, 500);
    }
}
