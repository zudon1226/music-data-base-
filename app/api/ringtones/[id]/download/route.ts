import { NextResponse } from "next/server";
import { isAdminUserId } from "@/lib/admin-auth";
import { buyerHasPaidRingtonePurchase } from "@/lib/ringtone-access";
import { RINGTONE_DEVICE_TYPES, RINGTONE_STORAGE_BUCKETS, type RingtoneDeviceType } from "@/lib/ringtone-constants";
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
 * Issues a short-lived signed download URL only after paid purchase verification.
 * Owner/admin may request a signed URL for documented testing only (explicit flag).
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
            .select("id,creator_id,status,android_storage_path,iphone_storage_path,download_storage_path")
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
                error: "Downloadable ringtone file is not ready yet.",
                code: "FILE_NOT_READY",
            }, 409);
        }

        const signed = await supabase.storage
            .from(RINGTONE_STORAGE_BUCKETS.downloads)
            .createSignedUrl(storagePath, 60);
        if (signed.error || !signed.data?.signedUrl) {
            return json({ error: getErrorMessage(signed.error) || "Unable to sign download URL." }, 500);
        }

        if (purchase?.id) {
            await supabase.from("ringtone_downloads").insert({
                ringtone_id: ringtoneId,
                buyer_id: userId,
                purchase_id: purchase.id,
                device_type: deviceType,
            });
        }

        return json({
            signedUrl: signed.data.signedUrl,
            expiresInSeconds: 60,
            deviceType,
            purchaseId: purchase?.id || null,
            ownerTesting,
            creatorTesting,
            installation: deviceType === "iphone"
                ? {
                    summary: "Download the file, save it in Files, then use GarageBand to export a ringtone. This web app cannot set an iPhone ringtone directly.",
                    cannotSetDirectly: true,
                    steps: [
                        "Download the file",
                        "Save it in Files",
                        "Open GarageBand",
                        "Import the audio file",
                        "Share as Ringtone",
                        "Export",
                        "Select Standard Ringtone, Text Tone, or Assign to Contact",
                    ],
                }
                : {
                    summary: "Save the audio file, then assign it as a ringtone in your Android sound settings. Steps vary by manufacturer.",
                    cannotSetDirectly: false,
                    steps: [
                        "Download the audio file",
                        "Open your device Files or Downloads app",
                        "Move or keep the file in an accessible folder",
                        "Open Settings → Sound & vibration (or Sounds)",
                        "Choose Phone ringtone / Ringtone",
                        "Select the downloaded file if your manufacturer allows custom ringtones",
                    ],
                },
        });
    } catch (error) {
        console.error("[api/ringtones/:id/download] failed:", error);
        return json({ error: getErrorMessage(error) }, 500);
    }
}
