import { NextResponse } from "next/server";
import type { AccountSubscriptionAudience, PaymentProviderId } from "@/lib/billing/constants";
import { CHECKOUT_UNAVAILABLE_MESSAGE } from "@/lib/billing/constants";
import { startSubscriptionCheckout } from "@/lib/billing/subscription-service";
import { requireMatchingUserId } from "@/lib/request-auth";
import { getErrorMessage, isUuid } from "@/lib/server-supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
    try {
        const body = await request.json().catch(() => ({})) as Record<string, unknown>;
        const userId = String(body.userId || "").trim();
        const planId = String(body.planId || "").trim();
        const planSlug = String(body.planSlug || "").trim();
        const audience = String(body.audience || "").trim().toLowerCase() as AccountSubscriptionAudience;
        const provider = String(body.provider || "").trim().toLowerCase() as PaymentProviderId | "";
        const successUrl = String(body.successUrl || "").trim();
        const cancelUrl = String(body.cancelUrl || "").trim();
        const customerEmail = String(body.customerEmail || "").trim() || undefined;
        const clientPriceCents = body.priceCents != null || body.clientPriceCents != null
            ? Number(body.priceCents ?? body.clientPriceCents)
            : undefined;

        if (!userId || !isUuid(userId)) {
            return NextResponse.json({ error: "userId is required." }, { status: 400 });
        }
        if (!planId && !planSlug) {
            return NextResponse.json({ error: "planId or planSlug is required." }, { status: 400 });
        }
        if (planId && !isUuid(planId)) {
            return NextResponse.json({ error: "Invalid plan id." }, { status: 400 });
        }
        if (!["listener", "artist", "producer"].includes(audience)) {
            return NextResponse.json({ error: "audience must be listener, artist, or producer." }, { status: 400 });
        }
        if (!successUrl || !cancelUrl) {
            return NextResponse.json({ error: "successUrl and cancelUrl are required." }, { status: 400 });
        }

        const auth = await requireMatchingUserId(request, "/api/subscriptions/checkout", userId);
        if (!auth.ok) {
            return NextResponse.json({ error: auth.error }, { status: auth.status });
        }

        const result = await startSubscriptionCheckout({
            userId,
            planId: planId || undefined,
            planSlug: planSlug || undefined,
            audience,
            provider: provider || undefined,
            successUrl,
            cancelUrl,
            customerEmail,
            clientPriceCents: Number.isFinite(clientPriceCents) ? clientPriceCents : undefined,
        });

        return NextResponse.json({ ok: true, ...result }, { status: 201 });
    } catch (error) {
        console.error("[api/subscriptions/checkout] POST error:", error);
        const message = getErrorMessage(error);
        const unavailable = message === CHECKOUT_UNAVAILABLE_MESSAGE
            || /not configured/i.test(message);
        return NextResponse.json(
            { error: unavailable ? CHECKOUT_UNAVAILABLE_MESSAGE : message },
            { status: unavailable ? 503 : 400 },
        );
    }
}
