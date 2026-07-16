import { NextResponse } from "next/server";
import {
    confirmRingtonePurchasePayment,
    createRingtonePurchaseIntent,
} from "@/lib/ringtone-purchase";
import { requireMatchingUserId } from "@/lib/request-auth";
import { getErrorMessage, isUuid } from "@/lib/server-supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(body: Record<string, unknown>, status = 200) {
    return NextResponse.json(body, { status });
}

type Params = { params: Promise<{ id: string }> };

/**
 * Create a ringtone purchase intent (or complete free acquisition).
 * Price/fees/status are server-resolved; client amounts are ignored.
 */
export async function POST(request: Request, context: Params) {
    try {
        const { id: ringtoneId } = await context.params;
        if (!isUuid(ringtoneId)) return json({ error: "Invalid ringtone id." }, 400);

        const body = await request.json().catch(() => ({})) as Record<string, unknown>;
        const userId = String(body.userId || body.sessionUserId || "").trim();
        if (!userId || !isUuid(userId)) return json({ error: "userId is required." }, 400);

        const auth = await requireMatchingUserId(request, "/api/ringtones/[id]/purchase", userId);
        if (!auth.ok) return json({ error: auth.error }, auth.status);

        // Ignore any client-supplied amount/currency/creator/status/fee fields.
        const result = await createRingtonePurchaseIntent({
            buyerId: userId,
            ringtoneId,
            idempotencyKey: String(body.idempotencyKey || "").trim() || undefined,
        });
        if (!result.ok) {
            return json({
                error: result.error,
                code: "code" in result ? result.code : undefined,
            }, result.status || 400);
        }

        const purchase = result.purchase;
        const status = String(purchase.payment_status);

        if (result.alreadyOwned && status === "paid" && !("freeAcquisition" in result && result.freeAcquisition)) {
            return json({
                state: "already_owned",
                purchase,
                ringtone: {
                    id: result.ringtone.id,
                    title: result.ringtone.title,
                    artwork_url: result.ringtone.artwork_url,
                    preview_url: result.ringtone.preview_url,
                    duration_seconds: result.ringtone.duration_seconds,
                    price_cents: result.ringtone.price_cents,
                    currency: result.ringtone.currency,
                },
                message: "You already own this ringtone.",
            });
        }

        if ("freeAcquisition" in result && result.freeAcquisition) {
            return json({
                state: "free_acquisition_completed",
                purchase,
                ringtone: {
                    id: result.ringtone.id,
                    title: result.ringtone.title,
                    artwork_url: result.ringtone.artwork_url,
                    preview_url: result.ringtone.preview_url,
                    duration_seconds: result.ringtone.duration_seconds,
                    price_cents: result.ringtone.price_cents,
                    currency: result.ringtone.currency,
                },
                message: "Free ringtone added to your library.",
            }, 201);
        }

        return json({
            state: "payment_pending",
            purchase,
            ringtone: {
                id: result.ringtone.id,
                title: result.ringtone.title,
                artwork_url: result.ringtone.artwork_url,
                preview_url: result.ringtone.preview_url,
                duration_seconds: result.ringtone.duration_seconds,
                price_cents: result.ringtone.price_cents,
                currency: result.ringtone.currency,
            },
            requiresPayment: true,
            testModeAvailable: process.env.RINGTONE_PAYMENTS_TEST_MODE === "1",
            message: "Purchase intent created. Complete payment to unlock downloads.",
        }, 201);
    } catch (error) {
        console.error("[api/ringtones/:id/purchase] POST failed:", error);
        return json({ error: getErrorMessage(error) }, 500);
    }
}

/** Confirm, fail, or cancel a pending purchase after provider verification / test-mode. */
export async function PATCH(request: Request, context: Params) {
    try {
        const { id: ringtoneId } = await context.params;
        if (!isUuid(ringtoneId)) return json({ error: "Invalid ringtone id." }, 400);

        const body = await request.json().catch(() => ({})) as Record<string, unknown>;
        const userId = String(body.userId || body.sessionUserId || "").trim();
        const purchaseId = String(body.purchaseId || "").trim();
        if (!userId || !isUuid(userId)) return json({ error: "userId is required." }, 400);
        if (!purchaseId || !isUuid(purchaseId)) return json({ error: "purchaseId is required." }, 400);

        const auth = await requireMatchingUserId(request, "/api/ringtones/[id]/purchase", userId);
        if (!auth.ok) return json({ error: auth.error }, auth.status);

        const result = await confirmRingtonePurchasePayment({
            buyerId: userId,
            purchaseId,
            provider: String(body.provider || ""),
            paymentReference: String(body.paymentReference || ""),
            outcome: body.outcome === "failed" || body.outcome === "cancelled" ? body.outcome : "paid",
        });
        if (!result.ok) {
            return json({
                error: result.error,
                code: "code" in result ? result.code : undefined,
            }, result.status || 400);
        }

        const status = String(result.purchase.payment_status);
        const state = status === "paid"
            ? (result.alreadyOwned ? "already_owned" : "payment_completed")
            : status === "cancelled"
                ? "payment_canceled"
                : status === "failed"
                    ? "payment_failed"
                    : "payment_pending";

        return json({
            state,
            purchase: result.purchase,
            ringtoneId,
            message: state === "payment_completed"
                ? "Payment completed. Downloads are unlocked."
                : state === "already_owned"
                    ? "You already own this ringtone."
                    : state === "payment_canceled"
                        ? "Payment was canceled."
                        : state === "payment_failed"
                            ? "Payment failed. You can retry."
                            : "Payment is still pending.",
        });
    } catch (error) {
        console.error("[api/ringtones/:id/purchase] PATCH failed:", error);
        return json({ error: getErrorMessage(error) }, 500);
    }
}
