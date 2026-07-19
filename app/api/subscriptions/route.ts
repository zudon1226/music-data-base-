import { NextResponse } from "next/server";
import {
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
