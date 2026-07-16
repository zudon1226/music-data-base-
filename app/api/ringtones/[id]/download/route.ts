import { NextResponse } from "next/server";
import { isAdminUserId } from "@/lib/admin-auth";
import { buyerHasPaidRingtonePurchase } from "@/lib/ringtone-access";
import { RINGTONE_DEVICE_TYPES, RINGTONE_STORAGE_BUCKETS, type RingtoneDeviceType } from "@/lib/ringtone-constants";
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
        const purchase = await buyerHasPaidRingtonePurchase(userId, ringtoneId);

        if (!purchase && !ownerTesting) {
            return json({
                error: "Download requires a paid purchase for this ringtone.",
                code: "PURCHASE_REQUIRED",
            }, 403);
        }

        const storagePath = deviceType === "iphone"
            ? String(product.data.iphone_storage_path || product.data.download_storage_path || "")
            : String(product.data.android_storage_path || product.data.download_storage_path || "");

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
            installation: deviceType === "iphone"
                ? {
                    summary: "Use the Files app and GarageBand to install this ringtone on iPhone.",
                    cannotSetDirectly: true,
                }
                : {
                    summary: "Save the MP3 and assign it as a ringtone in Android sound settings.",
                    cannotSetDirectly: false,
                },
        });
    } catch (error) {
        console.error("[api/ringtones/:id/download] failed:", error);
        return json({ error: getErrorMessage(error) }, 500);
    }
}
