import { NextResponse } from "next/server";
import { isStripeMarketplaceWebhookConfigured } from "@/lib/billing/providers/stripe-rest";
import { processMarketplaceStripeWebhook } from "@/lib/marketplace-stripe-webhook";
import { getErrorMessage } from "@/lib/server-supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Stripe webhook for marketplace sales + ringtone purchase fulfillment. */
export async function POST(request: Request) {
    try {
        if (!isStripeMarketplaceWebhookConfigured()) {
            return NextResponse.json({ error: "Stripe marketplace webhook is not configured." }, { status: 503 });
        }
        const rawBody = await request.text();
        const signature = request.headers.get("stripe-signature");
        const result = await processMarketplaceStripeWebhook(rawBody, signature);
        return NextResponse.json(result);
    } catch (error) {
        console.error("[api/marketplace/webhooks/stripe] POST error:", error);
        const message = getErrorMessage(error);
        const unauthorized = /signature|timestamp/i.test(message);
        return NextResponse.json({ error: message }, { status: unauthorized ? 401 : 500 });
    }
}
