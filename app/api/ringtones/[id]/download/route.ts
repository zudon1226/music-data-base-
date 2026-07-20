import { NextResponse } from "next/server";
import { isAdminUserId } from "@/lib/admin-auth";
import { buyerHasPaidRingtonePurchase } from "@/lib/ringtone-access";
import { RINGTONE_DEVICE_TYPES, RINGTONE_STORAGE_BUCKETS, type RingtoneDeviceType } from "@/lib/ringtone-constants";
import {
    buildRingtoneContentDisposition,
    buildRingtoneDownloadFilename,
    mimeTypeForAudioExtension,
    extensionFromStoragePath,
} from "@/lib/ringtone-download-filename";
import { loadRevisionForPurchase } from "@/lib/ringtone-revisions";
import { requireMatchingUserId } from "@/lib/request-auth";
import { getErrorMessage, getSupabaseServerClient, isUuid } from "@/lib/server-supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(body: Record<string, unknown>, status = 200) {
    return NextResponse.json(body, { status });
}

type Params = { params: Promise<{ id: string }> };

/**
 * Ringtone download authorization + delivery.
 * - Android / other: stream one audio attachment with a title-based filename (no JSON body).
 * - iPhone: same secure audio attachment stream (no signed URL, no JSON success body).
 */
export async function POST(request: Request, context: Params) {
    try {
        const { id: ringtoneId } = await context.params;
        if (!isUuid(ringtoneId)) return json({ error: "Invalid ringtone id." }, 400);

        const body = await request.json().catch(() => ({})) as Record<string, unknown>;
        const userId = String(body.userId || body.sessionUserId || "").trim();
        const deviceTypeRaw = String(body.deviceType || "android").trim().toLowerCase();
        const deviceType = (RINGTONE_DEVICE_TYPES as readonly string[]).includes(deviceTypeRaw)
            ? deviceTypeRaw as RingtoneDeviceType
            : null;
        if (!deviceType) return json({ error: "deviceType must be iphone, android, or other." }, 400);
        if (!userId || !isUuid(userId)) return json({ error: "userId is required." }, 400);

        const auth = await requireMatchingUserId(request, "/api/ringtones/[id]/download", userId);
        if (!auth.ok) return json({ error: auth.error }, auth.status);

        const supabase = getSupabaseServerClient();
        const product = await supabase
            .from("ringtone_products")
            .select("id,creator_id,status,title,android_storage_path,iphone_storage_path,download_storage_path")
            .eq("id", ringtoneId)
            .maybeSingle();
        if (product.error) return json({ error: getErrorMessage(product.error) }, 500);
        if (!product.data) return json({ error: "Ringtone not found." }, 404);

        const isAdmin = await isAdminUserId(userId);
        const ownerTesting = isAdmin && body.ownerTesting === true;
        const creatorTesting = body.creatorTesting === true
            && String(product.data.creator_id || "") === userId;
        const purchase = await buyerHasPaidRingtonePurchase(userId, ringtoneId);

        if (!purchase && !ownerTesting && !creatorTesting) {
            return json({
                error: "Download requires a paid purchase for this ringtone.",
                code: "PURCHASE_REQUIRED",
            }, 403);
        }

        // Buyers keep the purchased revision files even if the product later revises.
        const purchasedRevision = purchase?.revision_id
            ? await loadRevisionForPurchase(String(purchase.revision_id))
            : null;
        const pathSource = purchasedRevision || product.data;

        const storagePath = deviceType === "iphone"
            ? String(pathSource.iphone_storage_path || pathSource.download_storage_path || "")
            : String(pathSource.android_storage_path || pathSource.download_storage_path || "");

        if (!storagePath) {
            return json({
                error: "Downloadable ringtone file was not found.",
                code: "FILE_NOT_FOUND",
            }, 404);
        }

        if (purchase?.id) {
            await supabase.from("ringtone_downloads").insert({
                ringtone_id: ringtoneId,
                buyer_id: userId,
                purchase_id: purchase.id,
                device_type: deviceType,
            });
        }

        // --- Android: stream one audio file with a readable Content-Disposition filename ---
        if (deviceType === "android" || deviceType === "other") {
            const downloaded = await supabase.storage
                .from(RINGTONE_STORAGE_BUCKETS.downloads)
                .download(storagePath);
            if (downloaded.error || !downloaded.data) {
                return json({
                    error: getErrorMessage(downloaded.error) || "Unable to load ringtone audio.",
                    code: "AUDIO_FETCH_FAILED",
                }, 500);
            }

            const bytes = Buffer.from(await downloaded.data.arrayBuffer());
            const filename = buildRingtoneDownloadFilename(product.data.title, storagePath);
            const ext = extensionFromStoragePath(storagePath);
            const contentType = mimeTypeForAudioExtension(ext);
            const contentDisposition = buildRingtoneContentDisposition(filename);

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
        }

        // --- iPhone: stream one audio attachment (no signed URL, no JSON success body) ---
        const downloaded = await supabase.storage
            .from(RINGTONE_STORAGE_BUCKETS.downloads)
            .download(storagePath);
        if (downloaded.error || !downloaded.data) {
            const message = getErrorMessage(downloaded.error) || "Unable to load ringtone audio.";
            const missing = /not found|does not exist|404|Object not found/i.test(message);
            return json({
                error: message,
                code: missing ? "FILE_NOT_FOUND" : "AUDIO_FETCH_FAILED",
            }, missing ? 404 : 500);
        }

        const bytes = Buffer.from(await downloaded.data.arrayBuffer());
        const filename = buildRingtoneDownloadFilename(product.data.title, storagePath);
        const ext = extensionFromStoragePath(storagePath);
        const contentType = mimeTypeForAudioExtension(ext);
        const contentDisposition = buildRingtoneContentDisposition(filename);

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
        console.error("[api/ringtones/:id/download] failed:", error);
        return json({ error: getErrorMessage(error) }, 500);
    }
}
