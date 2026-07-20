import { NextResponse } from "next/server";
import type { PaymentProviderId } from "@/lib/billing/constants";
import { isBillingTestProviderAllowed } from "@/lib/billing/env";
import { getPaymentProvider } from "@/lib/billing/payment-provider";
import {
    applyFailedPayment,
    applySuccessfulPayment,
    cancelSubscriptionRenewal,
    getSubscriptionPlanById,
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
        if (providerId === "test" && !isBillingTestProviderAllowed()) {
            return NextResponse.json({ error: "Test billing webhooks are disabled in production." }, { status: 403 });
        }

        const rawBody = await request.text();
        const signature = request.headers.get("stripe-signature")
            || request.headers.get("paypal-transmission-sig")
            || request.headers.get("x-billing-signature");

        const provider = getPaymentProvider(providerId);
        if (providerId !== "test" && !provider.isConfigured()) {
            return NextResponse.json({ error: "Payment provider is not configured." }, { status: 503 });
        }

        const event = await provider.parseWebhook(rawBody, signature);
        if (!event.status) {
            return NextResponse.json({ ok: true, ignored: true, reason: "Unhandled event type.", eventType: event.eventType });
        }

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

        if (!userId && event.customerId) {
            const { data } = await supabase
                .from("subscriptions")
                .select("id,user_id")
                .eq("provider_customer_id", event.customerId)
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

        if (event.planId) {
            const approvedPlan = await getSubscriptionPlanById(event.planId);
            if (!approvedPlan || !approvedPlan.active) {
                return NextResponse.json({ error: "Webhook plan id is not an approved plan." }, { status: 400 });
            }
        }

        if (event.status === "succeeded") {
            const result = await applySuccessfulPayment({
                userId,
                subscriptionId,
                providerPaymentId: event.providerPaymentId || `wh_${Date.now()}`,
                providerSubscriptionId: event.providerSubscriptionId,
                amountCents: event.amountCents || 0,
                currency: event.currency || "USD",
                provider: providerId,
                planId: event.planId,
                customerId: event.customerId,
            });
            return NextResponse.json({ ok: true, eventType: event.eventType, duplicate: Boolean(result.duplicate) });
        }

        if (event.status === "failed") {
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
        const message = getErrorMessage(error);
        const unauthorized = /signature|timestamp/i.test(message);
        return NextResponse.json({ error: message }, { status: unauthorized ? 401 : 500 });
    }
}
