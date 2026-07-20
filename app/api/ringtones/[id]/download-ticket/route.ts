import { NextResponse } from "next/server";
import { isAdminUserId } from "@/lib/admin-auth";
import { buyerHasPaidRingtonePurchase } from "@/lib/ringtone-access";
import {
    buildRingtoneDownloadFilename,
    extensionFromStoragePath,
    mimeTypeForAudioExtension,
} from "@/lib/ringtone-download-filename";
import { createRingtoneDownloadTicket } from "@/lib/ringtone-download-ticket";
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
 * Authenticated iPhone download ticket issuance.
 * Returns only a same-origin ticket URL — never a Supabase storage URL.
 */
export async function POST(request: Request, context: Params) {
    try {
        const { id: ringtoneId } = await context.params;
        if (!isUuid(ringtoneId)) return json({ error: "Invalid ringtone id." }, 400);

        const body = await request.json().catch(() => ({})) as Record<string, unknown>;
        const userId = String(body.userId || body.sessionUserId || "").trim();
        if (!userId || !isUuid(userId)) return json({ error: "userId is required." }, 400);

        const auth = await requireMatchingUserId(request, "/api/ringtones/[id]/download-ticket", userId);
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

        const purchasedRevision = purchase?.revision_id
            ? await loadRevisionForPurchase(String(purchase.revision_id))
            : null;
        const pathSource = purchasedRevision || product.data;
        const storagePath = String(
            pathSource.iphone_storage_path || pathSource.download_storage_path || "",
        );
        if (!storagePath) {
            return json({
                error: "Downloadable ringtone file was not found.",
                code: "FILE_NOT_FOUND",
            }, 404);
        }

        const filename = buildRingtoneDownloadFilename(product.data.title, storagePath);
        const ext = extensionFromStoragePath(storagePath);
        const contentType = mimeTypeForAudioExtension(ext);

        const ticket = await createRingtoneDownloadTicket({
            userId,
            ringtoneId,
            purchaseId: purchase?.id || null,
            storagePath,
            filename,
            contentType,
        });

        return json({
            ok: true,
            downloadUrl: ticket.downloadUrl,
            expiresInSeconds: ticket.expiresInSeconds,
            // Never return storage path, service keys, or raw object locations.
        }, 201);
    } catch (error) {
        console.error("[api/ringtones/:id/download-ticket] failed:", error);
        return json({ error: getErrorMessage(error) }, 500);
    }
}
