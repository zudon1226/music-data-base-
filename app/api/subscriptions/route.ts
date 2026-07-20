import { NextResponse } from "next/server";
import type { AccountSubscriptionAudience } from "@/lib/billing/constants";
import {
    activateFreeSubscriptionPlan,
    getBillingProviderCatalog,
    getCreatorBillingAccessForUser,
    getUserSubscription,
    listActiveSubscriptionPlans,
    listUserSubscriptionPayments,
} from "@/lib/billing/subscription-service";
import { requireMatchingUserId } from "@/lib/request-auth";
import { getErrorMessage, isUuid } from "@/lib/server-supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
    try {
        const url = new URL(request.url);
        const userId = url.searchParams.get("userId")?.trim() || "";
        const audience = url.searchParams.get("audience")?.trim() || "";

        if (userId) {
            if (!isUuid(userId)) {
                return NextResponse.json({ error: "Invalid userId." }, { status: 400 });
            }
            const auth = await requireMatchingUserId(request, "/api/subscriptions", userId);
            if (!auth.ok) {
                return NextResponse.json({ error: auth.error }, { status: auth.status });
            }
            const [subscription, access, payments, plans, providers] = await Promise.all([
                getUserSubscription(userId),
                getCreatorBillingAccessForUser(userId),
                listUserSubscriptionPayments(userId),
                listActiveSubscriptionPlans(audience || undefined),
                Promise.resolve(getBillingProviderCatalog()),
            ]);
            return NextResponse.json({
                ok: true,
                subscription,
                access,
                payments,
                plans,
                providers,
            });
        }

        const plans = await listActiveSubscriptionPlans(audience || undefined);
        return NextResponse.json({
            ok: true,
            plans,
            providers: getBillingProviderCatalog(),
        });
    } catch (error) {
        console.error("[api/subscriptions] GET error:", error);
        return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
    }
}

/** Activate free plans only. Paid plans must use /api/subscriptions/checkout. */
export async function POST(request: Request) {
    try {
        const body = await request.json().catch(() => ({})) as Record<string, unknown>;
        const userId = String(body.userId || "").trim();
        const action = String(body.action || "activate_free").trim().toLowerCase();
        const planId = String(body.planId || "").trim();
        const planSlug = String(body.planSlug || "").trim();
        const audience = String(body.audience || "").trim().toLowerCase() as AccountSubscriptionAudience;

        if (!userId || !isUuid(userId)) {
            return NextResponse.json({ error: "userId is required." }, { status: 400 });
        }
        if (!["listener", "artist", "producer"].includes(audience)) {
            return NextResponse.json({ error: "audience must be listener, artist, or producer." }, { status: 400 });
        }
        if (action !== "activate_free") {
            return NextResponse.json({ error: "Unsupported subscription action." }, { status: 400 });
        }

        const auth = await requireMatchingUserId(request, "/api/subscriptions", userId);
        if (!auth.ok) {
            return NextResponse.json({ error: auth.error }, { status: auth.status });
        }

        const result = await activateFreeSubscriptionPlan({
            userId,
            audience,
            planId: planId || undefined,
            planSlug: planSlug || undefined,
        });

        return NextResponse.json({
            ok: true,
            plan: result.plan,
            clientPlanSlug: result.clientPlanSlug,
            message: result.message,
            subscription: await getUserSubscription(userId),
        });
    } catch (error) {
        console.error("[api/subscriptions] POST error:", error);
        return NextResponse.json({ error: getErrorMessage(error) }, { status: 400 });
    }
}
