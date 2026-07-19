import { NextResponse } from "next/server";
import type { AccountSubscriptionAudience, PaymentProviderId } from "@/lib/billing/constants";
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
        const audience = String(body.audience || "").trim().toLowerCase() as AccountSubscriptionAudience;
        const provider = String(body.provider || "").trim().toLowerCase() as PaymentProviderId | "";
        const successUrl = String(body.successUrl || "").trim();
        const cancelUrl = String(body.cancelUrl || "").trim();
        const customerEmail = String(body.customerEmail || "").trim() || undefined;

        if (!userId || !isUuid(userId)) {
            return NextResponse.json({ error: "userId is required." }, { status: 400 });
        }
        if (!planId || !isUuid(planId)) {
            return NextResponse.json({ error: "planId is required." }, { status: 400 });
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
            planId,
            audience,
            provider: provider || undefined,
            successUrl,
            cancelUrl,
            customerEmail,
        });

        return NextResponse.json({ ok: true, ...result }, { status: 201 });
    } catch (error) {
        console.error("[api/subscriptions/checkout] POST error:", error);
        return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
    }
}
