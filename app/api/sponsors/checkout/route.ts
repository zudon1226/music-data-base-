import { NextResponse } from "next/server";
import { startSponsorStripeCheckout } from "@/lib/sponsor-stripe-checkout";
import {
    getPublicBetaSponsorCheckoutMessage,
    isPublicBetaSponsorCheckoutLocked,
} from "@/lib/public-beta-sponsor-checkout";
import { requireMatchingUserId } from "@/lib/request-auth";
import { getErrorMessage, isUuid } from "@/lib/server-supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(body: Record<string, unknown>, status = 200) {
    return NextResponse.json(body, { status });
}

export async function POST(request: Request) {
    try {
        const body = await request.json().catch(() => ({})) as Record<string, unknown>;
        const userId = String(body.userId || body.sessionUserId || "").trim();
        const applicationId = String(body.applicationId || "").trim();
        if (!userId || !isUuid(userId)) return json({ error: "userId is required." }, 400);
        if (!applicationId || !isUuid(applicationId)) return json({ error: "applicationId is required." }, 400);

        const auth = await requireMatchingUserId(request, "/api/sponsors/checkout", userId);
        if (!auth.ok) return json({ error: auth.error }, auth.status);

        const result = await startSponsorStripeCheckout({
            userId,
            applicationId,
            successUrl: String(body.successUrl || "").trim() || undefined,
            cancelUrl: String(body.cancelUrl || "").trim() || undefined,
            customerEmail: String(body.customerEmail || "").trim() || undefined,
        });
        if (!result.ok) {
            return json({
                error: result.error,
                code: "code" in result ? result.code : undefined,
                publicBetaSponsorCheckoutLocked: isPublicBetaSponsorCheckoutLocked(),
                publicBetaSponsorCheckoutMessage: getPublicBetaSponsorCheckoutMessage(),
            }, result.status || 400);
        }
        return json({
            checkoutUrl: result.checkoutUrl,
            sessionId: result.sessionId,
            application: result.application,
            amountCents: result.amountCents,
        }, 201);
    } catch (error) {
        console.error("[api/sponsors/checkout] POST failed:", error);
        return json({ error: getErrorMessage(error) }, 500);
    }
}
