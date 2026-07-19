import { NextResponse } from "next/server";
import type { PaymentProviderId } from "@/lib/billing/constants";
import { getPaymentProvider } from "@/lib/billing/payment-provider";
import {
    applyFailedPayment,
    applySuccessfulPayment,
    cancelSubscriptionRenewal,
    getUserSubscription,
} from "@/lib/billing/subscription-service";
import { getErrorMessage, getSupabaseServerClient, isUuid } from "@/lib/server-supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ provider: string }> };

export async function POST(request: Request, context: Params) {
    try {
        const { provider: providerParam } = await context.params;
        const providerId = String(providerParam || "").trim().toLowerCase() as PaymentProviderId;
        if (!["stripe", "paypal", "test"].includes(providerId)) {
            return NextResponse.json({ error: "Unsupported provider." }, { status: 400 });
        }

        const rawBody = await request.text();
        const signature = request.headers.get("stripe-signature")
            || request.headers.get("paypal-transmission-sig")
            || request.headers.get("x-billing-signature");

        const provider = getPaymentProvider(providerId);
        const event = await provider.parseWebhook(rawBody, signature);

        const supabase = getSupabaseServerClient();
        let userId = event.userId || "";
        let subscriptionId = "";

        if (!userId && event.providerSubscriptionId) {
            const { data } = await supabase
                .from("subscriptions")
                .select("id,user_id")
                .eq("provider_subscription_id", event.providerSubscriptionId)
                .maybeSingle();
            if (data) {
                userId = data.user_id;
                subscriptionId = data.id;
            }
        }

        if (!userId || !isUuid(userId)) {
            return NextResponse.json({ ok: true, ignored: true, reason: "No matching user." });
        }

        if (!subscriptionId) {
            const subscription = await getUserSubscription(userId);
            subscriptionId = subscription?.id || "";
        }
        if (!subscriptionId) {
            return NextResponse.json({ ok: true, ignored: true, reason: "No subscription." });
        }

        if (event.status === "succeeded") {
            await applySuccessfulPayment({
                userId,
                subscriptionId,
                providerPaymentId: event.providerPaymentId || `wh_${Date.now()}`,
                providerSubscriptionId: event.providerSubscriptionId,
                amountCents: event.amountCents || 0,
                currency: event.currency || "USD",
                provider: providerId,
            });
        } else if (event.status === "failed") {
            await applyFailedPayment({
                userId,
                subscriptionId,
                providerPaymentId: event.providerPaymentId,
                provider: providerId,
                failureMessage: event.eventType,
            });
        } else if (event.status === "cancelled") {
            await cancelSubscriptionRenewal(userId);
        }

        return NextResponse.json({ ok: true, eventType: event.eventType });
    } catch (error) {
        console.error("[api/subscriptions/webhooks] POST error:", error);
        return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
    }
}
